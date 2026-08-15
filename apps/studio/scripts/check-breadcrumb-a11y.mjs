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
 * 落とす条件:
 *   ① パンくずの引き金のボタンに `aria-label` がある（見えている文字を打ち消す。WCAG 2.5.3）
 *   ② 記号のアイコン（Ellipsis / Slash）に `aria-hidden` が無い（記号が読み上げに混ざる）
 *   ③ 🚨 **対象そのものを見つけられない**（＝この検査が何も見ていない状態。**通さずに落とす**）
 */
import { readFileSync } from "node:fs";

const FILE = "components/admin/breadcrumbs.tsx";
const problems = [];
const checked = [];

let src;
try {
  src = readFileSync(FILE, "utf8");
} catch {
  console.error(`🚨 ${FILE} を読めません。パンくずの読み上げ名は**誰も守っていません**。`);
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

// ── ① 引き金に aria-label が無いこと
if (/\baria-label\b/.test(buttonTag[0])) {
  problems.push(
    `${FILE}: パンくずの引き金に aria-label があります。\n` +
      `    読み上げ名が**見えているページ名を打ち消します**（WCAG 2.5.3 label in name）。\n` +
      `    「上の階層へ」のような補足は、ボタンの中の <span className="sr-only"> で足してください\n` +
      `    （そちらは見えている文字に**足す**ので打ち消しません）。`,
  );
}

// ── ② 記号のアイコンに aria-hidden があること
for (const icon of ["EllipsisIcon", "SlashIcon"]) {
  const tag = new RegExp(`<${icon}\\b[^>]*>`).exec(trigger[1]);
  if (!tag) {
    problems.push(
      `${FILE}: ${icon} が引き金の中に見つかりません。\n` +
        `    記号を文字（"..." や "/"）に戻すと、読み上げで「てんてんてんスラッシュ」になります。`,
    );
    continue;
  }
  checked.push(`${icon} を見つけた`);
  if (!/\baria-hidden\b/.test(tag[0])) {
    problems.push(`${FILE}: ${icon} に aria-hidden がありません。記号が読み上げに混ざります。`);
  }
}

console.log(`対象: ${FILE}`);
console.log(`確かめたこと: ${checked.length} 件`);
for (const c of checked) console.log(`  🟢 ${c}`);

if (problems.length > 0) {
  console.error(`\n🚨 パンくずの読み上げ名が壊れる書き方があります: ${problems.length} 件\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

console.log("違反なし。");
