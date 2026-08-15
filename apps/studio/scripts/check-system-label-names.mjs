#!/usr/bin/env node
/**
 * **種まきしたシステムラベルが、辞書と部品の両方に登録されているか**を見る。
 *
 * 🚨 なぜ要るか（2026-08-15 実測）:
 * `labelDisplayName` は**知らない `system_key` を、保存されている名前のまま返す**。
 * その名前は migration に**日本語のリテラル**で書かれているので、
 * **英語で見ている人にも日本語のまま出る**。しかも**エラーにならない**。
 * ```
 * 4つ目のシステムラベルを足して実測:
 *   [ja] "四つ目のシステムラベル"
 *   [en] "四つ目のシステムラベル"   ← 🚨 英語なのに日本語
 *   🟢 対照(+) [en] imported → "Imported"
 * ```
 * **今朝この不具合を直したばかりで、同じものが静かに戻る形だった。**
 * 🚨 **「安全側に倒す」が「静かに消す」になっていた**（司令塔・2026-08-15）。
 *
 * 🚨 **この検査が見ていない範囲**: DB に**手で入れた**システムラベル。
 *    見るのは migration に書かれたものだけ。
 *
 * 使い方: node scripts/check-system-label-names.mjs   （cwd は apps/studio）
 * 終了コード: 不足があれば 1 ／ 検査自体が壊れていれば 2
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MIGRATION = "lib/db/migrations/20260815010000_create_labels_and_folder_color.ts";
const COMPONENT = "components/admin/label-display-name.ts";
const DICTS = ["i18n/messages/ja/labels.json", "i18n/messages/en/labels.json"];

for (const f of [MIGRATION, COMPONENT, ...DICTS]) {
  if (!existsSync(f)) {
    console.error(`🚨 [S0] ${f} が見つかりません。cwd は apps/studio ですか（いま ${process.cwd()}）`);
    process.exit(2);
  }
}

const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
console.log(`採取: HEAD ${head} / cwd ${process.cwd()}`);
console.log(`  見る範囲: ${MIGRATION} の system_key と、${COMPONENT} の分岐と、ja/en の辞書`);

const seeded = [...new Set([...readFileSync(MIGRATION, "utf8").matchAll(/system_key:\s*"(\w+)"/g)].map((m) => m[1]))];
const cases = [...new Set([...readFileSync(COMPONENT, "utf8").matchAll(/case "(\w+)":/g)].map((m) => m[1]))];
const dictOf = (f) => Object.keys(JSON.parse(readFileSync(f, "utf8")));

// 🚨 規則 G: 対象を1件も拾えていないのに緑、を防ぐ
if (seeded.length === 0) {
  console.error(`🚨 [S0] 種まきの system_key を 1 件も拾えていません。解析が壊れている疑い`);
  process.exit(2);
}
console.log(`  種まき ${seeded.length} 件 / 部品の分岐 ${cases.length} 件`);

let bad = 0;
for (const key of seeded) {
  if (!cases.includes(key)) {
    console.error(`  🚨 [S1] ${key}: ${COMPONENT} に分岐がありません`);
    console.error(`     → そのままだと **migration に書いた日本語が英語の画面にも出ます**`);
    bad++;
  }
  for (const d of DICTS) {
    if (!dictOf(d).includes(`system_${key}`)) {
      console.error(`  🚨 [S2] ${key}: ${d} に system_${key} がありません`);
      bad++;
    }
  }
}
if (bad > 0) {
  console.error(`\n🚨 不足 ${bad} 件`);
  process.exit(1);
}
console.log(`\n不足なし（種まき ${seeded.length} 件すべてに分岐と ja/en の文言がある）。`);
