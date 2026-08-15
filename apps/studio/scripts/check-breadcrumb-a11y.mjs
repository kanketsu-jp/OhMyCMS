#!/usr/bin/env node
/**
 * パンくずの読み上げ名が、**見えている文字（ページ名）から作られている**ことを守る。
 *
 * なぜこれだけ検査にするか:
 *   このリポジトリの「〜しない」という約束は数えたら 20 件あり、守り手を名指しできたのは 3 件だった。
 *   残りは願望だが、**破れば画面で分かる**ものがほとんど（線が出る・薄くなる・ボタンになる）。
 *   🚨 **例外がここ。** `aria-label` を足す事故だけは**画面から見えない**——
 *   読み上げ名だけが静かに壊れ、次に AX ツリーを採る人が現れるまで誰も気づかない。
 *   （2026-08-15。実際に AX ツリーで「読み上げ名にスラッシュが入っていない」ことを確かめた状態を守る）
 *
 * 🚨 これは**静的な代理**であって、読み上げ名そのものを測ってはいない。
 *    本物は CDP の Accessibility.getPartialAXTree で採る（probe-crumb-slash.mjs）。
 *    ここで見るのは「壊す書き方が入っていないか」だけ。**そう書いてある**と**そうでないと通らない**の
 *    後者に近づけるための最低限。
 *
 * 🚨 **この守り手が見ていない範囲**（塞げないものは隠さず書く）:
 *   ・**別名 import**（`import { Ellipsis as SlashIcon }`）→ 名前で照合しているので**通る**
 *   ・**アイコンの中身**（`SlashIcon` が本当に「/」を描くか）→ 見ていない
 *   ・**実行時の読み上げ名そのもの** → 静的には採れない。本物は
 *     `scratchpad/probe-crumb-slash.mjs` が Accessibility.getPartialAXTree から採る
 *   ・**この検査が走る cwd** → `apps/studio` 以外だと読めずに落ちる（**黙って通ることは無い**）
 *
 * 落とす条件:
 *   ① 引き金のボタンに `aria-label` **または `aria-labelledby`** がある（見えている文字を打ち消す。WCAG 2.5.3）
 *   ② 引き金のボタンに props の **spread（`{...}`）** がある（中身が見えないので隠して渡せる）
 *   ③ 記号のアイコン（Ellipsis / Slash）が **`aria-hidden="true"` になっていない**
 *      （**有無ではなく値**を見る。`"false"` は在るのに隠していない）
 *   ④ 🚨 **対象そのものを見つけられない**（＝この検査が何も見ていない状態。**通さずに落とす**）
 *
 * 🚨 ①②③ は、最初に作ったとき**素通りできた**（2026-08-15 実測。いずれも exit 0 だった）。
 *    司令塔の「自分の検査は迂回できないか当ててみろ」に従って自分で試したら見つかった。
 *    **迂回できる形を残すと、検査は在るだけで守っていない。**
 */
import { readFileSync } from "node:fs";

const FILE = "components/admin/breadcrumbs.tsx";
const problems = [];
const checked = [];

let src;
try {
  src = readFileSync(FILE, "utf8");
} catch {
  // 🚨 **「読めなかった」を「守られていない」と書かない。**
  //    以前は「誰も守っていません」と出していたが、**それは確かめていないこと**。
  //    リポジトリ直下から走らせただけで、この文言が出ていた（実測）。
  //    読んだ人は**存在しない穴を探しに行く**（正しい対処は `cd apps/studio`）。
  console.error(
    `🚨 この検査を実行できませんでした（${FILE} を読めない）。\n` +
      `   いまの cwd: ${process.cwd()}\n` +
      `   考えられる原因:\n` +
      `     ① **走らせた場所が違う** … この検査は apps/studio から走らせる（いちばん多い）\n` +
      `     ② ファイルが移動・改名された … その場合は FILE の指定を直す\n` +
      `   🚨 **これは「守りが壊れている」ではありません。** 守りが効いているかは、**まだ何も分かっていません**。`,
  );
  process.exit(1);
}

// ── 対象を切り出す: DropdownMenuTrigger の中の <Button …> 開きタグ
const trigger = /<DropdownMenuTrigger[^>]*>([\s\S]*?)<\/DropdownMenuTrigger>/.exec(src);
if (!trigger) {
  console.error(
    `🚨 ${FILE} に DropdownMenuTrigger が見つかりません。\n` +
      `   構造が変わったか、パンくずがボタンでなくなったかです。\n` +
      `   **見つからないまま通すと、この検査は「何も見ていない緑」になります**ので落とします。`,
  );
  process.exit(1);
}
checked.push("DropdownMenuTrigger の中身を切り出した");

const buttonTag = /<Button\b[^>]*>/.exec(trigger[1]);
if (!buttonTag) {
  console.error(
    `🚨 ${FILE} の DropdownMenuTrigger の中に <Button> がありません。\n` +
      `   **対象が取れていないので落とします**（「異常が無い 0」と「見ていない 0」を区別するため）。`,
  );
  process.exit(1);
}
checked.push("引き金の <Button> の開きタグを取れた");

/**
 * 規則の本体。**任意のソース片に当てられる形**にしてある。
 * 🚨 こうしておかないと「囮」で自己検査できない——
 *    規則が壊れて何も検出しなくなっても、対象さえ見つかれば緑になる。
 *    （司令塔の決め: **囮は「探し方が当たっているか」、0 件ガードは「そもそも読めているか」。両方要る**）
 */
function inspect(triggerBody, buttonTag, where) {
  const found = [];
  // 🚨 **拾った実物を必ず添える**（司令塔 2026-08-16）。
  //    数と説明だけだと、**なぜそう判定したかを他人が確かめられない**。
  //    今日「12 か 10 か」が 3 回ひっくり返った原因は、出力が件数だけだったこと。
  //    行を出せば `?.` のような書き方の違いが目に入る（数を見ていても入らない）。
  const 実物 = (s) => `\n    実物: ${String(s).replace(/\s+/g, " ").trim().slice(0, 120)}`;
  // ① 引き金が読み上げ名を上書きしていないこと
  // 🚨 `aria-label` だけを見ていたら **`aria-labelledby` で素通りできた**（2026-08-15 実測）。
  for (const attr of ["aria-label", "aria-labelledby"]) {
    if (new RegExp(`\\b${attr}\\b`).test(buttonTag)) {
      found.push(
        `${where}: パンくずの引き金に ${attr} があります。\n` +
          `    読み上げ名が**見えているページ名を打ち消します**（WCAG 2.5.3 label in name）。\n` +
          `    補足は <span className="sr-only"> で**足して**ください（打ち消しません）。` +
          実物(buttonTag),
      );
    }
  }
  // 🚨 spread の中身はこの検査から見えない。**見えないものを通さない**
  if (/\{\s*\.\.\./.test(buttonTag)) {
    found.push(`${where}: 引き金に props の spread（{...}）があります。中身が見えないので aria-label を隠せます。` + 実物(buttonTag));
  }
  // ② 記号のアイコンが aria-hidden="true" であること
  for (const icon of ["EllipsisIcon", "SlashIcon"]) {
    const tag = new RegExp(`<${icon}\\b[^>]*>`).exec(triggerBody);
    if (!tag) {
      found.push(`${where}: ${icon} が引き金の中に見つかりません。文字に戻すと読み上げに記号が混ざります。` + 実物(triggerBody));
      continue;
    }
    // 🚨 **有無ではなく値を見る。** `aria-hidden="false"` は在るのに隠していない（2026-08-15 実測）。
    if (!/aria-hidden\s*=\s*["{]?\s*(?:true|"true")/.test(tag[0])) {
      found.push(`${where}: ${icon} が aria-hidden="true" になっていません（属性が無い／値が true でない）。` + 実物(tag[0]));
    }
  }
  return found;
}

// ── 🚨 囮（自己検査）: **走るたびに、規則が本当に発火するかを確かめる**
//    これが無いと、規則が壊れて何も検出しなくなっても緑のままになる。
const OK_ICONS = '<EllipsisIcon aria-hidden="true" /><SlashIcon aria-hidden="true" />';
const DECOYS = [
  ["きれいな形（発火してはいけない）", OK_ICONS, '<Button variant="secondary">', 0],
  ["aria-label", OK_ICONS, '<Button aria-label="x">', 1],
  ["aria-labelledby", OK_ICONS, '<Button aria-labelledby="x">', 1],
  ["spread", OK_ICONS, '<Button {...p}>', 1],
  ['aria-hidden="false"', '<EllipsisIcon aria-hidden="true" /><SlashIcon aria-hidden="false" />', "<Button>", 1],
  ["アイコンが無い", '<EllipsisIcon aria-hidden="true" />', "<Button>", 1],
];
let decoyFailed = false;
for (const [name, body, tag, want] of DECOYS) {
  const got = inspect(body, tag, "囮").length;
  const ok = want === 0 ? got === 0 : got >= 1;
  if (!ok) {
    decoyFailed = true;
    console.error(`🚨 囮が期待どおりに動きません: ${name} → 検出 ${got} 件（期待 ${want === 0 ? "0" : "1 以上"}）`);
  }
}
if (decoyFailed) {
  console.error("\n🚨 **規則そのものが壊れています。この検査の結果は信用できません**（緑でも意味を持たない）。");
  process.exit(1);
}
checked.push(`囮 ${DECOYS.length} 件すべてが期待どおり（規則は発火する／きれいな形では発火しない）`);

problems.push(...inspect(trigger[1], buttonTag[0], FILE));

console.log(`対象: ${FILE}`);
console.log(`確かめたこと: ${checked.length} 件`);
for (const c of checked) console.log(`  🟢 ${c}`);

if (problems.length > 0) {
  console.error(`\n🚨 パンくずの読み上げ名が壊れる書き方があります: ${problems.length} 件\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

console.log("違反なし。");
