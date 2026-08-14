/**
 * ラベルの実測ハーネス（サービス層）。
 *
 *   bun --filter @ohmycms/studio verify:labels
 *
 * 🚨 **HTTP 経由ではない**。route handler は薄い（lib を呼ぶだけ）ので、判断が入る所を
 *    サービス層で測る。**HTTP の往復は受入（sdk）側で測ってもらう**。
 *
 * 測るもの:
 *   🟢 一覧が返る（システムラベル3件が入っている）
 *   🟢 作れる / 直せる
 *   🔴 🚨 **同じ名前を2つ作れない**
 *   🔴 🚨 **システムラベルは削除できない**（403。404 にしない）
 *   🟢 対象への付け外しが**置き換え**として効く
 *   🔴 🚨 **存在しないラベル ID を黙って捨てない**
 *   🔴 🚨 **対象を消したら割り当ても消える**（外部キーが張れないので、消し忘れると残る）
 */
import { randomUUID } from "node:crypto";
import type { Actor } from "../lib/auth/context";
import { db } from "../lib/db/knex";
import {
  createLabel,
  deleteLabel,
  labelsForTarget,
  listLabels,
  removeLabelsForTarget,
  setLabelsForTarget,
  updateLabel,
} from "../lib/labels/service";

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

/** 例外を「起きたこと」として扱えるようにする（起きなければ null）。 */
async function caught(fn: () => Promise<unknown>): Promise<{ status?: number; code?: string } | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const e = error as { status?: number; code?: string };
    return { status: e.status, code: e.code };
  }
}

/**
 * 🚨 **消えた対象を指したままの割り当て（孤児）を検出する。**
 *
 * 割り当てには外部キーを張れない（target_id がファイルとフォルダのどちらも指すため）。
 * つまり **削除パスで消し忘れると、誰も気づかないまま残る**。
 *
 * 🚨 **「0 件でした」だけでは意味がない**（異常が無い 0 と、見ていない 0 は同じ見た目）。
 *    そこで **わざと孤児を 1 件作って、検出できることを確かめてから**、実データを数える。
 */
async function orphanCheck(): Promise<void> {
  const label = await db("ohmycms_labels").select("id").first();
  if (!label) {
    check("孤児: 検出できることを確かめた", false, "ラベルが1件も無く、確かめられなかった");
    return;
  }

  const findOrphans = async (): Promise<number> => {
    const rows = await db("ohmycms_label_assignments as a")
      .leftJoin("directus_files as f", function join() {
        this.on("a.target_id", "=", "f.id").andOn(db.raw("a.target_type = ?", ["file"]));
      })
      .leftJoin("directus_folders as d", function join() {
        this.on("a.target_id", "=", "d.id").andOn(db.raw("a.target_type = ?", ["folder"]));
      })
      .whereNull("f.id")
      .whereNull("d.id")
      .select("a.target_id");
    return rows.length;
  };

  // わざと孤児を作る（存在しない対象を指す割り当て）。
  const ghostId = randomUUID();
  await db("ohmycms_label_assignments").insert({
    label_id: label.id,
    target_type: "file",
    target_id: ghostId,
  });
  const withGhost = await findOrphans();
  await db("ohmycms_label_assignments").where({ target_id: ghostId }).delete();
  const withoutGhost = await findOrphans();

  check(
    "孤児: わざと作った1件を検出できる（検査が効いている）",
    withGhost === withoutGhost + 1,
    `作った状態 ${withGhost} 件 → 消した状態 ${withoutGhost} 件`,
  );
  check(
    "孤児: 実データに孤児が無い（0 件の意味を確かめた上で）",
    withoutGhost === 0,
    `${withoutGhost} 件`,
  );
}

async function main(): Promise<void> {
  // 実在する管理者を使う（権限解決を本物のまま通したいので、偽の actor を作らない）。
  const user = await db("directus_users").select("id", "email", "role").first();
  if (!user) {
    console.error("利用者が1人もいないので測れません（unverified）");
    process.exit(2);
  }
  const actor: Actor = {
    type: "human",
    userId: user.id,
    email: user.email,
    role: user.role ?? null,
  };

  // 1. 一覧にシステムラベルが入っているか。
  const all = await listLabels(actor);
  const systemKeys = all.filter((label) => label.is_system).map((label) => label.name);
  check(
    "一覧: システムラベルが3件ある",
    systemKeys.length === 3,
    `${systemKeys.length} 件: ${systemKeys.join(" / ")}`,
  );
  check(
    "一覧: システムラベルが先に並ぶ",
    all.length === 0 || all[0].is_system,
    all.map((l) => (l.is_system ? "S" : "-")).join(""),
  );

  // 2. 作る・直す。
  const name = `検証用ラベル-${randomUUID().slice(0, 8)}`;
  const created = await createLabel(actor, { name, color: "violet" });
  check("作成: 作れる", created.name === name && created.color === "violet", `${created.name} / ${created.color}`);
  check("作成: is_system は false", created.is_system === false, String(created.is_system));

  const renamed = await updateLabel(actor, created.id, { name: `${name}-改` });
  check("更新: 名前を変えられる", renamed.name === `${name}-改`, renamed.name);

  // 3. 🚨 同じ名前を2つ作れない。
  const duplicate = await caught(() => createLabel(actor, { name: `${name}-改` }));
  check(
    "重複: 同じ名前は 409 で断る",
    duplicate?.status === 409 && duplicate.code === "LABEL_EXISTS",
    `${duplicate?.status} ${duplicate?.code}`,
  );

  // 4. 🚨 システムラベルは消せない（403。404 にしない）。
  const systemLabel = all.find((label) => label.is_system);
  if (systemLabel) {
    const denied = await caught(() => deleteLabel(actor, systemLabel.id));
    check(
      "システムラベル: 削除は 403（404 にしない）",
      denied?.status === 403 && denied.code === "LABEL_IS_SYSTEM",
      `${denied?.status} ${denied?.code}`,
    );
  } else {
    check("システムラベル: 削除は 403（404 にしない）", false, "システムラベルが無い");
  }

  // 5. 付け外しが「置き換え」として効くか。実在するファイルを1件使う。
  const file = await db("directus_files").select("id").first();
  if (!file) {
    console.log("ファイルが1件も無いので、付け外しは測っていない（unverified）");
  } else {
    const second = await createLabel(actor, { name: `検証用ラベル2-${randomUUID().slice(0, 8)}` });

    await setLabelsForTarget(actor, "file", file.id, [created.id, second.id]);
    const two = await labelsForTarget(actor, "file", file.id);
    check("付与: 2件付く", two.length === 2, two.map((l) => l.name).join(", "));

    // 🚨 置き換えなので、1件だけ渡すと残りは外れる。
    await setLabelsForTarget(actor, "file", file.id, [second.id]);
    const one = await labelsForTarget(actor, "file", file.id);
    check(
      "付与: 置き換えとして効く（渡さなかった分は外れる）",
      one.length === 1 && one[0].id === second.id,
      one.map((l) => l.name).join(", "),
    );

    // 🚨 存在しない ID を黙って捨てない。
    const unknown = await caught(() =>
      setLabelsForTarget(actor, "file", file.id, [randomUUID()]),
    );
    check(
      "付与: 存在しないラベルは 400 で断る（黙って捨てない）",
      unknown?.status === 400,
      `${unknown?.status} ${unknown?.code}`,
    );
    // 断ったあとで、元の付与が変わっていないこと（途中まで消えていない）。
    const afterFailure = await labelsForTarget(actor, "file", file.id);
    check(
      "付与: 断ったときは元の状態が変わらない",
      afterFailure.length === 1 && afterFailure[0].id === second.id,
      afterFailure.map((l) => l.name).join(", "),
    );

    // 🚨 対象を消したら割り当ても消える（外部キーが張れないので手で消している）。
    await removeLabelsForTarget("file", file.id);
    const cleaned = await labelsForTarget(actor, "file", file.id);
    check("後片付け: 対象の割り当てが消える", cleaned.length === 0, `${cleaned.length} 件`);

    await deleteLabel(actor, second.id);
  }

  // 6. 🚨 ラベルを消したら、その割り当ても消える（外部キーの CASCADE）。
  if (file) {
    await setLabelsForTarget(actor, "file", file.id, [created.id]);
    await deleteLabel(actor, created.id);
    const remained = await db("ohmycms_label_assignments").where({ label_id: created.id });
    check("削除: ラベルを消すと割り当ても消える", remained.length === 0, `${remained.length} 件`);
  } else {
    await deleteLabel(actor, created.id);
  }

  // 7. 🚨 **孤児の検出**（司令塔の指示: 責任を記憶に頼らない）。
  //    割り当てには外部キーを張れないので、**削除パスの呼び忘れは静かに残る**。
  //    ここで「検出できること」を先に確かめてから、実データの件数を数える。
  await orphanCheck();

  // 後片付けの確認（検証用に作ったラベルが残っていないこと）。
  const leftovers = await db("ohmycms_labels").whereLike("name", "検証用ラベル%");
  check("後片付け: 検証用のラベルが残っていない", leftovers.length === 0, `${leftovers.length} 件`);

  console.log(failures === 0 ? "\nすべて通りました" : `\n落ちた項目: ${failures}`);
  await db.destroy();
  process.exit(failures === 0 ? 0 : 1);
}

await main();
