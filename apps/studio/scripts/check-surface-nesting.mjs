#!/usr/bin/env node
/**
 * 面（Surface）の入れ子を**静的に**検出する。
 *
 * 🚨 なぜ要るか:
 * `components/ui/surface.tsx` の Context による自動降格は **`<Surface>` の入れ子しか捕まえない**。
 * `className="rounded-md border p-4"` のような **生のクラスは素通りする**（design 番人の指摘 ③）。
 * 実際、Card を Surface へ置き換えただけでは深さ3が消えなかった。
 *
 * ルールを文書に書くだけでは同じことが起きるので、**落とせる検査**にする。
 * 由来: 堀池「必ずルールを見直して。洗礼させて」／knowledge/decisions/no-nested-surfaces.md §3
 *
 *   node scripts/check-surface-nesting.mjs
 */

import { execFileSync } from "node:child_process";

import { stripComments } from "./strip-comments.mjs";
import { readFileSync, globSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** 面を作るクラスの組み合わせ（囲む罫線 / 面としての背景 / 影）。 */
const SURFACE_PATTERNS = [
  // 🚨 `\bborder\b` は **`border-0` にも当たる**（`-` が単語境界なので）。
  // つまり「罫線を明示的に消した」ものを罫線として数えてしまう。**偽の赤**。
  // 由来: 2026-08-14。カラーピッカーに `rounded-lg border-0` と書いたら違反として出た。
  // 憲章 §1「正解を違反と言う検査は使われなくなり、検査そのものが死ぬ」。
  // → 罫線として数えるのは「幅を持つ border」だけ。`-0` / `-none` / `-transparent` は数えない。
  { name: "囲む罫線", re: /\brounded-(?:md|lg|xl|2xl)\b[^"']*\bborder(?!-(?:0|none|transparent)\b)\b|\bborder(?!-(?:0|none|transparent)\b)\b[^"']*\brounded-(?:md|lg|xl|2xl)\b/ },
  { name: "面の背景", re: /\bbg-(?:card|background|accent)\b/ },
  { name: "影", re: /\bshadow-(?:sm|md|lg|xl)\b/ },
];

/**
 * 面として許容するもの（面1つぶんとして数えてよい正当な箱）。
 * 🚨 ここを増やすときは knowledge/decisions/no-nested-surfaces.md にも理由を書くこと。
 */
const ALLOW = [
  // 警告・エラーの箱。色で意味を持つので面1つとして許容（ページ直下に置く前提）
  { file: /error-banner\.tsx$/, why: "エラー表示。色で意味を持つ箱",
    decided: "決定/2026-08-13/design（色で意味を持つ箱は面1つぶんとして数える）" },
  { pattern: /destructive/, why: "警告色の箱（エラー・失効トークン等）",
    decided: "決定/2026-08-13/design（同上）" },
  // メディアの受け皿。画像のレターボックスに背景が要る
  { pattern: /aspect-square|min-h-80|object-contain/, why: "メディアの受け皿",
    decided: "決定/2026-08-13/design（画像のレターボックスに背景が要る）" },
  // モーダルは面が1段重なってよい（surface-rules §4）
  { file: /dialog\.tsx$/, why: "モーダル。面が重なってよい唯一の例外",
    decided: "決定/2026-08-13/design（surface-rules §4。**唯一の例外**と明記されている）" },
  // 素材（shadcn の部品そのもの）
  { file: /components\/ui\/(?!surface)/, why: "UI 部品そのものの見た目",
    decided: "決定/2026-08-13/design（shadcn の素材そのもの。面の判断はページ側で行う）" },
  // 🚨 画面に固定されたバー。position:fixed は out of flow なので、
  // DOM 上どこに書かれていても**面の中には入らない**（親の面の上に重なるのではなく、画面に貼られる）。
  // かつ不透明でないと下の内容が透けるため、背景は必須。ページ本体と同じ bg-background を使う。
  // 由来: 2026-08-13。SP の下部ナビ（components/admin/mobile-nav.tsx）を入れたら、
  // 「components/admin/** は必ず Surface の中」という前提に当たって**正解を違反と報告した**。
  // 憲章 §1「正解を違反と言う検査は使われなくなり、検査そのものが死ぬ」。
  {
    pattern: /\bfixed\b[^"']*\binset-x-0\b|\binset-x-0\b[^"']*\bfixed\b/,
    why: "画面に固定されたバー（out of flow なので面の中に入らない）",
    decided: "決定/2026-08-13/design（SP の下部ナビで**正解を違反と報告した**ため。憲章 §1）",
  },
];

function allowedFor(file, line) {
  // 🚨 **どの規則が効いたか（添字）まで返す。** why（文字列）で後から突き合わせると、
  //    同じ why を持つ規則が潰れて別の規則の決定が表示される（2026-08-15 実測）。
  for (const [index, rule] of ALLOW.entries()) {
    if (rule.file && rule.file.test(file)) return { rule, index };
    if (rule.pattern && rule.pattern.test(line)) return { rule, index };
  }
  return null;
}

/** そのファイルは「面の中で描かれる」か。 */
function rendersInsideSurface(file, source) {
  // components/admin/** は必ずページの <Surface> の中に置かれる
  if (/components\/admin\//.test(file)) return true;
  // ページ側は <Surface> を使っていればその中
  return source.includes("<Surface");
}

const files = globSync("{app,components}/**/*.tsx", { cwd: root }).sort();

// 🚨 **採取した HEAD と作業ツリーの状態を出す**（司令塔 2026-08-15）。
//    共有ツリーでは **数分で HEAD も件数も動く**。出力だけを貼られた人は、
//    それが「いつのツリーの話か」を知る手段が無い（監査ツールには入れていたのに、
//    静的検査には入れていなかった）。**出どころは人に書かせず、計器に出させる。**
// 🚨 見ていない範囲: ここが数えるのは **この検査が見る範囲の未コミット変更だけ**。
//    他の範囲が汚れていても 0 と出る（「ツリーが綺麗」の意味ではない）。
{
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "app", "components"],
    { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean).length;
  console.log(`採取: HEAD ${head} / cwd ${process.cwd()} / この検査が見る範囲の未コミット変更 ${dirty} 件`);
  console.log(`  見る範囲: app/**/*.tsx と components/**/*.tsx（${files.length} ファイル）`);
}

const hits = [];
const allowed = [];

/**
 * 1 行を見て、面のクラスが在れば entry を返す（許容判定つき）。
 * 🚨 **囮と本番で同じ関数を通すために切り出した**（別々に書くと、囮が本番の道を試さない）。
 */
function scanLine(file, line, lineNumber) {
    // 🚨 className={cn("...", "...")} を読めるようにする。
    // 以前は /className=\{?["'`]/ で「= の次が引用符」しか見ておらず、
    // cn( が挟まる 50箇所 / 16ファイルが**丸ごとノーチェック**だった（design 番人の指摘・実証済み）。
    // → className= 以降に現れる**すべての文字列リテラルを連結**して判定する。
  if (!line.includes("className")) return null;
  const after = line.slice(line.indexOf("className"));
  const literals = [...after.matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
  if (literals.length === 0) return null;
  const classAttr = [null, literals.join(" ")];
  // 🚨 状態つきのクラス（focus-visible: / hover: / dark: / aria-invalid: など）は面ではない。
  // フォーカスリングやホバーの色を「罫線」「背景」と数えると誤検出になる（実測で判明）。
  const cls = classAttr[1]
    .split(/\s+/)
    .filter((token) => !token.includes(":"))
    .join(" ");
  for (const { name, re } of SURFACE_PATTERNS) {
    if (!re.test(cls)) continue;
    const why = allowedFor(file, line);
    const entry = { file, line: lineNumber, kind: name, snippet: cls.slice(0, 70) };
    return why
      ? { ...entry, allowed: true, why: why.rule.why, decided: why.rule.decided, ruleIndex: why.index }
      : { ...entry, allowed: false };
  }
  return null;
}

for (const file of files) {
  // 🚨 **コメント行の className を判定に入れない**（2026-08-15 実測: 6 件が入っていた）。
  //    いま違反 0 件なのは**まだ誰も面のクラスをコメントに書いていないから**で、
  //    「`rounded-lg border bg-card` は面なので中に置かない」と**説明を書いた瞬間に赤くなる**。
  //    ＝ **まだ出番が来ていない過検出**。しかも**経緯を残すほど赤くなる**という向きなので、
  //    「消さずに経緯を残す」という決定と正面から衝突する。
  //    stripComments は**行数を保つ**ので、報告する行番号はずれない。
  const source = stripComments(readFileSync(resolve(root, file), "utf8"));
  if (!rendersInsideSurface(file, source)) continue;

  source.split("\n").forEach((line, i) => {
    const found = scanLine(file, line, i + 1);
    if (!found) return;
    if (found.allowed) allowed.push(found);
    else hits.push(found);
  });
}

// ── 自己検査（囮）。**両方向を置く**（検出できること／検出してはいけないこと）──────
{
  // 🚨 **規則ごとに囮を分ける**（司令塔 2026-08-15・分類⑤「安全網が受け止めている」）。
  //    実測: 囮を 1 本にして `rounded-lg border bg-card p-4` を使っていたとき、
  //    **「囲む罫線」だけを殺しても「面の背景」が同じ文字列を拾い、検査は緑のまま**だった
  //    （出力の種別は「囲む罫線」→「面の背景」に変わったが、**✅ と exit=0 は動かなかった**）。
  //    ＝ **規則が 3 つあるのに囮が 1 本しか無ければ、2 つ死んでも気づけない。**
  //    各囮は**その規則だけに当たる文字列**にしてある。
  const PROBES = [
    { rule: "囲む罫線", cls: "rounded-lg border p-4" },
    { rule: "面の背景", cls: "bg-card p-4" },
    { rule: "影", cls: "shadow-md p-4" },
  ];
  const probe = 'className="rounded-lg border bg-card p-4"';
  const positive = scanLine("zz-probe.tsx", `  <div ${probe} />`, 1);
  const perRule = PROBES.map((p) => {
    const hit = scanLine("zz-probe.tsx", `  <div className="${p.cls}" />`, 1);
    return { ...p, hit, ok: Boolean(hit) && hit.kind === p.rule && hit.allowed === false };
  });
  // 🚨 逆方向: **コメントの中に同じ文字列**。拾ったら、経緯の説明文を違反として数えている。
  const negative = scanLine("zz-probe.tsx", stripComments(`  // 面の例: <div ${probe} />`), 1);
  // 🚨 **囮(-)が空振りでないことも確かめる。** 潰す前の生のコメント行を同じ関数に通して
  //    **拾うこと**を見ておかないと、「拾わない」が「そもそも何も見ていない」と区別できない。
  const negativeRaw = scanLine("zz-probe.tsx", `  // 面の例: <div ${probe} />`, 1);
  // 🚨 **囮(+) は「検出された」だけでなく「違反として報告される」まで見る。**
  //    「検出されたが許容された」でも Boolean(positive) は真になるので、
  //    **ALLOW を壊しても囮(+) が落ちない**＝この囮だけを落とす壊し方が無い状態だった
  //    （司令塔 2026-08-15「その囮だけが落ちる壊し方が別に 1 つでも在るか」）。
  //    `allowed === false` まで見ると、**ALLOW を全一致にする壊し方で囮(+) だけが落ちる。**
  const ok = Boolean(positive) && positive.allowed === false && !negative && Boolean(negativeRaw)
    && perRule.every((r) => r.ok);
  console.log("自己検査:");
  console.log(`  ${positive && positive.allowed === false ? "✅" : "🚨"} 囮(+): 実コードの ${probe} → ` +
    `${positive ? `検出（${positive.kind}）${positive.allowed ? "🚨 だが許容された" : "・違反として報告"}` : "検出できず"}`);
  // 🚨 **否定の囮は、実装が死ぬと「✅ 拾わない」と表示されてしまう**（司令塔 2026-08-15）。
  //    実測: SURFACE_PATTERNS を空にした写しで、囮(+) は 🚨 になったが**囮(-) は ✅ のまま**だった。
  //    → **空振りでないこと（潰さなければ拾う）まで満たしたときだけ ✅ にする。**
  for (const r of perRule) {
    console.log(`  ${r.ok ? "✅" : "🚨"} 囮(+/${r.rule}): className="${r.cls}" → ` +
      `${r.hit ? `検出（${r.hit.kind}）${r.hit.allowed ? "🚨 だが許容された" : ""}` : "🚨 検出できず"}`);
  }
  console.log(`  ${!negative && negativeRaw ? "✅" : "🚨"} 囮(-): **コメントの中**の同じ文字列 → ${negative ? "🚨 拾ってしまう" : "拾わない"}` +
    `（🟢 潰さなければ ${negativeRaw ? "拾う＝この囮は空振りではない" : "🚨 拾わない＝囮が効いていない"}）`);
  if (!ok) {
    console.error("🚨 自己検査に失敗しました。**この検査の結果は信用できません**。");
    process.exit(1);
  }
}

// ── 🚨 見逃す入力（**面の規約の持ち主＝design が作ったもの**を、そのまま通す） ────
//    司令塔 2026-08-16「見逃す入力を自分で作って通す」。
//    🚨 **私は面の規約の持ち主ではない**ので、**在りうる形は design に作ってもらった**
//    （私が作ると「在りえない形」ばかりになる）。期待は design の実測どおり。
{
  const CASES = [
    ["rounded-sm + border", 'className="rounded-sm border p-4"', "missed"],
    ["rounded（サイズ無し）+ border", 'className="rounded border p-4"', "missed"],
    ["bg-muted を面に使う", 'className="rounded-lg bg-muted p-4"', "missed"],
    ["bg-popover", 'className="rounded-lg bg-popover p-4"', "missed"],
    ["bg-secondary", 'className="rounded-lg bg-secondary p-4"', "missed"],
    ["outline outline-1", 'className="rounded-lg outline outline-1 p-4"', "missed"],
    ["shadow-2xl", 'className="shadow-2xl p-4"', "missed"],
    // 🚨 design は「見逃す」と測ってきたが、**実際は拾う**（2026-08-16・私の実測）。
    //    この検査は `className=` 以降の**文字列リテラルを全部連結**してから判定するので、
    //    `cn("rounded-lg p-4", isX && "border")` は `rounded-lg p-4 border` になって当たる。
    //    🚨 **その連結は design 自身の指摘で入ったもの**（この上の scanLine のコメント参照）。
    //    ＝ **自分が入れた守りを、自分が忘れていた形。** 期待を実測に合わせる。
    ["cn() で文字列が割れる", 'className={cn("rounded-lg p-4", isX && "border")}', "caught"],
    ["インライン style", 'style={{ border: "1px solid" }}', "missed"],
    // 🚨 design が「拾う」と報告 → 追試で **両方とも見逃す**（2026-08-16・私の実測）。
    //    判定は **1 行の中の、className より後ろの文字列リテラル**しか見ないので、
    //    変数に入れた瞬間に消える（**定義が同じ行に在っても、className より前なら見えない**）。
    ["変数に入れる（別行）", 'className={cls}', "missed"],
    ["変数に入れる（同じ行）", 'const cls = "rounded-lg border p-4"; return <div className={cls} />', "missed"],
    // 🚨 これは「拾う」が、**正しい理由で拾っていない**（下の注記）
    ["ring-1 ring-border", 'className="rounded-lg ring-1 ring-border p-4"', "caught"],
    ["ring-1 ring-zinc-200", 'className="rounded-lg ring-1 ring-zinc-200 p-4"', "missed"],
    // 🟢 対照
    ["🟢 対照(+) 素直な面", 'className="rounded-lg border p-4"', "caught"],
    ["🟢 対照(-) 面でない", 'className="flex gap-2"', "missed"],
  ];
  const drift = [];
  console.log("■ 🚨 見逃す入力（**design が作った、在りうる形**。ここに出る形は静的には止まりません）");
  for (const [why, src, expect] of CASES) {
    const hit = scanLine("zz-probe.tsx", `  <div ${src} />`, 1);
    const actual = hit ? "caught" : "missed";
    if (actual !== expect) drift.push(`${why}（${expect} のはずが ${actual}）`);
    console.log(`  ${actual === "caught" ? "  拾う  " : "🚨 見逃す"} ${why.padEnd(26)} ${src.slice(0, 46)}`
      + (actual !== expect ? `  🚨 **期待は ${expect}**` : ""));
  }
  // 🚨 `ring-1 ring-border` が拾えるのは **`ring-border` の "border" に当たっているだけ**
  //    （design が追試: `ring-zinc-200` にすると見逃す）。
  //    ＝ **正しい結果が、間違った理由で出ている。** 色名を変えられた瞬間に消える。
  console.log('  🚨 注記: `ring-1 ring-border` を拾うのは **`ring-border` の "border" に当たっているだけ**です');
  console.log("        （`ring-zinc-200` にすると見逃します）＝ **正しい理由で拾っていません**");
  console.log("  🚨 注記: 上の「見逃す」を pattern に足すのは危険です。`bg-muted` は **0 段目の正しい使い方が");
  console.log("        39 ファイル在る**ので、足すと**大量の偽の赤**になります（憲章 §1）。");
  console.log("        **静的で全部拾おうとせず、描画の側（scripts/audit-surface-depth.mjs）で見てください。**");
  if (drift.length > 0) {
    console.error(`\n🚨 囮の結果が、書いてある期待と違います（${drift.join(" / ")}）。`);
    console.error("   検出器が変わったか、期待の書き方が誤っています。**両方を直してください**");
    process.exit(1);
  }
}

console.log(`対象: 面の中で描かれる ${files.length} 本を走査`);
// 🚨 **内訳を出す。** 件数だけだと、8 行目の例外が足されて違反を飲み込み始めても
//    「許容した面: N 件」が増えるだけで、**緑のまま気づけない**。
//    どの例外が何件効いたかを毎回出せば、増えたものが目に入る。
console.log(`許容した面: ${allowed.length} 件`);
// 🚨 **内訳は規則の「識別子」で数える。文字列（why）で数えない。**
//    design の指摘（2026-08-15）: 内訳そのものが嘘をつく。私の版でこう出た——
//    2 行に同じ `why` を書いたら **6 規則が 5 行に潰れ**、15 件が 1 行にまとまり、
//    **表示された `decided:` は先に一致した方のもの**になった（＝別の規則の決定が表示される）。
//    → 規則の**添字**で数え、**行数と合計の両方**を突き合わせて、合わなければ落とす。
const byIndex = new Map();
for (const a of allowed) byIndex.set(a.ruleIndex, (byIndex.get(a.ruleIndex) ?? 0) + 1);
const rows = ALLOW.map((rule, index) => ({ rule, index, count: byIndex.get(index) ?? 0 }));
// 🚨 **数だけを出さない。拾った行を 1〜2 本添える**（司令塔 2026-08-16・design の形）。
//    件数だけだと「なぜその数なのか」を他人が確かめられず、
//    数え方の違いが出たときに**言い張るしかなくなる**（同じ日に、別の検査の 12 と 10 が 3 回転した）。
//    🚨 **行を見れば目に入るものが、数を見ていると入らない。**
for (const { rule, index, count } of rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count)) {
  console.log(`    ${String(count).padStart(3)} 件  ${rule.why}  [${rule.decided ?? "🚨 決定の記録が無い"}]`);
  for (const a of allowed.filter((x) => x.ruleIndex === index).slice(0, 2)) {
    console.log(`          例 ${a.file}:${a.line}  ${a.snippet}`);
  }
}
// 🚨 一度も効かなかった例外も出す。**ただし「死んだ行」ではない。**
//    例外は「違反になりかけたもの」にしか効かないので、**候補が出ていなければ 0 件が健全**。
//    実測（design・2026-08-15）: 候補 133 件の中に components/ui/dialog.tsx も入っており、
//    **対象は見ている**。0 件は「見ていない」ではなく「要る場面がまだ出ていない」。
//    🚨 **消さないこと。** 消すと、次に候補が出たとき**正解が違反として落ちる**（憲章 §1）。
const unused = rows.filter((r) => r.count === 0);
if (unused.length > 0) {
  console.log(`  （下の ${unused.length} 行は 0 件＝**この例外が要る場面がまだ出ていない**。対象は見ている。消さないこと）`);
  for (const { rule } of unused) {
    console.log(`      0 件  ${rule.why}  [${rule.decided ?? "🚨 決定の記録が無い"}]`);
  }
}
// 🚨 内訳が実態と合っているか。**合計と行数の両方**を見る。
//    片方だけだと、規則が潰れても合計は合ってしまう（今回の実測がまさにそれ）。
const sum = rows.reduce((n, r) => n + r.count, 0);
const names = ALLOW.map((r) => r.why);
const dupes = [...new Set(names.filter((w, i) => names.indexOf(w) !== i))];
// 🚨 **捕まえることと、正しく名指しすることは別**（design・2026-08-15 の実測）。
//    以前は「規則が潰れているか、種別の付いていない許容があります」という**両論併記**だった。
//    赤くはなるが、読んだ人は**存在しない方**を探しに行く。**条件ごとに原因を1つ名指しする。**
const faults = [];
if (dupes.length > 0) faults.push(`**規則名が重複しています**: ${dupes.join(" / ")}`);
if (rows.length !== ALLOW.length) faults.push(`**規則を数え漏らしています**（行 ${rows.length} / 規則 ${ALLOW.length}）`);
if (sum !== allowed.length) {
  faults.push(
    sum < allowed.length
      ? `**どの規則にも属さない許容があります**（内訳 ${sum} < 許容 ${allowed.length}）`
      : `**同じ許容を複数の規則が数えています**（内訳 ${sum} > 許容 ${allowed.length}）`,
  );
}
if (faults.length > 0) {
  console.error(`\n🚨 内訳が実態と合いません（内訳 ${sum} / 許容 ${allowed.length} / 規則 ${ALLOW.length}）:`);
  for (const f of faults) console.error(`   ${f}`);
  console.error("   この内訳は信用できません。");
  process.exit(1);
}

