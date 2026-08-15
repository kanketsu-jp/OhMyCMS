#!/usr/bin/env node
/**
 * 画面が **API の生文言をそのまま表示していないか**を、**名前でなく振る舞いで**見る。
 *
 * 由来: 2026-08-16。`knowledge/decisions/i18n-check-scope-is-what-reaches-the-screen.md` は
 * 「`apiMessage()` の呼び出しが 0 件だから生文言は画面に出ない」と結論していた。
 * **呼び出し 0 件は正しかったが、同じ振る舞いが `messageFrom()` という別名で
 * 12 ファイルに実装されていた**（[w4A:p1V / storage] が振る舞いで探し直して発見）。
 * その文言は `lib/` の日本語リテラルなので、**英語で見ている人の画面に日本語が出る**
 * （[w4A:p2? / saml] が偽の 404 を返して画面で実証済み）。
 *
 * 🚨 **だから、この検査は識別子を見ない。** `error.message` を読む**形**を見る。
 * 名前を変えても逃げられない。
 *
 * ## 🚨 いまは「減らす検査」ではなく「増やさない検査」
 *
 * 既存 12 ファイルを赤にすると、**全ペインが門を回避し始める**（同じ decision の
 * 「併せて守ること」1 つ目の失敗そのもの）。なので **現状を基準線として持ち**、
 * **増えたぶんだけ**を落とす。
 *
 * ```
 * 増えた   → ❌ 落とす（新しい画面が同じ穴を掘っている）
 * 減った   → ✅ 通す。🚨 **ただし「基準線を削れ」と言う**（放っておくと基準線が嘘になる）
 * 同じ     → ✅ 通す
 * ```
 *
 * ## 🚨 この検査が見ていないもの
 * ```
 * ❌ lib/ 側の日本語リテラルそのもの（233 件。丸ごと足すと門が死ぬ）
 * ❌ その message が **実際に画面へ描かれるか**
 *    → setError() に渡っていても、その state を描いていない画面が在りうる。
 *      **12 ファイルのうち画面まで追跡したのは agents-manager 1 件だけ**
 * ❌ 訳の意味（それは check-i18n-placeholders も見ていない）
 * ```
 *
 * 決定: `knowledge/decisions/i18n-check-scope-is-what-reaches-the-screen.md`
 *       `knowledge/decisions/checks-must-declare-blind-spots.md`
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 🚨 **基準線**（2026-08-16 時点で存在するもの）。
 * `(c)` で直すたびに **この表から削る**。空になったら、この検査は普通の禁止検査になる。
 * 🚨 **勝手に足さない。** 足すのは「直せない理由」が在るときだけで、そのときは理由を隣に書く。
 */
const BASELINE = {
  "components/admin/agents-manager.tsx": 2,
  "components/admin/dev-login-form.tsx": 1,
  "components/admin/file-detail-manager.tsx": 2,
  "components/admin/file-picker.tsx": 2,
  "components/admin/files-manager.tsx": 2,
  "components/admin/folder-grid.tsx": 2,
  "components/admin/new-folder-form.tsx": 2,
  "components/admin/policies-manager.tsx": 2,
  "components/admin/policy-permissions-manager.tsx": 2,
  "components/admin/roles-manager.tsx": 2,
  "components/admin/storage-settings-manager.tsx": 1,
  "components/admin/users-policy-manager.tsx": 2,
};

/** 🚨 振る舞いで見る。識別子は見ない。 */
const RE =
  /\berror(?:\?)?\.\s*message\b|\[["']error["']\]\s*(?:\?)?\.\s*message\b|\bmessage\b\s*[:=]\s*[a-zA-Z_$][\w$]*\.error/;

/** 行コメント・ブロックコメントを落とす（規約を書いたコメントを違反として数えないため）。 */
function commentMask(lines) {
  let block = false;
  return lines.map((l) => {
    const t = l.trim();
    if (block) {
      if (t.includes("*/")) block = false;
      return "";
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) block = true;
      return "";
    }
    if (t.startsWith("//") || t.startsWith("*")) return "";
    return l;
  });
}

/**
 * 🚨 **囮が本物を呼べるように、値を受け取る純関数にしてある。**
 * ディスクを読むのは呼び出し側。ここに読み込みを入れると、囮は写しになる。
 * @param {{file: string, text: string}[]} sources
 */
function scan(sources) {
  const counts = {};
  for (const { file, text } of sources) {
    const lines = commentMask(text.split("\n"));
    const n = lines.filter((l) => RE.test(l)).length;
    if (n > 0) counts[file] = n;
  }
  return counts;
}

function collect() {
  const out = [];
  (function walk(dir, rel) {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e.startsWith(".")) continue;
      const p = join(dir, e);
      const r = rel ? `${rel}/${e}` : e;
      if (statSync(p).isDirectory()) walk(p, r);
      else if (/\.tsx?$/.test(e)) out.push({ file: r, text: readFileSync(p, "utf8") });
    }
  })(root, "");
  return out.filter((s) => /^(app|components)\//.test(s.file));
}

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できる／できないことをその場で確かめる）");
let selfTestFailed = false;

const sources = collect();
console.log(
  `  ${sources.length > 0 ? "✅" : "❌"} 対象を拾えている  app/ components/ ${sources.length} ファイル`,
);
if (sources.length === 0) selfTestFailed = true;

// 🚨 囮はすべて **本物の scan() を呼ぶ**（判定を書き写さない）。
const 検出すべき = [
  ["素直な形", `const m = payload.error.message;`],
  ["省略記法", `setError(payload?.error?.message ?? fallback);`],
  ["添字で書く", `return payload["error"].message;`],
  ["🚨 名前を変えて逃げる（この検査の主目的）", `function zzRenamed(p){ return p.error.message }`],
];
const 素通り = 検出すべき.filter(([, t]) => Object.keys(scan([{ file: "決め打ち.tsx", text: t }])).length === 0);
console.log(
  `  ${素通り.length === 0 ? "✅" : "❌"} 囮1: 検出すべき ${検出すべき.length} 通り  → 素通り ${素通り.length} 件` +
    (素通り.length ? `（${素通り.map(([n]) => n).join(" / ")}）` : ""),
);
if (素通り.length !== 0) selfTestFailed = true;

const 検出してはいけない = [
  ["行コメントの中", `// return payload.error.message  ← やってはいけない例`],
  [
    "ブロックコメントの中",
    `/*\n * 悪い例: payload.error.message をそのまま出す\n */\nconst ok = t("x");`,
  ],
  ["辞書を引いている", `setError(t("error_save_failed"));`],
  ["error という名前だが message を読んでいない", `if (payload.error.code === "X") return;`],
];
const 誤検出 = 検出してはいけない.filter(([, t]) => Object.keys(scan([{ file: "決め打ち.tsx", text: t }])).length > 0);
console.log(
  `  ${誤検出.length === 0 ? "✅" : "❌"} 囮2: 検出してはいけない ${検出してはいけない.length} 通り  → 誤検出 ${誤検出.length} 件` +
    (誤検出.length ? `（${誤検出.map(([n]) => n).join(" / ")}）` : ""),
);
if (誤検出.length !== 0) selfTestFailed = true;

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const found = scan(sources);
const files = new Set([...Object.keys(found), ...Object.keys(BASELINE)]);
const 増えた = [];
const 減った = [];
for (const f of [...files].sort()) {
  const now = found[f] ?? 0;
  const base = BASELINE[f] ?? 0;
  if (now > base) 増えた.push(`${f}  ${base} → ${now}`);
  else if (now < base) 減った.push(`${f}  ${base} → ${now}`);
}
const 合計 = Object.values(found).reduce((a, b) => a + b, 0);
const 基準 = Object.values(BASELINE).reduce((a, b) => a + b, 0);

console.log(`\n■ 判定（🚨 減らす検査ではなく「増やさない」検査。基準線は 2026-08-16 の実測）`);
console.log(`  いま ${合計} 件 / ${Object.keys(found).length} ファイル   基準線 ${基準} 件 / ${Object.keys(BASELINE).length} ファイル`);
console.log(`  🚨 この検査は「その message が画面に描かれるか」までは見ていない（先頭の JSDoc）`);

if (減った.length > 0) {
  console.log(`\n✅ 減っています（${減った.length} ファイル）:`);
  for (const l of 減った) console.log(`    ${l}`);
  console.log(`  🚨 **BASELINE から削ってください。** 削らないと、基準線のぶんだけ増えても気づけません。`);
}

if (増えた.length === 0) {
  console.log(`\n問題なし（基準線より増えていません）。`);
  process.exit(0);
}

console.error(`\n🚨 API の生文言を画面へ流す箇所が増えています（${増えた.length} ファイル）:`);
for (const l of 増えた) console.error(`    ${l}`);
console.error(`
  なぜ止めるか: その文言は lib/ の**日本語リテラル**です。
  **英語で見ている人の画面に、日本語がそのまま出ます**（saml が画面で実証済み）。

  直し方: API の **code** を辞書の鍵へ写して引く（\`apiErrorKey()\` が既に在ります）。
  🚨 知らない code は \`unexpected\` へ倒すこと（fail closed）。
  🚨 code だけでは足りない場合が在ります（\`INVALID_FIELD\` 1 つに意味の違う文言が 7 つ）。
     その場合は **lib/ 側が鍵を持つ**必要があるので、勝手に潰さず相談してください。`);
process.exit(1);
