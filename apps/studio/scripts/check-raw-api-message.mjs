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
 *    🚨 **12 ファイルのうち、画面まで追跡できたのは agents-manager 1 件だけ**
 *       （残り 11 は「setError に渡っている」までしか見ていない。2026-08-16 に全件 0 件へ）
 * 🚨 **`payload.error` を一度掴んでから読む形**（囮3 が毎回実演する）
 *    `const { message } = payload.error` / `const e = payload.error; e.message`
 *    `const { message: m } = payload.error ?? {}`
 *    → **行単位の走査では追えない。** 変数を追うなら別の作り（AST）が要る
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
// 🚨 2026-08-16: 7 ファイルを `errorKeyFromApiCode()` へ寄せて 0 件にしたので、ここから削った
//    （残り 5 は auth / saml が別作業で触っている最中。終わってから寄せる）。
//    削らないと、そのぶん増えても気づけない——この検査自身がそう書いている。
const BASELINE = {
};

/**
 * 🚨 振る舞いで見る。識別子は見ない。
 *
 * 🚨 2026-08-16 拡張。[w4A:p25 / toast] が**見逃す入力を 6 通り作って**持ってきた。
 * そのうち 3 つを拾えるようにした（`!` を挟む / `?.["message"]` / `["error"]?.["message"]`）。
 * **残り 3 つ（分割代入・変数へ入れる・別名で分割代入）は拾えない。** 囮3 が毎回実演する。
 */
const MSG = String.raw`(?:\.\s*message\b|\??\.\s*\[["']message["']\]|\[["']message["']\])`;
const RE = new RegExp(
  String.raw`\berror(?:\?|!)?` + MSG +
  "|" + String.raw`\[["']error["']\]\s*(?:\?)?` + MSG +
  "|" + String.raw`\bmessage\b\s*[:=]\s*[a-zA-Z_$][\w$]*\.error`,
);

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
  /** 🚨 コメントの中に在って**意図的に除外した**もの。「見ていない」と区別するために数える。 */
  const 除外 = [];
  /** 🚨 拾った行の実物。**数だけ見ていると書き方の揺れに気づけない**（`?.` を落とした事故）。 */
  const 生の行 = [];
  for (const { file, text } of sources) {
    const raw = text.split("\n");
    const lines = commentMask(raw);
    let n = 0;
    lines.forEach((l, i) => {
      if (!RE.test(l)) {
        // マスク後は消えたが、元の行には在った → コメントで落とした
        if (RE.test(raw[i])) 除外.push(`${file}:${i + 1}  ${raw[i].trim().slice(0, 70)}`);
        return;
      }
      n += 1;
      生の行.push(`${file}:${i + 1}  ${l.trim().slice(0, 78)}`);
    });
    if (n > 0) counts[file] = n;
  }
  return { counts, 除外, 生の行 };
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

// 🚨 **囮は scan() を直接呼ぶ＝実物より内側から入っている。**
//    だから **走査対象を決める処理（collect / load）が死んでも、囮 1・2 は緑のまま**。
//    それを捕まえているのは、下の「対象を拾えている」の 0 ガードだけ。
//    🔴 実測 2026-08-16（台の上で collect を空にした）: 囮1 ✅ / 囮2 ✅ のまま、
//       「対象 0 ファイル」で ❌ → exit 1。**囮ではなく 0 ガードが止めている。**
//    🚨 そして 0 ガードは **0 しか見ない**。214 → 1 に減っても通る。
//    由来: 司令塔 2026-08-16「囮が実物より内側から入っていると、外側の門が死んでも全部通る」。
//    🚨 実物の入口から入れるには**ディスクにファイルを置く**ことになり、共有ツリーを触るので
//    やっていない（**作れない理由を書く**）。
// 🚨 囮はすべて **本物の scan() を呼ぶ**（判定を書き写さない）。
const 検出すべき = [
  ["素直な形", `const m = payload.error.message;`],
  ["省略記法", `setError(payload?.error?.message ?? fallback);`],
  ["添字で書く", `return payload["error"].message;`],
  ["🚨 名前を変えて逃げる（この検査の主目的）", `function zzRenamed(p){ return p.error.message }`],
];
const 素通り = 検出すべき.filter(([, t]) => Object.keys(scan([{ file: "決め打ち.tsx", text: t }]).counts).length === 0);
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
const 誤検出 = 検出してはいけない.filter(([, t]) => Object.keys(scan([{ file: "決め打ち.tsx", text: t }]).counts).length > 0);
console.log(
  `  ${誤検出.length === 0 ? "✅" : "❌"} 囮2: 検出してはいけない ${検出してはいけない.length} 通り  → 誤検出 ${誤検出.length} 件` +
    (誤検出.length ? `（${誤検出.map(([n]) => n).join(" / ")}）` : ""),
);
if (誤検出.length !== 0) selfTestFailed = true;

// 🚨 囮3: **見逃す入力**を作って通す。落ちないことを確かめてから「見ていない」と書く。
//    判定には影響させない。**拾えるようになったら、ここで気づける。**
//    由来: 2026-08-16 [w4A:p25 / toast] が 6 通り作って持ってきた。3 つは拾えるようにし、
//    残り 3 つは **`payload.error` を一度掴んでから読む形**なので、行単位の走査では追えない。
const 見逃すはず = [
  ["分割代入", 'const { message } = payload.error;'],
  ["変数へ入れる", 'const e = payload.error; setError(e.message);'],
  ["別名で分割代入", 'const { message: m } = payload.error ?? {};'],
];
// 🚨 対照が先。**対照が死んでいると「見逃した」は「検出器が死んでいるだけ」で、何も言っていない。**
//    由来: 2026-08-16 [w4A:p1H / polish]。同日 toast も「4 本とも出ず、3 本見逃したと書きかけた」。
const 囮3の対照 = Object.keys(scan([{ file: "決め打ち.tsx", text: "payload.error.message" }]).counts).length > 0;
if (!囮3の対照) {
  console.error("  ❌ 囮3 の対照が拾えない。**この先の「見逃した」は意味を持たない**（検出器が死んでいる）。");
  selfTestFailed = true;
}
const 実は拾えた = 見逃すはず.filter(([, t]) => Object.keys(scan([{ file: "決め打ち.tsx", text: t }]).counts).length > 0);
console.log(
  `  ⚪ 囮3: **見逃すはず** ${見逃すはず.length} 通り  → 実際に見逃した ${見逃すはず.length - 実は拾えた.length} 件` +
    (実は拾えた.length
      ? `  🚨 拾えるようになった: ${実は拾えた.map(([n]) => n).join(" / ")} → JSDoc の「見ていないもの」を直すこと`
      : "（＝ JSDoc の記述どおり。**変数に入れてから読む形は追えない**）"),
);

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const { counts: found, 除外, 生の行 } = scan(sources);
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

// 🚨 「見ていない 0」と「除外した 0」を分ける。**除外は理由とセットで出す。**
console.log(`  除外: コメントの中に在って落としたもの ${除外.length} 件${除外.length ? "" : "（＝コメントで隠れている違反は無い）"}`);
for (const l of 除外) console.log(`    - ${l}`);

// 🚨 **数だけ見ていると、書き方の揺れに気づけない。**
// 実例（2026-08-16）: `error.message` だけで探した人が `error?.message` の 2 件を落とし、
// 「12 ではなく 10」と訂正して、それが 2 人を経由して配られた。**生の行を見れば `?.` は目に入る。**
if (生の行.length > 0) {
  console.log(`  拾った行の実物（先頭 3 本。🚨 書き方の揺れは数でなく行で見る）:`);
  for (const l of 生の行.slice(0, 3)) console.log(`    ${l}`);
}

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
