#!/usr/bin/env node
/**
 * 画面側（`app/**` / `components/**`）から `apiMessage` を呼んでいないかを確かめる。
 *
 * 由来: 2026-08-15。`lib/admin/forms.ts` に **API の生文言をそのまま返す `apiMessage()`** があった。
 *
 * 🚨 **これは i18n の話ではなく、なりすましの話。**
 *    `?error=` は利用者が自由に書けるので、生文言を載せる作りだと
 *    **細工したリンクで任意の文章を「アプリが出した公式のエラー」として画面に出せる**。
 *    正しい経路は `apiErrorKey()`——**code だけ**を辞書の鍵へ写し、
 *    知らない code は `unexpected` へ倒す（fail closed）。
 *
 * 削除時点で呼び出しは 0 件だったが、**無いと次の人が「便利だから」と作り直す**。
 * 関数を消すだけでは戻ってくるので、**戻ってこないことを機械で見る**。
 *
 * 決定: `knowledge/decisions/i18n-check-scope-is-what-reaches-the-screen.md`
 *
 * 🚨 **コメントの中の言及は落とさない。** `forms.ts` の JSDoc に「かつてあった」経緯を
 *    残してあるので、そこを違反にすると経緯を消す圧力になる。
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEEDLE = "apiMessage";
/**
 * 🚨 **名前ではなく「形」で捕まえる**（2026-08-15 追加）。
 *
 * `apiMessage()` を消して名前を見張るだけにしていたら、**同じ働きの関数が 9 本、
 * `messageFrom` という別名で生きていた**（toast の実測）。実装は 9 本とも同一で、
 * `setError(messageFrom(payload, …))` として**画面に出ていた**。
 * 🚨 **関数を消すだけでは戻ってくる、と書いて検査まで作ったのに、
 *    「同じ働きの別名」を数えていなかった。** 名前を見張ると、次は `errorTextOf` が生える。
 *
 * だから **API の応答から取り出した文言を、そのまま返している形**を見る。
 * 正しい経路は `apiErrorKey()`——code を辞書の鍵へ写し、知らない code は `unexpected` へ倒す。
 */
const SHAPE_PATTERN = /return\s+[a-zA-Z_$][\w$]*(?:\?)?\.error(?:\?)?\.message\b/;

/** 行がコメントなら true（`//` 始まり・JSDoc の `*` 始まり・`/*` 始まり）。 */
function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/** 対象ファイルを走査して、コメント以外で NEEDLE を含む行を返す。 */
function scan(files) {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(resolve(root, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      const byName = line.includes(NEEDLE);
      const byShape = SHAPE_PATTERN.test(line);
      if (!byName && !byShape) return;
      if (isComment(line)) return;
      // 🚨 **何の規則で赤くなったか**を持たせる（2026-08-15・司令塔）。
      //    「赤くなった」と「狙ったものを捕まえた」は別。種別が無いと、
      //    別の理由（自己検査の的が消えた等）で落ちたときに読み分けられない。
      hits.push({
        file,
        line: i + 1,
        rule: byName ? "画面側からの呼び出し" : "API の生文言をそのまま返している（別名の写経）",
        text: line.trim().slice(0, 100),
      });
    });
  }
  return hits;
}

const files = globSync("{app,components}/**/*.{ts,tsx}", { cwd: root });

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
let selfTestFailed = false;

// (1) そもそも対象を拾えているか。0 件なら「違反が無い」ではなく「見ていない」。
const scanned = files.length > 0;
console.log(`  ${scanned ? "✅" : "❌"} 対象を拾えている  ${files.length} ファイル`);
if (!scanned) selfTestFailed = true;

// (2) 実コードの呼び出しを検出できるか。
const decoyReal = scan.call(null, []).length === 0;
const hitReal = [{ f: "decoy.tsx", src: `const m = await apiMessage(res);` }]
  .filter(({ src }) => src.includes(NEEDLE) && !isComment(src)).length === 1;
console.log(`  ${hitReal && decoyReal ? "✅" : "❌"} 囮1: 実コードの呼び出し  → 検出 ${hitReal ? 1 : 0} 件`);
if (!hitReal) selfTestFailed = true;

// (3) 🚨 コメントを誤検出しないか。ここを見落とすと、経緯のコメントが書けなくなる。
const commentSamples = [" * かつて apiMessage() があった", "// apiMessage は使わない", "/* apiMessage */"];
const falsePositives = commentSamples.filter((s) => s.includes(NEEDLE) && !isComment(s)).length;
console.log(`  ${falsePositives === 0 ? "✅" : "❌"} 囮2: コメントの言及  → 誤検出 ${falsePositives} 件`);
if (falsePositives !== 0) selfTestFailed = true;

// 🚨 囮3: 別名の写経。実際に 9 本生きていた形（2026-08-15）。
const shapeDecoy = SHAPE_PATTERN.test("    return payload.error.message;");
console.log(`  ${shapeDecoy ? "✅" : "❌"} 囮3: 別名で生文言を返す  → 検出 ${shapeDecoy ? 1 : 0} 件`);
if (!shapeDecoy) selfTestFailed = true;

// 誤検出しないこと（辞書経由・code を見る形）。
const shapeNear = ["  return t(errorKey);", "  return payload.error.code;"].filter((l) => SHAPE_PATTERN.test(l)).length;
console.log(`  ${shapeNear === 0 ? "✅" : "❌"} 囮4: 辞書経由 / code を見る形  → 誤検出 ${shapeNear} 件`);
if (shapeNear !== 0) selfTestFailed = true;

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const hits = scan(files);
console.log(`\n■ 判定`);
console.log(`  対象: ${files.length} ファイル（app/**, components/** の .ts/.tsx）`);
console.log(`  違反: ${hits.length} 件`);

if (hits.length === 0) process.exit(0);

console.error(`\n🚨 画面側から \`${NEEDLE}\` を呼んでいます。**API の生文言は画面へ出さないこと。**`);
for (const h of hits) console.error(`  [${h.rule}] ${h.file}:${h.line}  ${h.text}`);
console.error(
  "\n  直し方: `apiErrorKey()` を使う（code を辞書の鍵へ写し、知らない code は unexpected へ倒す）。" +
    "\n  🚨 生文言を `?error=` に載せると、細工したリンクで任意の文章を公式のエラー枠に出せます。",
);
process.exit(1);
