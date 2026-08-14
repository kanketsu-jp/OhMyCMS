import type { Knex } from "knex";

/**
 * ファイル・フォルダに付けるラベルと、フォルダの色。
 *
 * 命名: **新しいテーブルは `ohmycms_` 接頭辞**（既存の ohmycms_settings 等に合わせる）。
 *       **既存テーブルへの列追加は接頭辞なし**（directus_folders.color。Directus の慣習に合わせる。
 *       [[storage-key-prefix-is-fixed]] を書いたときと同じ判断）。
 *
 * ■ ラベルを「割り当てテーブル」にした理由
 * ファイルとフォルダの**両方**に付く（要件）。`directus_files` と `directus_folders` に
 * それぞれ列を持たせると、**ラベルを1つ消すたびに2箇所を直す**ことになる。
 * 対象の種類を持つ1本の割り当て表にすると、**種類が増えても表は増えない**。
 *
 * ■ 🚨 システムラベル（ユーザーが消せないもの）について
 * 要件は「**複数シナリオで汎用的に必要なものを先に定義しておく**」。
 * ただし**使われる当てのないものを並べても腐る**ので、**根拠のあるものだけ**入れた:
 *
 *   `source_missing` … 取り込み元が消えた（要件が挙げている Google ドライブのリンク切れ等）
 *   `unreadable`     … ファイルとして読めない。🚨 2026-08-14 に実際に踏んだ
 *                       （ヘッダは読めるのに画素が壊れた PNG。圧縮版もぼかしも作れない）
 *   `imported`       … 外部から取り込んだもの。取り込み元の情報を持つ行の目印
 *
 * 🚨 **付与する処理はまだ無い**（Drive 連携は保留のため）。ここでは**定義だけ**を先に置く。
 *    後から足すときに `system_key` で機械的に引けるようにしてある。
 */
export async function up(knex: Knex): Promise<void> {
  // フォルダの色。値は Tailwind のトークン名を入れる想定（#rrggbb を持たせない）。
  // 🚨 生の色コードを持つと、テーマを変えたときに**フォルダだけ取り残される**。
  await knex.schema.alterTable("directus_folders", (table) => {
    table.string("color", 32);
  });

  await knex.schema.createTable("ohmycms_labels", (table) => {
    table.uuid("id").primary();
    table.string("name", 100).notNullable();
    // フォルダの色と同じ理由でトークン名を入れる。
    table.string("color", 32);
    // 🚨 true は**利用者が消せない・名前を変えられない**。判定はアプリ側で行う。
    table.boolean("is_system").notNullable().defaultTo(false);
    // 機械が引くための鍵。システムラベルだけが持つ。
    table.string("system_key", 64).unique();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid("created_by").references("id").inTable("directus_users").onDelete("SET NULL");
    // 同じ名前のラベルを2つ作らせない（探すときに混ざるため）。
    table.unique(["name"]);
  });

  await knex.schema.createTable("ohmycms_label_assignments", (table) => {
    table
      .uuid("label_id")
      .notNullable()
      .references("id")
      .inTable("ohmycms_labels")
      .onDelete("CASCADE");
    // 'file' | 'folder'。種類が増えてもこの表のまま扱える。
    table.string("target_type", 16).notNullable();
    table.uuid("target_id").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid("created_by").references("id").inTable("directus_users").onDelete("SET NULL");
    // 同じ対象に同じラベルを2回付けない。
    table.primary(["label_id", "target_type", "target_id"]);
    // 「この対象に付いているラベル」を引く経路（一覧の表示で毎回使う）。
    table.index(["target_type", "target_id"], "ohmycms_label_assignments_target_idx");
  });

  // 🚨 外部キーを張らない理由: target_id は directus_files と directus_folders の
  //    **どちらも指す**ので、1本の外部キーでは表せない。
  //    代わりに、対象が消えたときの後片付けをアプリ側（削除処理）で行う。
  //    ここを忘れると**消えたファイルのラベルが残り続ける**ので、削除の実装で必ず消すこと。

  const now = new Date().toISOString();
  await knex("ohmycms_labels").insert([
    {
      id: knex.raw("gen_random_uuid()"),
      name: "取り込み元が見つかりません",
      color: "amber",
      is_system: true,
      system_key: "source_missing",
      created_at: now,
    },
    {
      id: knex.raw("gen_random_uuid()"),
      name: "ファイルが壊れています",
      color: "red",
      is_system: true,
      system_key: "unreadable",
      created_at: now,
    },
    {
      id: knex.raw("gen_random_uuid()"),
      name: "外部から取り込み",
      color: "sky",
      is_system: true,
      system_key: "imported",
      created_at: now,
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ohmycms_label_assignments");
  await knex.schema.dropTableIfExists("ohmycms_labels");
  await knex.schema.alterTable("directus_folders", (table) => {
    table.dropColumn("color");
  });
}
