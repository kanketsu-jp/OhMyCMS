#!/usr/bin/env node
/**
 * 🚨 **効かない `readOnly`** を止める検査。
 *
 * 由来（2026-08-16 実測。仕様の記憶ではなく、**本物のキー／クリックを送って測った**）:
 * ```
 * 🟢 効く        text / url / password / textarea
 *                （🟢 対照: readOnly を外すと A → ABB ＝ 入力は届いている）
 * 🔴 効かない    checkbox / radio
 *                🚨 **属性は付き `el.readOnly === true` になるのに、実クリックで変わる**
 * 🚨 性質が無い  select … `'readOnly' in el` が **false**（**`div` と同じ**）
 *                ＝ React で渡しても素通り
 * 🚨 未検証      color … OS のピッカーが開くので、この方法では測れていない
 * ```
 *
 * **なぜ止めるか**: 付いているのに効かないと、**画面は止まっているように見えて、実際は変えられる**。
 * 表示モード（`knowledge/decisions/action-button-and-edit-mode.md`）で使うと、
 * **「変えられない」という嘘**になる。権限で出し分けている画面なら `AGENTS.md §3.5` の形に化ける。
 *
 * 🚨 **この検査は「効かない `readOnly`」だけを見る。**
 * 代わりに何を使うか（`disabled` にするのか、部品を出さず値を文字で出すのか）は
 * 面の規約の話で、**この検査は決めない**。
 *
 * 使い方: `node scripts/check-readonly-misuse.mjs`（apps/studio で実行）
 * 終了コード: 0 = 違反なし / 1 = 違反あり・または**測れていない**
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
// 🚨 **コメントを実装として数えない**（2026-08-16 実測。**この検査を作った当日に見つけた**）。
//    `// <input type="checkbox" readOnly />` や `{/* <select readOnly={x} /> */}` を
//    **違反として拾っていた**。この家では「❌ こう書かない」という**例をコメントに書く**ので、
//    🚨 **戒めを書いた人が、身に覚えのない違反で落ちる**。
//    🚨 囮に「コメントの中の readOnly」は入れてあったが、それは `className` の中の文字列を
//    想定したもので、**タグ丸ごとをコメントに書く形**を入れていなかった（囮が 1 通りだった）。
//    自前を作らず**共有へ寄せる**（polish が `8bfccf0` で正規表現リテラルの穴を直したもの）。
import { stripComments } from "./strip-comments.mjs";

/** 🔴 `readOnly` が効かない要素名（素の `select` と、それを包む部品）。 */
const SELECTISH = new Set([
  "select",
  "NativeSelect",
  "Select",
  "SelectTrigger",
  "Checkbox",
  "Switch",
  "RadioGroup",
  "RadioGroupItem",
]);
/** 🔴 `readOnly` が効かない `type`。 */
const BAD_TYPES = new Set(["checkbox", "radio"]);

const TAG = /<([A-Za-z][\w.]*)/g;
const NAME = /^[A-Za-z][\w:.-]*/;

/** 開始タグの `>` を探す（属性の中の `{}` と引用符を数える）。 */
function tagEnd(src, i) {
  let depth = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) return i;
    i += 1;
  }
  return -1;
}

/** `=` の後ろの値を飛ばす（`{...}` / `"..."` / `'...'` / 裸）。 */
function skipValue(s, i) {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  if (i >= s.length) return i;
  if (s[i] === "{") {
    let depth = 0;
    let quote = null;
    while (i < s.length) {
      const c = s[i];
      if (quote) {
        if (c === quote && s[i - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return i;
  }
  if (s[i] === '"' || s[i] === "'") {
    const q = s[i];
    i += 1;
    while (i < s.length && s[i] !== q) i += 1;
    return i + 1;
  }
  while (i < s.length && !/\s/.test(s[i])) i += 1;
  return i;
}

/**
 * 属性を `[名前, 値]` で返す。
 *
 * 🚨 **値の中の識別子を名前として返さないこと**が、この関数の全部。
 * 2026-08-16、最初は属性の文字列を丸ごと正規表現で見ていて、
 * **`disabled={readonly}` の変数名**を「readOnly 属性」として拾った（`item-form.tsx:121`）。
 * **コメントの中の `readOnly`** も拾っていた（`components/ui/input.tsx`）。
 * どちらも**実在しない違反**で、**「拾えた」と「正しいものを拾えた」は別**だった。
 */
function attributes(attrs) {
  const out = [];
  let i = 0;
  while (i < attrs.length) {
    if (/\s/.test(attrs[i])) {
      i += 1;
      continue;
    }
    if (attrs[i] === "{") {
      // {...spread}
      i = skipValue(attrs, i);
      continue;
    }
    const m = NAME.exec(attrs.slice(i));
    if (!m) {
      i += 1;
      continue;
    }
    const name = m[0];
    i += name.length;
    while (i < attrs.length && /\s/.test(attrs[i])) i += 1;
    if (attrs[i] === "=") {
      const j = skipValue(attrs, i + 1);
      out.push([name, attrs.slice(i + 1, j).trim()]);
      i = j;
    } else {
      out.push([name, true]);
    }
  }
  return out;
}

/** 1 ファイル分のソースを見て、違反を返す。 */
export function findInSource(src, path = "(直接渡された文字列)") {
  const found = [];
  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(src))) {
    const end = tagEnd(src, TAG.lastIndex);
    if (end < 0) continue;
    const attrs = attributes(src.slice(TAG.lastIndex, end));
    if (!attrs.some(([n]) => n === "readOnly" || n === "readonly")) continue;
    const tag = m[1];
    const typeRaw = attrs.find(([n]) => n === "type")?.[1];
    const type = typeof typeRaw === "string" ? typeRaw.replace(/^[{"']+|[}"']+$/g, "").trim() : null;
    const 効かない = (type && BAD_TYPES.has(type)) || SELECTISH.has(tag);
    if (!効かない) continue;
    found.push({
      path,
      line: src.slice(0, m.index).split("\n").length,
      tag,
      type,
      理由: SELECTISH.has(tag) ? `<${tag}> は readOnly を持たない` : `type="${type}" には効かない`,
    });
  }
  return found;
}

/**
 * 🚨 **本番と同じ経路**（コメントを落としてから見る）。
 *
 * 2026-08-16: 囮は `findInSource` を**直接**呼んでおり、本番は `stripComments` を通していた。
 * ＝ 🚨 **囮が本番と違う経路を測っていた**。コメントの囮を足した瞬間に、そこが露見した
 * （囮 3 本が「拾ってしまう」と出たが、**本番では拾わない**）。
 * → **囮も実物も、この 1 本を通す。**
 */
const scan = (src, path) => findInSource(stripComments(src), path);

// ───────────────────────── 自己検査（囮。**本物の関数をそのまま呼ぶ**） ─────────────────────────

const 囮 = [
  // 肯定（拾えなければ、この検査は何も守っていない）
  ['✅ 拾う  素の checkbox', '<input type="checkbox" readOnly={x} />', 1],
  ['✅ 拾う  素の radio', '<input type="radio" readOnly />', 1],
  ['✅ 拾う  素の select', '<select readOnly={!editing}><option /></select>', 1],
  ['✅ 拾う  NativeSelect', '<NativeSelect name="a" readOnly={!editing}>x</NativeSelect>', 1],
  ['✅ 拾う  type が波括弧', '<input type={"checkbox"} readOnly />', 1],
  ['✅ 拾う  属性が複数行', '<input\n  type="checkbox"\n  readOnly={!editing}\n/>', 1],
  // 否定（拾ってしまったら誤検知）
  ['🚫 拾わない  text（効く）', '<input type="text" readOnly={!editing} />', 0],
  ['🚫 拾わない  textarea（効く）', '<Textarea readOnly={!editing} />', 0],
  ['🚫 拾わない  password（効く）', '<input type="password" readOnly />', 0],
  [
    '🚫 拾わない  🚨 disabled={readonly}（**変数名**。実在した誤検知）',
    '<input type="checkbox" disabled={readonly} />',
    0,
  ],
  [
    '🚫 拾わない  🚨 コメントの中の readOnly（実在した誤検知）',
    '<input\n  type="checkbox"\n  className={cn(\n    // readOnly が付いた時点で…\n    "x",\n  )}\n/>',
    0,
  ],
  ['🚫 拾わない  readOnly が値の中にある', '<input type="checkbox" aria-label={t("readOnly")} />', 0],
  // 🚨 2026-08-16 に**実際に拾ってしまった形**（この検査を作った当日に見つけた）。
  //    囮は「コメントの中の readOnly」を 1 通りしか持っておらず、
  //    **タグ丸ごとをコメントに書く**形は入っていなかった。
  ['🚫 拾わない  🚨 タグ丸ごとが // コメントの中', '// <input type="checkbox" readOnly />', 0],
  ['🚫 拾わない  🚨 タグ丸ごとが JSX コメントの中', '{/* <select readOnly={x} /> */}', 0],
  ['🚫 拾わない  🚨 タグ丸ごとがブロックコメントの中', '/* <input type="radio" readOnly /> */', 0],
  ['🚫 拾わない  select だが readOnly が無い', '<select disabled={!editing}><option /></select>', 0],
];

console.log("■ 自己検査（囮を本物の関数へ通す）");
let 自己NG = 0;
for (const [名, src, 期待] of 囮) {
  const n = scan(src).length;
  const ok = n === 期待;
  if (!ok) 自己NG += 1;
  console.log(`  ${ok ? "✅" : "🔴"} ${名}  → ${n} 件（期待 ${期待}）`);
}
if (自己NG > 0) {
  console.error(`\n🔴 自己検査が ${自己NG} 件落ちました。**この検査は信用できません**（実物は見ていません）。`);
  process.exit(1);
}

console.log("\n■ 🚨 見逃す入力（**作って通した結果**。ここに出る形は、この検査では止まりません）");
const 見逃す = [
  ['🟢 対照(+) 素の checkbox', '<input type="checkbox" readOnly />'],
  ['🚨 見逃す  type を変数で渡す', '<input type={t} readOnly />'],
  ['🚨 見逃す  自作の包み部品', '<MyCheckbox readOnly={!editing} />'],
  ['🚨 見逃す  props を展開して渡す', '<input type="checkbox" {...{ readOnly: true }} />'],
  ['🚨 見逃す  部品の既定値として持つ', 'function C(p){ return <input type="checkbox" {...p} /> } // readOnly: true'],
  ['🚨 見逃す  条件でタグを変える', 'const T = cond ? "select" : "div"; <T readOnly />'],
];
for (const [名, src] of 見逃す) {
  const n = scan(src).length;
  console.log(`  ${名}  → ${n} 件  ${名.startsWith("🟢") ? (n ? "（検出器は動いている）" : "🔴 **対照が落ちた＝測れていない**") : ""}`);
}
if (scan('<input type="checkbox" readOnly />').length === 0) {
  console.error("\n🔴 対照が落ちました。**以下の結果は読まないでください**。");
  process.exit(1);
}

// ───────────────────────── 実物 ─────────────────────────

let files = [];
try {
  files = execFileSync("git", ["grep", "-l", "-E", "readOnly|readonly", "--", "app", "components"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
} catch (e) {
  // git grep は 1 件も無いとき exit 1。**それ自体は正常**なので、区別して扱う。
  if (e.status !== 1) {
    console.error(`\n🔴 git grep が失敗しました（exit ${e.status}）＝ **測れていません**`);
    process.exit(1);
  }
}

const 文字数 = files.reduce((n, f) => n + readFileSync(f, "utf8").length, 0);
console.log(`\n■ 実物\n読み込み: ${files.length} ファイル / ${文字数} 文字`);
if (files.length === 0 || 文字数 === 0) {
  // 🚨 「0 件」を「異常なし」と読ませない。**探せていない 0** はここで落とす。
  console.error("🔴 対象が 0 です。`readOnly` を書いたファイルが 1 つも無いはずはありません＝**測れていません**");
  process.exit(1);
}

const 違反 = files.flatMap((f) => scan(readFileSync(f, "utf8"), f));
for (const v of 違反) console.log(`  🔴 ${v.path}:${v.line}  <${v.tag}>  ${v.理由}`);

// 🚨 文言を件数に追随させる。**違反 1 件なのに「異常が無い 0 です」と出ていた**（2026-08-16 の 台 で発見）。
//    数と説明が食い違う出力は、読む人が数のほうを疑う。
console.log(
  違反.length === 0
    ? `\n判定: 違反 0 件 — 🚨 **異常が無い 0** です` +
        `（上の囮 ${囮.length} 件で「拾える／拾わない」を確かめ、実物 ${files.length} ファイル ${文字数} 文字を読んだ上での 0）`
    : `\n判定: 違反 ${違反.length} 件 / 読んだ ${files.length} ファイル ${文字数} 文字`,
);
if (違反.length > 0) {
  console.error(
    "\n🔴 効かない `readOnly` が在ります。**付いているのに変えられてしまいます**。\n" +
      "   代わりに何を使うかは `knowledge/decisions/action-button-and-edit-mode.md` §2-1。",
  );
  process.exit(1);
}
