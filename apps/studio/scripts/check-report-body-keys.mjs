/**
 * 不具合報告で**画面からサーバへ送る鍵**が、サーバが読む鍵の範囲に収まっているかを見る。
 *
 * 由来（規律12・2026-08-15）: `bug-report-composer.tsx` のコメントは
 * > 🚨 **自動で集めるものを増やさない。** Cookie・トークン・設定値は送らない。
 * と宣言していたが、**それを守っているコードを名指しできなかった**。
 * 次に触る人が `body` に 1 行足せば、何も言わずに通る状態だった。
 *
 * 🚨 **サーバ側は既に強い**（`lib/reports/service.ts` の `validate()` が
 *    `input.title` / `input.body` / `input.page_path` / `input.expected` /
 *    `input.viewport` / `input.locale` **だけ**を読み、残りは保存されない）。
 *    この検査が足すのは **「線を越えて出ていくもの」の側**の歯止め。
 *    保存されなくても、**送った時点でログ・プロキシ・エラー報告には乗る**。
 *
 * 見ているのは「不具合報告の送信」1 経路だけ。**他のフォームは見ていない。**
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const COMPOSER = join(REPO_ROOT, "apps/studio/components/admin/bug-report-composer.tsx");
const SERVICE = join(REPO_ROOT, "apps/studio/lib/reports/service.ts");

function readOrExplain(path, why) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    console.error(`🚨 ${path} を読めませんでした（${why}）。`);
    console.error("   **この検査は現在ブラインドです**——鍵が増えても検出できません。");
    console.error(`   （元のエラー: ${error?.code ?? error?.message ?? error}）`);
    process.exit(1);
  }
}

function balanced(source, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return null;
}

const problems = [];

// ── 画面が送る鍵（JSON.stringify({...}) の最上位） ──────────────────
const composer = readOrExplain(COMPOSER, "報告フォーム");
const at = composer.indexOf("JSON.stringify({");
if (at < 0) {
  problems.push(
    `解析できません: ${COMPOSER} に JSON.stringify({...}) がありません` +
      "（送り方が変わったなら、この検査も一緒に直してください）",
  );
}
const bodySrc = at >= 0 ? balanced(composer, composer.indexOf("{", at)) : null;
if (at >= 0 && !bodySrc) problems.push("解析できません: JSON.stringify({ の括弧が閉じていません");

const sent = [];
if (bodySrc) {
  // 🚨 **鍵と値を取り違えない。** `title: trimmedTitle,` の `trimmedTitle` は値であって鍵ではない。
  //    最初 `name[:,\n]` で拾ったら値まで数え、`trimmedTitle` `undefined` `pathname` が
  //    「送っている鍵」として並んだ（**過大に数えた**）。
  //    鍵は「`{` か `,` の直後にある識別子」だけ。省略記法（`viewport,`）もこれで拾える。
  let depth = 0;
  let afterSeparator = false;
  for (let i = 0; i < bodySrc.length; i += 1) {
    const c = bodySrc[i];
    if (c === "{" || c === "(" || c === "[") { depth += 1; afterSeparator = depth === 1; continue; }
    if (c === "}" || c === ")" || c === "]") { depth -= 1; afterSeparator = false; continue; }
    if (depth !== 1) continue;
    if (c === ",") { afterSeparator = true; continue; }
    if (/\s/.test(c)) continue;
    if (!afterSeparator) continue;
    const m = bodySrc.slice(i).match(/^([A-Za-z_$][\w$]*)\s*[:,}\n]/);
    if (m) { sent.push(m[1]); i += m[1].length - 1; }
    afterSeparator = false;
  }
}

// ── サーバが読む鍵（validate() の中の input.<key>） ─────────────────
const service = readOrExplain(SERVICE, "報告のドメイン層");
// 🚨 `function validate(input: …): {` の直後の `{` は**戻り値の型注釈**であって本体ではない。
//    そこを掴むと `input.` が 1 つも無く、**サーバ側 0 件**になる（最初にこれで空振りした）。
//    行頭の `}` までを本体として切る。
// 🚨 `function validate(input: …): {` の直後の `{` は**戻り値の型注釈**。そこを掴むと
//    `input.` が 1 つも無く**サーバ側 0 件**になる。しかも型注釈は行頭 `} {` で閉じるので、
//    「行頭の } まで」で切っても**型注釈だけ**を掴む（実際に 2 回とも空振りした）。
//    → 次の関数宣言までを窓にする。
const vAt = service.indexOf("function validate(");
const nextDecl = vAt >= 0
  ? [service.indexOf("\nfunction ", vAt + 1), service.indexOf("\nexport ", vAt + 1)]
      .filter((n) => n > 0)
      .sort((a, b) => a - b)[0] ?? service.length
  : -1;
const vBody = vAt >= 0 ? service.slice(vAt, nextDecl) : null;
if (!vBody) problems.push("解析できません: lib/reports/service.ts の validate() を読めませんでした");
const accepted = new Set(
  vBody ? [...vBody.matchAll(/input\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]) : [],
);

const extra = sent.filter((k) => !accepted.has(k));

console.log("■ 判定（見ているのは不具合報告の送信 1 経路だけ）");
console.log(`  画面が送る鍵      : ${sent.join(", ") || "(なし)"}`);
console.log(`  validate() が読む鍵: ${[...accepted].join(", ") || "(なし)"}`);

// 🟢 対照(+): 「在るものが在ると出る」ことを毎回示す。0 と 0 を比べて緑にしない。
if (sent.length === 0 || accepted.size === 0) {
  problems.push(
    `対照が立ちません（画面 ${sent.length} 件 / サーバ ${accepted.size} 件）。` +
      "どちらかが 0 なら、この検査は何も比べていません",
  );
}

if (problems.length > 0) {
  console.error(`\n🚨 ${problems.length} 件、解析できませんでした（「違反なし」ではありません）:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
if (extra.length > 0) {
  console.error("\n🚨 画面が送っているのに、サーバが読まない鍵があります。");
  console.error("   保存されないので無害に見えますが、**送った時点でログや経路には乗ります**。");
  console.error("   増やすなら validate() 側で受けるところまでを 1 組にしてください。");
  for (const k of extra) console.error(`  - ${k}`);
  process.exit(1);
}
console.log(`\n問題なし（送る ${sent.length} 件はすべて validate() が読む範囲に収まっています）。`);
