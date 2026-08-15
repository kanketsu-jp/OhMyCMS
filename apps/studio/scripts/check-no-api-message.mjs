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
/**
 * 🚨 **この形の検出は「いまの改行のしかた」に乗っていた**（2026-08-15・司令塔の「3段目」を自分に当てて発見）。
 *
 * 元は `/return\s+\w+\.error\.message/` を **1 行ずつ**当てていた。
 * それで 9 本の写経が捕まったのは、**9 本とも偶然 1 行で書かれていたから**でしかない。実測:
 * ```
 *   ✅ 検出   return payload.error.message;            ← いまの 10 件
 *   🚨 素通り  return payload\n    .error.message;      ← prettier の幅が変わるだけで消える
 *   🚨 素通り  const { message } = payload.error;       ← 分割代入
 *   🚨 素通り  const m = payload.error.message; return m;
 *   🚨 素通り  return ok ? fallback : payload.error.message;
 * ```
 * 🚨 **6 通り試して 4 通りが素通り。** 守りが**整形の副作用**で成立していた。
 * 「いま効いている」は「効き続ける」ではない——**prettier の設定が正しく変わった日に、黙って外れる。**
 *
 * ## 直した形: **`return` を条件にしない。ファイル全文に当てる**
 * `.error.message` を**取り出していること自体**を見る（取り出した先で何をするかは問わない）。
 * 分割代入は別パターンで見る。**取りこぼす側より過検出する側に倒す**
 * （過検出＝人が 1 件見に行くだけ。取りこぼし＝気づけない）。
 */
const SHAPE_PATTERNS = [
  { name: "生文言を取り出している", re: /[a-zA-Z_$][\w$]*(?:\?)?\s*\.\s*error(?:\?)?\s*\.\s*message\b/g },
  // 分割代入: const { message } = payload.error / const { message: m } = res?.error
  { name: "生文言を分割代入している", re: /\{[^{}\n]*\bmessage\b[^{}\n]*\}\s*=\s*[a-zA-Z_$][\w$]*(?:\?)?\s*\.\s*error\b/g },
];

/**
 * 行ごとの「コメントか」を、**ブロックの状態を持って**判定する（2026-08-15）。
 *
 * 🚨 それまで行頭の記号だけで見ていたので、**ブロックコメントの継続行が実コードとして残った**:
 * ```
 * /* 🚨 …             ← 行頭が /* なので落ちる
 *    `xxx` は使わない  ← 🚨 残る（バッククォート始まりなので、どの記号にも当たらない）
 * ```
 * 実測でこの穴に落ちたのは hover の計器（1 件多く報告した）。ここも同じ形だった。
 * **経緯コメント（「かつてこう書いていた」）を違反として拾う**ので、
 * **書き残すほど検査が赤くなる**という逆向きの圧力になる。
 */
function commentMask(lines) {
  const mask = [];
  let inBlock = false;
  for (const line of lines) {
    const t = line.trim();
    if (inBlock) { mask.push(true); if (t.includes("*/")) inBlock = false; continue; }
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      mask.push(true);
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    mask.push(t.startsWith("//") || t.startsWith("*"));
  }
  return mask;
}

/** 1 行だけを見る版（自己検査の囮で使う。**ブロックの継続行は判定できない**）。 */
function isComment(line) {
  return commentMask([line])[0];
}

/**
 * 対象ファイルを走査して違反を返す。
 * 🚨 **全文に当てる**（行ごとではない）。行ごとだと、改行が入った瞬間に見えなくなる。
 *    行番号は一致位置から数える。
 */
function scan(files) {
  const hits = [];
  for (const file of files) {
    const src = readFileSync(resolve(root, file), "utf8");
    const lines = src.split("\n");
    const マスク = commentMask(lines);
    /** 文字位置 → 行番号（1 始まり）。 */
    const lineAt = (index) => src.slice(0, index).split("\n").length;

    // 規則①: 名前そのもの（apiMessage の復活）。こちらは 1 行で足りる。
    lines.forEach((line, i) => {
      if (!line.includes(NEEDLE) || マスク[i]) return;
      hits.push({ file, line: i + 1, rule: "画面側からの呼び出し", text: line.trim().slice(0, 100) });
    });

    // 規則②: 生文言の取り出し。**全文に当てる。**
    for (const { re } of SHAPE_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = lineAt(m.index);
        // 🚨 一致が始まった行がコメントなら落とす（経緯の記述を違反にしない）。
        if (マスク[line - 1]) continue;
        // 同じ行を 2 つのパターンが拾ったら 1 件にまとめる（内訳の合計がずれる）。
        if (hits.some((h) => h.file === file && h.line === line)) continue;
        hits.push({
          file,
          line,
          rule: "API の生文言をそのまま返している（別名の写経）",
          text: (lines[line - 1] ?? "").trim().slice(0, 100),
        });
      }
    }
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

// 🚨 囮2b: **ブロックコメントの継続行**（バッククォート始まりで、どの記号にも当たらない）。
//    行頭判定だけだと、ここが実コードとして残る（2026-08-15 に hover の計器で実際に踏んだ形）。
const ブロック = [
  "/**",
  " * かつて apiMessage() があった",
  "   `payload.error.message` をそのまま返していた",   // 🚨 記号で始まらない継続行
  "   return payload.error.message;",                   // 🚨 コメントの中の実コード風
  " */",
  "const real = 1;",
];
const マスク = commentMask(ブロック);
const 継続行の誤検出 = ブロック.filter((_, i) => !マスク[i]).length - 1; // 最後の実コード 1 行は正しい
console.log(`  ${継続行の誤検出 === 0 ? "✅" : "❌"} 囮2b: ブロックコメントの継続行  → 誤検出 ${継続行の誤検出} 件`);
if (継続行の誤検出 !== 0) selfTestFailed = true;

// 🚨 囮3: 別名の写経。実際に 9 本生きていた形（2026-08-15）。
/**
 * 🚨 囮3 は **整形を変えた形も含めて**測る（2026-08-15）。
 *    元は 1 行の形だけを試していたので、**守りが整形に乗っていること自体が見えなかった**。
 *    ここに並べた 5 通りが、実際に 4 通り素通りしていた形。
 */
const shapeVariants = [
  ["1 行（いまの 10 件）", "  return payload.error.message;"],
  ["改行が入る", "  return payload\n    .error.message;"],
  ["分割代入", "  const { message } = payload.error;\n  return message;"],
  ["変数に入れてから返す", "  const m = payload.error.message;\n  return m;"],
  ["三項の中", "  return ok ? fallback : payload.error.message;"],
];
const shapeMissed = shapeVariants.filter(
  ([, src]) => !SHAPE_PATTERNS.some((p) => { p.re.lastIndex = 0; return p.re.test(src); }),
);
console.log(`  ${shapeMissed.length === 0 ? "✅" : "❌"} 囮3: 生文言を返す ${shapeVariants.length} 通り  → 素通り ${shapeMissed.length} 件${shapeMissed.length ? "（" + shapeMissed.map(([n]) => n).join(" / ") + "）" : ""}`);
if (shapeMissed.length !== 0) selfTestFailed = true;

// 誤検出しないこと（辞書経由・code を見る形）。
// 🚨 過検出しないこと。**全文に当てる形にしたので、ここが前より効く**（範囲が広がった分だけ誤検出も増えうる）。
const shapeNear = ["  return t(errorKey);", "  return payload.error.code;", "  const { code } = payload.error;"]
  .filter((l) => SHAPE_PATTERNS.some((p) => { p.re.lastIndex = 0; return p.re.test(l); })).length;
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

/**
 * 🚨 **規則ごとの内訳を出す。0 の規則も必ず出す**（2026-08-15）。
 *
 * この検査は 2 つの規則を持っていて、**片方は 0 件のまま**になる:
 *   「画面側からの呼び出し」… apiMessage() は削除済みなので、**誰も呼んでいないのが正常**。
 *                              この規則は**復活したら鳴る番人**であって、死んでいるのではない。
 *
 * 内訳を出さないと「違反 10 件」としか見えず、**10 件が全部どちらの規則か分からない**。
 * そして 0 の規則は、次の人に「使われていないから消そう」と読まれる。
 *
 * 🚨 **0 には 3 種類ある**（knowledge/decisions/checks-must-declare-blind-spots.md）:
 *   異常が無い 0 ／ 見ていない 0 ／ **まだ出番が来ていない 0**。
 *   この規則の 0 は 3 つめ。**対象は 213 ファイル見ている**（上の行が根拠）ので、
 *   「見ていない 0」ではない。**消す理由にならない。**
 */
const RULES = [
  { name: "画面側からの呼び出し", note: "apiMessage() は削除済み。**復活したら鳴る番人**なので 0 が正常" },
  { name: "API の生文言をそのまま返している（別名の写経）", note: "" },
];
for (const rule of RULES) {
  const n = hits.filter((h) => h.rule === rule.name).length;
  // 🚨 **単位を書く**（2026-08-15）。「27 件」は行数で、直す箇所の数ではない。
  //    実測: 27 行のうち 10 行は、別の 10 行と**同じ関数の別の行**（`typeof …` の番人行）。
  //    ファイル数を併記しないと、受け取った人が「27 箇所直す」と読む。
  const fileCount = new Set(hits.filter((h) => h.rule === rule.name).map((h) => h.file)).size;
  const tail = n === 0 ? `  ← まだ出番が来ていない 0（対象は見ている）${rule.note ? " / " + rule.note : ""}` : `（${fileCount} ファイル）`;
  console.log(`    ${String(n).padStart(3)} 行  ${rule.name}${tail}`);
}
/**
 * 🚨 内訳が実態と合わない形は **2 つあり、原因が違う**（2026-08-15・polish の実測を受けて分けた）。
 *
 *   合計 < 違反   … どの規則にも属さない違反がある（**種別を付け忘れた**）
 *   合計 > 違反   … 同じ違反を複数の規則が数えている（**規則名が重複している**）
 *
 * 🚨 **どちらも「内訳が合わない」で落ちるが、直す場所が違う。**
 *    最初は両方を「種別を付け忘れた」と報告していた。実測（規則名を重複させた RED）で
 *    **20 件 ≠ 10 件と正しく落ちたのに、原因の説明だけが嘘**だった。
 *    ＝ **捕まえたことと、正しく名指しできることは別。**
 *
 * polish の版（`check-surface-nesting`）は表示を `why` で畳む作りなので、
 * **重複しても合計・行数とも一致してしまい、この突き合わせでは捕まらない**。
 * こちらは規則ごとに filter する作りなので二重計上になり、合計で捕まる。
 * **同じ「内訳の嘘」でも、検査の作りによって捕まる経路が違う。**
 */
const names = RULES.map((rule) => rule.name);
const duplicated = names.filter((name, i) => names.indexOf(name) !== i);
const counted = RULES.reduce((sum, rule) => sum + hits.filter((h) => h.rule === rule.name).length, 0);
if (duplicated.length > 0 || counted !== hits.length) {
  const cause =
    duplicated.length > 0
      ? `**規則名が重複しています**: ${[...new Set(duplicated)].join(" / ")}（同じ違反を複数の規則が数えます）`
      : counted < hits.length
        ? "**種別の付いていない違反があります**（scan が付ける rule と RULES の名前が食い違っている）"
        : "**同じ違反が複数の規則に数えられています**";
  console.error(`\n🚨 内訳 ${counted} 件 ／ 違反 ${hits.length} 件 ／ 規則 ${RULES.length} 件。${cause}`);
  console.error("   この検査自身の欠陥です。**判定結果は信用できません**（数が合わない内訳は、0 の意味も嘘になります）。");
  process.exit(1);
}

if (hits.length === 0) process.exit(0);

console.error(`\n🚨 画面側から \`${NEEDLE}\` を呼んでいます。**API の生文言は画面へ出さないこと。**`);
for (const h of hits) console.error(`  [${h.rule}] ${h.file}:${h.line}  ${h.text}`);
console.error(
  "\n  直し方: `apiErrorKey()` を使う（code を辞書の鍵へ写し、知らない code は unexpected へ倒す）。" +
    "\n  🚨 生文言を `?error=` に載せると、細工したリンクで任意の文章を公式のエラー枠に出せます。",
);
process.exit(1);
