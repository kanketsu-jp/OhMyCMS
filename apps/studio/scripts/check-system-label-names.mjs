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

/**
 * 🚨 **コメントを外してから数える。** 外さないと:
 *   - JSDoc の使用例に書いた `case "..."` を**実装として数える**（実測で 3 → 4 件になった）
 *   - 実装の `case` を**コメントアウトして殺しても「不足なし」**になる
 *     （＝ 英語の画面に日本語が戻るのに、検査は緑）
 * どちらも 2026-08-15 に自分の計器で落として確認した。
 * 🚨 **行数は保つ**（潰さないと、報告した行番号が別の場所を指す）。
 */
function withoutComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const seeded = [...new Set([...withoutComments(readFileSync(MIGRATION, "utf8")).matchAll(/system_key:\s*"(\w+)"/g)].map((m) => m[1]))];
const cases = [...new Set([...withoutComments(readFileSync(COMPONENT, "utf8")).matchAll(/case "(\w+)":/g)].map((m) => m[1]))];
const dictOf = (f) => Object.keys(JSON.parse(readFileSync(f, "utf8")));

// 🚨 規則 G: 対象を1件も拾えていないのに緑、を防ぐ
if (seeded.length === 0) {
  console.error(`🚨 [S0] 種まきの system_key を 1 件も拾えていません。解析が壊れている疑い`);
  process.exit(2);
}
console.log(`  種まき ${seeded.length} 件 / 部品の分岐 ${cases.length} 件`);
// 🚨 **数だけを出さない。拾ったものの実物を出す**（司令塔・2026-08-16）。
//    由来: 同じ日に `error.message` の数え違いが 3 回転した。**数は合っていたのに根拠が違った。**
//    実物を出せば、書き方の揺れ（`?.` の有無・表記ゆれ）が**目に入る**。
//    🚨 同じ日、もう 1 本の検査（check-raw-row-exports）では、
//    これを足した瞬間に**返り値の型を途中で切っていた実在の穴**が見えた。
console.log(`      拾った例 種まき: ${seeded.join(", ")}`);
console.log(`      拾った例 分岐:   ${cases.join(", ") || "(なし)"}`);
// 🚨 **辞書側も「読めている」ことを見せる**（0 件の顔を割る）。
//    辞書が空でも「不足なし」にはならないが、**読めていないのか鍵が無いのか**は数だけでは分からない。
for (const d of DICTS) {
  const keys = dictOf(d).filter((k) => k.startsWith("system_"));
  // 🚨 **内訳を割って出す。** 割らずに「system_* が 5 件」とだけ出すと、
  //    種まきが 3 件なのに 5 件あるように読め、**「2 件余っている」と誤読する**
  //    （2026-08-16、私自身が自分の出力でそう読んで調べ直した）。
  //    余りの 2 件は `system_badge` / `system_hint` ＝ **画面の飾り**で、ラベルの名前ではない。
  const forLabels = keys.filter((k) => seeded.includes(k.slice("system_".length)));
  const other = keys.filter((k) => !forLabels.includes(k));
  console.log(
    `      読んだ例 ${d}: ラベル名 ${forLabels.length} 件（${forLabels.join(", ") || "🚨 1 件も無い"}）` +
      ` ／ ラベル名でない system_* ${other.length} 件（${other.join(", ") || "なし"}）`,
  );
}

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
