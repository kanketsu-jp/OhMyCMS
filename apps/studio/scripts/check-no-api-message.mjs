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
/**
 * 🚨 **囮が「本物」を呼べるように、テキストを受け取る形にした**（2026-08-15）。
 *
 * それまで `scan(files)` がパスを受け取ってディスクから読んでいたので、
 * **囮は判定ロジックを書き写す**しかなかった。実測した結果:
 * ```
 * scan() の本体を殺して何も返さないようにする
 *   → 囮 5 本すべて **✅ のまま** ／ 違反 22 → **0 件** ／ **exit 0**
 *   ＝ **壊れた検査が、門を素通りする**
 * ```
 * **囮が写しだと、本物が壊れても囮は気づかない。** 呼ぶ形に変えた。
 */
function scan(sources) {
  const hits = [];
  for (const { file, text: src } of sources) {
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
// 🚨 **ファイル数は「読めた」の証拠にならない。** 列挙だけできて中身が空でも同じ数が出る。
//    そしてこの検査は **違反 0 件が正常**なので、壊れたときの出力が**正常時と同じ顔**になる
//    （司令塔 2026-08-16: 「0 が正常値の検査」11 本のうちの 1 本）。
// 🚨 **判定に使う本文は、本番と同じ 1 回の読み込みから採る。**
//    別に readFileSync すると、**本番側の読み込みが壊れても守りは気づかない**
//    （今日の「囮は実物と同じ入口から入れる」と同じ形。最初そう書いて、書き直した）。
// 🚨 **絶対値でなく比率**（絶対値は repo が育つと腐る）。
//    実測 2026-08-16: 候補 394 → 列挙 214 ＝ **0.543** ／ 平均 **3,509 文字**
//    上にも幅: **比率が 1.0 へ跳ねたら、範囲が広がって他人のファイルまで見ている**。
const sources = files.map((f) => ({ file: f, text: readFileSync(resolve(root, f), "utf8") }));
const 比率の下限 = 0.3;
const 比率の上限 = 0.8;
const 平均文字数の下限 = 800;
const 候補 = globSync("**/*.{ts,tsx}", { cwd: root, exclude: ["node_modules/**"] }).length;
const 総文字数 = sources.reduce((a, x) => a + x.text.length, 0);
const 比率 = 候補 > 0 ? sources.length / 候補 : 0;
const 平均 = sources.length > 0 ? Math.round(総文字数 / sources.length) : 0;
const scanned = 比率 >= 比率の下限 && 比率 <= 比率の上限 && 平均 >= 平均文字数の下限;
console.log(
  `  ${scanned ? "✅" : "❌"} 対象を拾えている  **候補** ${候補} → **列挙** ${sources.length}` +
    `（比率 ${比率.toFixed(3)}。許容 ${比率の下限}〜${比率の上限}） / ` +
    `**読めた** ${総文字数.toLocaleString()} 文字（**平均 ${平均.toLocaleString()}**。下限 ${平均文字数の下限}）`,
);
if (!scanned) {
  console.error(
    `     🚨 ${平均 < 平均文字数の下限 ? "読めた量が足りない（読み込みが死んでいる可能性）" : 比率 > 比率の上限 ? "範囲が広がりすぎ（他人のファイルまで見ている可能性）" : "列挙が足りない"}。` +
      `**「違反 0 件」より先に、読み込みか走査の範囲が壊れていることを疑ってください。**`,
  );
  selfTestFailed = true;
}

// 🚨 ここから下の囮は、**すべて本物の scan() を呼ぶ**（判定ロジックを書き写さない）。
//    写しだと、scan() が壊れても囮は ✅ のまま通る（2026-08-15 に実測して確認した）。
const 囮 = (text) => scan([{ file: "decoy.tsx", text }]);

// (2) 実コードの呼び出しを検出できるか。
const hitReal = 囮("const m = await apiMessage(res);").length;
console.log(`  ${hitReal === 1 ? "✅" : "❌"} 囮1: 実コードの呼び出し  → 検出 ${hitReal} 件`);
if (hitReal !== 1) selfTestFailed = true;

// (3) 🚨 コメントを誤検出しないか。ここを見落とすと、経緯のコメントが書けなくなる。
const falsePositives = 囮([" * かつて apiMessage() があった", "// apiMessage は使わない", "/* apiMessage */"].join("\n")).length;
console.log(`  ${falsePositives === 0 ? "✅" : "❌"} 囮2: コメントの言及  → 誤検出 ${falsePositives} 件`);
if (falsePositives !== 0) selfTestFailed = true;

// 🚨 囮2b: **ブロックコメントの継続行**（記号で始まらないので、行頭判定では残る）。
const 継続行の誤検出 = 囮([
  "/**",
  " * かつて apiMessage() があった",
  "   `payload.error.message` をそのまま返していた",
  "   return payload.error.message;",
  " */",
].join("\n")).length;
console.log(`  ${継続行の誤検出 === 0 ? "✅" : "❌"} 囮2b: ブロックコメントの継続行  → 誤検出 ${継続行の誤検出} 件`);
if (継続行の誤検出 !== 0) selfTestFailed = true;

// 🚨 囮3: 生文言を返す 5 通り。**整形が変わっても捕まえられるか**（元は 1 行の形だけ試していた）。
const shapeVariants = [
  ["1 行", "  return payload.error.message;"],
  ["改行が入る", "  return payload\n    .error.message;"],
  ["分割代入", "  const { message } = payload.error;\n  return message;"],
  ["変数に入れてから返す", "  const m = payload.error.message;\n  return m;"],
  ["三項の中", "  return ok ? fallback : payload.error.message;"],
];
const shapeMissed = shapeVariants.filter(([, src]) => 囮(src).length === 0);
console.log(`  ${shapeMissed.length === 0 ? "✅" : "❌"} 囮3: 生文言を返す ${shapeVariants.length} 通り  → 素通り ${shapeMissed.length} 件${shapeMissed.length ? "（" + shapeMissed.map(([n]) => n).join(" / ") + "）" : ""}`);
if (shapeMissed.length !== 0) selfTestFailed = true;

// 囮4: 誤検出しないこと（辞書経由・code を見る形）。
const shapeNear = 囮(["  return t(errorKey);", "  return payload.error.code;", "  const { code } = payload.error;"].join("\n")).length;
console.log(`  ${shapeNear === 0 ? "✅" : "❌"} 囮4: 辞書経由 / code を見る形  → 誤検出 ${shapeNear} 件`);
if (shapeNear !== 0) selfTestFailed = true;

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
// 🚨 上で作った sources をそのまま使う（**守りと本番が同じ読み込みを共有する**）。
const hits = scan(sources);
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
