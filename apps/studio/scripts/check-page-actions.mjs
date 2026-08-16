/**
 * `lib/admin/page-actions.ts`（各ページのアクションボタンの定義）が、
 * **実在するもの**だけを指しているかを確かめる。
 *
 * なぜ要るか:
 * この定数は「辞書キー」「form の id」「行き先のルート」を**文字列で**持っている。
 * どれも普通の型検査では見えない。つまり、
 *   - 辞書キーが死ぬ → **ボタンにキー文字列がそのまま出る**
 *   - form の id が消える → **「保存」を押しても黙って何も起きない**（一番たちが悪い）
 *   - 行き先が消える → 押すと 404
 * のどれも、**画面を見ているだけでは気づけない**か、気づくのが遅い。
 *
 * 🚨 **▾（オプション）の中について**（2026-08-16・**当初の記述は誤りでした。経緯ごと残します**）。
 *
 * 283 A で「削除は主アクションから外し、▾ の中へ」が決まったとき、私はこう書きました:
 *   ❌ 「`PAGE_ACTIONS` に **▾ の中を宣言する欄がありません**」
 *   ❌ 「**▾ へ移した操作は `labelKey` / `form` / `href` / `role` の 4 つとも見なくなります**」
 *   ⚠️ 「部品の形が動いている間は宣言の形を決められないので、**いま広げない**」
 *      🚨 **これは判断としては正しかった**（司令塔もそう書いている）。
 *      **外れていたのは前提のほう**——**その時点で ▾ の形は既に固まっていた**
 *      （base2 が実機で ▾ の寸法・キーボード操作まで測り終えていた）。
 *      ＝ 🚨 **正しい判断が、古い前提の上に乗ると、間違った結論になる。**
 *
 * 🚨 **その時点で、既に `inMenu` が入っていました**（shell が同じ時刻に足していた）。
 *    【測った】`inMenu` … `lib/admin/page-actions.ts` に **2 件** /
 *              `check-page-actions-rendered.mjs` に **11 件**
 *    【測った】台で `inMenu: true` を 1 件だけ false にすると **exit 1**（戻すと exit 0）
 *    ＝ 🚨 **検査は ▾ の中を見ています。上の 3 行は事実と違います。**
 *
 * 🚨 **なぜ消さずに残すか**: 「▾ の中は検査の外」と読んだ人は、
 *    **宣言を書かずに ▾ へ移して門を落とす**か、**移すのをためらって 283 A が止まる**。
 *    誤りだけ消すと、**次に同じ誤解をした人が同じ結論に達します**（base2 の指摘）。
 *
 * 🚨 いま ▾ の中がどう照合されるかは **`check-page-actions-rendered.mjs` の冒頭**に在ります
 *    （`form=` ではなく `options={[ … ]}` の中の `formId:` を見る）。**2 箇所に書きません。**
 *
 * 🚨 この検査は「0 件でした」を返さない。**何件見たかを必ず出す**
 *    （`~/.claude/rules/count-before-you-report.md`: 異常が無い 0 と、見ていない 0 は
 *      同じ見た目になる）。対象が 0 件なら、それ自体を失敗として扱う。
 */

import { execFileSync } from "node:child_process";

import { stripComments } from "./strip-comments.mjs";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actionsPath = resolve(root, "lib/admin/page-actions.ts");
const metaPath = resolve(root, "lib/admin/page-meta.ts");

if (!existsSync(actionsPath)) {
  console.error(`■ ${actionsPath} が無い`);
  process.exit(1);
}

// 🚨 **検出器は 2 つある。両方に当てる**（司令塔 2026-08-15）。
//    ①「呼び出し側のソース」（下の `code`）には先にコメント除去を入れたが、
//    ②「この表そのもの」には当てていなかった。
//    実測（囮を**表の中**に置いて確認）: コメントアウトした定義を 1 件足すと
//      生ソース … labelKey **28 件（拾う）** ／ 除去後 … 27 件（拾わない）
//    ＝ **コメントアウトした定義を、生きている定義として数えていた**。
//    いま差 0 なのは、まだ誰もコメントアウトしていないだけ（＝まだ出番が来ていない過検出）。
//    🚨 囮を最初 `export const PAGE_ACTIONS` の**前**に置いて、**範囲外で何も試していなかった**。
const src = stripComments(readFileSync(actionsPath, "utf8"));

// ── 定義を取り出す ──────────────────────────────────────────
// 🚨 `PAGE_ACTIONS` の中だけを見る。型定義（PageActionDef）や docstring の
//    例示を拾わないよう、開始位置を限定する。
const tableStart = src.indexOf("export const PAGE_ACTIONS");
if (tableStart < 0) {
  console.error("■ PAGE_ACTIONS が見つからない（名前を変えたなら、この検査も直すこと）");
  process.exit(1);
}
const table = src.slice(tableStart);

/** ルートのキー（`"/admin/..." : [`）を、その並び順で取り出す */
const routes = [...table.matchAll(/^ {2}"(\/admin[^"]*)":\s*\[/gm)].map((m) => m[1]);
const labelKeys = [...table.matchAll(/labelKey:\s*"([^"]+)"/g)].map((m) => m[1]);
const formIds = [...table.matchAll(/form:\s*"([^"]+)"/g)].map((m) => m[1]);
const hrefs = [...table.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

const problems = [];

// 🚨 対象が 0 件なら「見ていない」。正常として通さない。
if (routes.length === 0) problems.push("[空振り] PAGE_ACTIONS からルートを1件も取り出せなかった");
if (labelKeys.length === 0) problems.push("[空振り] labelKey を1件も取り出せなかった");

// ── ① 辞書キーが ja / en の両方に実在するか ──────────────────
for (const full of new Set(labelKeys)) {
  const i = full.indexOf(".");
  if (i < 0) {
    problems.push(`[辞書] labelKey "${full}" に名前空間が無い（"namespace.key" の形で書く）`);
    continue;
  }
  const ns = full.slice(0, i);
  const key = full.slice(i + 1);
  for (const locale of ["ja", "en"]) {
    const file = resolve(root, `i18n/messages/${locale}/${ns}.json`);
    if (!existsSync(file)) {
      problems.push(`[辞書] labelKey "${full}" … ${locale} に名前空間 ${ns} が無い`);
      continue;
    }
    const dict = JSON.parse(readFileSync(file, "utf8"));
    if (!(key in dict)) problems.push(`[辞書] labelKey "${full}" … ${locale} にキーが無い`);
  }
}

// ── ② form の id が実際の <form> に付いているか ──────────────
// 🚨 **`id="..."` を探すだけでは足りない**。div や input にも id は付く。
//    `<form ... id="x"` の形（form 要素であること）まで見る。
const sources = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry)) sources.push(full);
  }
})(root);

// 🚨 **コメントを実装として数えない**（2026-08-15 実測。詳細は strip-comments.mjs）。
const code = sources.map((f) => stripComments(readFileSync(f, "utf8"))).join("\n");
if (sources.length === 0) problems.push("[空振り] 走査対象のソースが 0 件");

// 🚨 **採取した HEAD と作業ツリーの状態を出す**（司令塔 2026-08-15）。
//    共有ツリーでは数分で HEAD も件数も動く。出力だけを渡された人が
//    「いつのツリーの話か」を知る手段が無いと、**別の場所を直す**。
// 🚨 見ていない範囲: 数えるのは **この検査が見る範囲の未コミット変更だけ**（ツリー全体ではない）。
{
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "app", "components", "lib/admin"],
    { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean).length;
  console.log(`採取: HEAD ${head} / cwd ${process.cwd()} / この検査が見る範囲の未コミット変更 ${dirty} 件`);
  console.log(`  見る範囲: lib/admin/page-actions.ts・lib/admin/page-meta.ts と ${sources.length} 本の .ts/.tsx`);
}

/**
 * その id を持つ `<form>` が、渡したソースの中に在るか。
 * 🚨 **囮も本番もこの関数を通す**（囮に同じ正規表現を書き写すと、本物が壊れても囮は ✅ のまま）。
 */
function hasFormWithId(source, id) {
  return new RegExp(`<form[^>]*\\bid="${id}"`).test(source);
}

// ── 自己検査（囮。両方向 + 空振り確認）──────────────────────────────
{
  const real = '<form id="zz-decoy-form" method="post">';
  const inComment = `  // 使用例: ${real}`;
  const okPositive = hasFormWithId(real, "zz-decoy-form");
  const okOther = !hasFormWithId('<div id="zz-decoy-form">', "zz-decoy-form"); // form 以外は数えない
  const negative = hasFormWithId(stripComments(inComment), "zz-decoy-form");
  const negativeRaw = hasFormWithId(inComment, "zz-decoy-form");
  const okNegative = !negative && negativeRaw;
  console.log("自己検査（囮）:");
  console.log(`  ${okPositive ? "✅" : "🚨"} 囮(+): <form id="zz-decoy-form"> → ${okPositive ? "検出" : "検出できず"}`);
  console.log(`  ${okOther ? "✅" : "🚨"} 囮(-/別のタグ): <div id="zz-decoy-form"> → ${okOther ? "拾わない" : "🚨 拾ってしまう"}`);
  console.log(`  ${okNegative ? "✅" : "🚨"} 囮(-/コメント): **コメントの中**の同じ行 → ` +
    `${negative ? "🚨 拾ってしまう" : "拾わない"}` +
    `（🟢 潰さなければ ${negativeRaw ? "拾う＝空振りではない" : "🚨 拾わない＝囮が効いていない"}）`);
  if (!okPositive || !okOther || !okNegative) {
    console.error("\n🚨 自己検査に失敗しました。**この検査の結果は信用できません**。");
    process.exit(1);
  }
}

// 🚨 **0 ガードは 0 しか見ない**／**絶対値は repo が育つと腐る**（司令塔 2026-08-16）。
//    → **1 ファイルあたりの平均文字数**で見る。**repo が育っても平均は育たない。**
//      読み込みが壊れれば平均は落ち、走査の範囲がおかしくなれば平均も動く。
// 🚨 **なぜ「平均文字数」を選んだか**（`check-surface-nesting` は比率。**揃えないのが正しい**）:
//    この検査は **395 本を全部読む＝間引きが無い**ので、走査 ÷ 候補は常に 1.0 で動かない。
//    動くのは「**本数はそのままで痩せる**」側なので、**1 ファイルあたりの平均**を見る。
// 🚨 **平均だけでは足りない**（design の実測・2026-08-16）: **本数ごと減ると平均は動かない**。
//    → **床**（実測値から遠い絶対値）で「丸ごと減る」を捕まえる。
const AVG_CHARS_BASELINE = 3639; // 2026-08-16 実測（1437569 / 395）
const SOURCES_FLOOR = 100; // 🚨 395 から遠い床。app/ と components/ がここを下回ることは想定しない
if (sources.length > 0 && sources.length < SOURCES_FLOOR) {
  console.error(`\n🚨 走査したソースが ${sources.length} 本です（床 ${SOURCES_FLOOR} 本を下回りました）。`);
  console.error("   **走査そのものが途中で止まっている**可能性があります");
  console.error("   （平均文字数は本数と一緒に減るので動きません。**床だけが見ています**）。");
  process.exit(1);
}
const avgChars = sources.length > 0 ? Math.round(code.length / sources.length) : 0;
console.log(`  1 ファイルあたり ${avgChars} 文字（基準 ${AVG_CHARS_BASELINE} ／ 半分未満なら落とす）`);
if (code.length > 0 && avgChars < Math.floor(AVG_CHARS_BASELINE / 2)) {
  console.error(`\n🚨 1 ファイルあたり ${avgChars} 文字しか読めていません（基準 ${AVG_CHARS_BASELINE} の半分未満）。`);
  console.error("   **読み込みか走査の範囲が壊れている**可能性があります。");
  console.error(`   正当な変化なら、**AVG_CHARS_BASELINE を ${avgChars} へ直し、理由を書いてください**。`);
  process.exit(1);
}

// 🚨 **「全部が無い」は、14 個の退行より「読めていない」を疑う**（単一原因の診断）。
{
  const ids = [...new Set(formIds)];
  const missingAll = ids.length > 1 && ids.every((id) => !hasFormWithId(code, id));
  if (missingAll) {
    console.error(`\n🚨 **宣言された form の id が 1 つも見つかりません**（${ids.length} 件すべて）。`);
    console.error(`   走査したソースの文字数は ${code.length} です。`);
    // 🚨 ここは最初 `"..."` の中に `${ids.length}` と書いていて、**そのまま文字として出た**。
    //    ＝ **書いたものと、出たものが違う**（自分の出力でやった。テンプレートリテラルに直した）
    console.error(`   **${ids.length} 個の <form> が同時に消えた**より、**読み込みか走査の範囲が壊れている**`);
    console.error("   ほうが起きやすい形です。**先にそちらを疑ってください。**");
    process.exit(1);
  }
}

for (const id of new Set(formIds)) {
  if (!hasFormWithId(code, id)) {
    problems.push(`[form] id "${id}" を持つ <form> が無い（ヘッダーの送信ボタンが黙って効かなくなる）`);
  }
}

// ── ③ ルート表記が page-meta.ts と揃っているか ──────────────
// 揃っていないと「パンくずは出るのにボタンが無い」「その逆」が起きる。
let metaRoutes = new Set();
if (existsSync(metaPath)) {
  const metaSrc = readFileSync(metaPath, "utf8");
  metaRoutes = new Set(
    [...metaSrc.matchAll(/^ {2}"(\/admin[^"]*)":/gm)].map((m) => m[1]),
  );
  for (const route of routes) {
    if (!metaRoutes.has(route)) {
      problems.push(`[ルート] "${route}" が page-meta.ts に無い（表記ゆれ、または片方の足し忘れ）`);
    }
  }
} else {
  problems.push("[空振り] lib/admin/page-meta.ts が無い（ルートの突き合わせができない）");
}

// ── ④ href の行き先が実在するルートか ───────────────────────
for (const href of new Set(hrefs)) {
  if (metaRoutes.size > 0 && !metaRoutes.has(href)) {
    problems.push(`[href] "${href}" が page-meta.ts に無いルートを指している（押すと 404 になりうる）`);
  }
}

// ── ⑤ 主要（primary）は 1 ルートに 1 つだけ ─────────────────
// 🚨 **この検査の限界**: 読むのは `lib/admin/page-actions.ts` **1 本だけ**。
//    `PAGE_ACTIONS` を別ファイルで組み立てて import する形にされたら、**何も見えない**。
//    「読めない形は落とす」は**同一ファイル内でしか効かない**（2026-08-15・迂回の実測より）。
// 🚨 これは `page-actions.ts` のコメントが「**主要は 1 ページに 1 つだけ**。2 つ並べると
//    『まずこれ』が消える」と**宣言していたのに、どこも守っていなかった**もの（規律12）。
//    2026-08-15 時点で偶然 24 ルートすべて 1 件だったが、**守っていたのは規律であって機械ではない**。
//    コメントが在ることは、守られていることではない。
const primaryCounts = [];
for (const m of src.matchAll(/^ {2}"(\/admin[^"]*)": \[([\s\S]*?)^ {2}\],/gm)) {
  const [, route, block] = m;
  // 🚨 **リテラル以外の書き方は「読めない」として落とす。**
  //    `role: PRIMARY` と変数にするだけでこの検査を迂回できた（2026-08-15 実測: exit 0 で素通り）。
  //    spread（`...{ role: "primary" }`）はテキストとして残るので数に入るが、
  //    変数・文字列連結は残らない。**数えられない形は、0 件として通さない。**
  const roleValues = [...block.matchAll(/role:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
  const unreadable = roleValues.filter((v) => v !== '"primary"' && v !== '"secondary"');
  if (unreadable.length > 0) {
    problems.push(
      `[読めない] ルート "${route}" の role がリテラルではありません（${unreadable.join(" / ")}）。` +
        "静的に数えられないので、主要が何件あるか分かりません（\"primary\" / \"secondary\" と直接書いてください）",
    );
  }
  const count = (block.match(/role: "primary"/g) ?? []).length;
  primaryCounts.push({ route, count });
  if (count !== 1) {
    problems.push(
      `[主要] ルート "${route}" の主要ボタンが ${count} 件（1 件でなければならない）` +
        `${count === 0 ? "。既定の操作が無い" : "。どれが『まずこれ』か分からなくなる"}`,
    );
  }
}
if (primaryCounts.length === 0) {
  problems.push("主要ボタンの数を 1 ルートも数えられなかった（PAGE_ACTIONS の書き方が変わった可能性）");
}

// ── 結果 ────────────────────────────────────────────────────
console.log(`ルート: ${routes.length} 件 / labelKey: ${labelKeys.length} 件（ja・en で実在確認）`);
console.log(`form id: ${formIds.length} 件（<form> に付いているかを確認）/ href: ${hrefs.length} 件`);
// 🚨 **ファイル数だけでは「読めているか」が分からない**（2026-08-16 実測）。
//    読み込みを空にした写しで測ったら、**「走査したソース: 395 ファイル」と出したまま**
//    form の違反 14 件を並べた。＝ **読んだ人は 14 個の <form> を探しに行く**（実際は 0 文字）。
//    → **文字数も出す**。0 なら数字が明らかにおかしいと分かる。
console.log(`走査したソース: ${sources.length} ファイル（**読めた文字数 ${code.length}**）`);
console.log(`主要ボタン: ${primaryCounts.length} ルートで数えた（各 1 件であること）`);
// 🚨 **数だけを出さない。拾った実物を 3 本ずつ添える**（司令塔 2026-08-16）。
//    「labelKey 27 件」だけでは、**何を数えたのか**を読んだ人が確かめられない。
//    実際、私は別の検査で「許容 14 件」と書き続けていて、**実物を出した瞬間に
//    その 14 件が同じファイルの同じクラスだと初めて知った**（＝自分の数の中身を知らなかった）。
{
  const show = (why, list) => {
    if (list.length === 0) return;
    console.log(`  ${why}（先頭 3 本。**数ではなく中身を見るため**）:`);
    for (const v of list.slice(0, 3)) console.log(`    ${v}`);
  };
  show("labelKey", [...new Set(labelKeys)]);
  show("form id", [...new Set(formIds)].map((id) => `${id} → <form id="${id}"> を ${sources.length} 本の中に確認`));
  show("href", [...new Set(hrefs)]);
}

if (problems.length > 0) {
  // 🚨 **何で赤くなったかを出す。**「何かで赤くなった」を「狙ったものを検出した」と読ませないため。
  //    以前この見出しは「実在しないものを指している」固定で、**主要ボタンの件数違反にも同じ見出し**が
  //    付いていた（＝見出しと中身が食い違っていた・2026-08-15 実測）。
  const kinds = [...new Set(problems.map((p) => (p.match(/^\[([^\]]+)\]/) ?? [])[1] ?? "その他"))];
  console.error(`\n■ 違反 ${problems.length} 件（種別: ${kinds.join(" / ")}）`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("問題なし（上の件数を実際に見た結果として 0 件）");
