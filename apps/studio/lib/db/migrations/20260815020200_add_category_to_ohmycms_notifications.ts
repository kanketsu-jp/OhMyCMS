import type { Knex } from "knex";

/**
 * お知らせを「あなた宛」と「システム関係」に分ける。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「お知らせページでは最初にタブで『**あなた宛**』『**システム関係**』があり、
 * >   **あなた宛がデフォルト**。システム関係はアップデートのことなど。
 * >   あくまでこれはお知らせ一覧なので、『不具合に返信がありました』や
 * >   『不具合が解決しました』などから『報告一覧』の**その報告チャットへ遷移**する。」
 *
 * ── なぜ表を分けないか ──
 *
 * 「システム関係」も**受け取る人ごとに既読が要る**（誰が読んだかは人ごとに違う）。
 * 表を分けると、既読・未読件数・一覧の並びを 2 通り実装して、
 * **2 箇所を同じように直し続ける**ことになる。1 表 ＋ 区分の列で足りる。
 *
 * 🚨 既定は `personal`。既存の通知（ポリシー付与・報告受付）は**すべて宛先個人あて**なので、
 *    既定値のままで正しい区分に入る。移し替えは要らない。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_notifications", (table) => {
    // personal = あなた宛 / system = システム関係（更新のお知らせなど）
    table.string("category", 16).notNullable().defaultTo("personal");
    // タブは必ず「自分宛 ＋ 区分」で絞るので、その形に索引を張る。
    // 🚨 既存の (recipient, read_at) は未読件数のバッジが使うので**消さない**。
    table.index(["recipient", "category"], "ohmycms_notifications_category_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_notifications", (table) => {
    table.dropIndex(["recipient", "category"], "ohmycms_notifications_category_idx");
    table.dropColumn("category");
  });
}
