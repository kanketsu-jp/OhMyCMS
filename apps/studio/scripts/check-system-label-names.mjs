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

// 🚨 **決め打ちした 1 本の外で種まきされたら、この検査は何も言わない**（2026-08-16）。
//    見逃す入力を自分で作って通したときに気づいた: 別の migration に `system_key` を
//    書けば、**この検査は 1 行も読まないので緑のまま**になる。
//    → 注記で済ませずに塞ぐ。**種まきしているファイルを数え、決め打ち以外が出たら落とす。**
//    🚨 引用符の種類を問わない形で探す（`"` だけを見ていると、`'` で書かれた瞬間に見えない）。
{
  // 🚨 **`git ls-files`（＝ git の索引）で列挙する。ディスクを直読みしない。**
  //
  //    一度ディスク直読みへ変えた（同じ 2026-08-16）。理由は「台で RED が出なかったから」
  //    ——追加した migration が未追跡で `git ls-files` に出なかった。
  //    🚨 **その判断を取り消した。** 別の検査で同じ穴を測ったときに、
  //    **代償のほうが大きい**と分かったため:
  //    ```
  //    ディスク直読み … 誰かの**書きかけの migration** が、**全員のコミットを止める**
  //                     （この検査は staged でなく作業ツリーを見るので、
  //                       他のペインが自分のファイルをコミットしただけで赤くなる）
  //    索引で列挙     … 書きかけは見えないが、**コミットする時には staged ＝ 索引に入る**
  //                     ＝ **止めたい瞬間には、ちゃんと見える**
  //    ```
  //    🚨 **RED が出なかったのは穴ではなく、正しい振る舞いだった。**
  //    台で RED を測るときは `git add` してから測ること（実測済み）。
  const dir = "lib/db/migrations";
  const files = execFileSync("git", ["ls-files", dir], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts"));
  const seeding = files.filter((f) => /system_key\s*:/.test(withoutComments(readFileSync(f, "utf8"))));
  console.log(`  種まきしている migration: ${seeding.length} 本 / 全 ${files.length} 本（🚨 母集合は git の索引。書きかけの未追跡ファイルは見ていません）`);
  // 🚨 対象を 1 本も読めていないなら、この検査は走っていないのと同じ。
  if (files.length === 0) {
    console.error("🚨 [S0] migration を 1 本も拾えていません。走っていないのと同じです");
    process.exit(2);
  }
  const 外 = seeding.filter((f) => f !== MIGRATION);
  for (const f of 外) {
    console.error(`  🚨 [S3] ${f} でも system_key を種まきしています。**この検査は読んでいません**`);
    console.error(`     → 27 行目の MIGRATION を配列にして、両方を読むようにしてください`);
  }
  if (外.length > 0) process.exit(1);
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

// ── 🚨 見逃す入力を、自分で作って通す（2026-08-16・design の形） ──────────
//    RED / GREEN は「拾えるもの」しか確かめられない。**取りこぼしは数えられない**が、
//    **作れば必ず在る**ので実演はできる。**思いつきで「見ていない範囲」を書かない。**
//    🚨 [S3] は**別のファイル**での種まきを塞いだ。ここで残るのは
//    **同じファイルの中で、書き方が違うとき**。
{
  const 抽出 = (src) =>
    [...withoutComments(src).matchAll(/system_key:\s*"(\w+)"/g)].map((m) => m[1]);
  // 🚨 **「何か拾えた」で ✅ にしない。拾った値が正しいかまで見る**（2026-08-16 実測）。
  //    台の上で抽出を単引用符対応に広げたら、`"source-missing"` から **`source` だけ**
  //    拾った状態で ✅ と出た。**部分一致を「拾えた」と読む**のは、
  //    今日ずっと配られている「名前を部分一致で見るな」と同じ形。
  const cases2 = [
    ["単引用符で書く", `{ system_key: 'archived' }`, "archived"],
    ["変数から入れる", `const k = "archived";\n{ system_key: k }`, "archived"],
    ["コロンの前に空白", `{ system_key : "archived" }`, "archived"],
    ["ハイフンを含む鍵", `{ system_key: "source-missing" }`, "source-missing"],
  ];
  console.log("  ── 🚨 この検査が見ていない書き方（**作って通した**。拾えたら ✅ に変わる）");
  let 拾えるようになった = 0;
  for (const [label, probe, 期待] of cases2) {
    const got = 抽出(probe);
    const 当たり = got.includes(期待);
    const 惜しい = !当たり && got.length > 0;
    console.log(
      `     ${当たり ? "✅ 拾えた" : "🚨 見逃す"}  ${label}` +
        (惜しい ? `（🚨 途中まで拾って "${got.join(",")}" になっています。**正しくは "${期待}"**）` : ""),
    );
    if (当たり) 拾えるようになった += 1;
  }
  // 🚨 **対照を先に見る。** 上の「見逃す」は、抽出そのものが動いていなければ
  //    「見逃した」ではなく「何も測っていない」になる（polish の形・2026-08-16）。
  //    🚨 **順番が要る**: 一度これを「拾えるようになった」の判定より後ろに置いていて、
  //    **記述が古くなったときに対照を見ないまま落ちる**形になっていた。
  const 対照 = 抽出(`{ system_key: "imported" }`).length;
  console.log(`     ${対照 > 0 ? "🟢" : "❌"} 対照(+) 素直な形は拾う → ${対照} 件`);
  if (対照 === 0) {
    console.error("🚨 [S0] 対照が拾えていません。抽出が壊れています");
    process.exit(2);
  }
  // 🚨 **記述が古くなったら、検査自身が言う**（design の形・2026-08-16）。
  //    拾えるようになったのに「見逃す」と書いたままだと、
  //    次の人が**在る守りを無いものとして扱う**。
  // 🚨 **印字だけでなく落とす**（同日・2 度目の判断）。緑の走行の中の 1 行は読まれない。
  //    止まるのは**検出器を広げた本人だけ**で、その人はいまこの検査を触っている。
  if (拾えるようになった > 0) {
    console.error(`     🚨 ${拾えるようになった} 件が拾えるようになりました。**この一覧からその行を消してください**`);
    process.exit(1);
  }
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
