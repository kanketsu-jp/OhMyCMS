#!/usr/bin/env node
/**
 * 送信の二重発火に対する防御が入っているかを**静的に**検査する。
 *
 * 🚨 なぜ要るか:
 * 「気をつけて書く」では守れない。実際、この検査を入れる前は
 * **変更系の送信 19 本すべてが無防備で、`useRef` の使用は 0 件**だった。
 * 新しい一覧画面を足すたびに同じ穴が空くので、**落とせる検査**にする。
 *
 * 見るもの: `fetch(..., { method: "POST" | "PATCH" | "DELETE" })` を含む関数が
 *          `useSubmitOnce` を通っているか（hooks/use-submit-once.ts）。
 *
 * 🚨 見ていないもの（`checks-must-declare-blind-spots.md` の要求。塞げないことは隠さず書く）:
 *   - **別ファイルに置いた options を spread する形は拾えない**
 *     （例: 別ファイルの `const opts = { method: "POST" }` → `fetch(url, { ...opts })`）。
 *     1ファイルずつ読む静的検査なので、他ファイルの中身までは追えない。
 *   - 🚨 `lib/` を走査していないのは**別の理由**（静的解析の限界ではない）。
 *     実測すると変更系は3件だけで、中身は `lib/auth/google.ts` と `lib/drive/oauth.ts` の
 *     **サーバ側 OAuth トークン交換**——**利用者が押して送るものではない**ので、
 *     二重送信の防御が要らない。走査範囲を広げると、直しようのない指摘が3件出続ける。
 *   - `method:` の値が識別子・三項演算子・テンプレートリテラルなど**中身が読めないもの**は、
 *     実際は GET かもしれなくても「変更系かもしれない」として変更系側に倒す（過検出。2.2節）。
 *     取りこぼす側より、人が1件見に行くだけで済む過検出の側に倒している。
 *
 *   node scripts/check-submit-once.mjs
 */

import { readFileSync, globSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/**
 * まだ移行していないファイル。🚨 減らすためのリストであり、増やすためのものではない。
 *
 * 各エントリは「いつ・誰が・何を決めるか」を持つ（2026-08-15 監査で追記。それ以前は
 * `{ file, owner }` だけで、いつからの例外か・まだ決まっていないことすら書いていなかった）。
 *
 * - `recordedAt`: この記録を**確認した**監査日。元々いつからこの例外が置かれていたかは
 *   分からない（コミット履歴を遡らないと分からず、今回の監査対象でもない）ので、
 *   「発生日」ではなく「この監査で確認した日」として書く。
 * - `status`: "未決" 固定（決まったらこの配列からエントリごと削除する。ステータスを
 *   "済" にして残す運用にはしない — 減らすためのリストという原則に反する）。
 * - `decidesBy`: 誰が決めるか。
 * - `decision`: 何を決めるか（決定待ちの内容）。
 *
 * 🚨 このリストの「腐敗」は下の自己検査ブロックで毎回検出する:
 *   - `file` が実在しない → FAIL（存在しないものを免除し続けても誰も気づけない）
 *   - `file` に該当する検出が 0 件 → FAIL（例外がもう不要なのに残り続けている）
 */
const PENDING = [
  {
    file: "components/admin/settings-manager.tsx",
    decidesBy: "ui(p6)",
    recordedAt: "2026-08-15",
    status: "未決",
    decision: "面の移行が終わってから同じ手当てをする",
  },
  {
    file: "components/admin/notifications-manager.tsx",
    decidesBy: "ui(p6)",
    recordedAt: "2026-08-15",
    status: "未決",
    decision: "面の移行が終わってから同じ手当てをする",
  },
];

/**
 * classifyMethodValue が返す reason の正本。値は必ずここにだけ書く。
 *
 * 🚨 なぜ要るか（2026-08-15 追加）: この定数を作る前は "literal" / "unreadable" という
 * 文字列を4箇所（reason を作る classifyMethodValue・findMutationLines の同着判定・
 * 表示する reasonLabel・検査する KNOWN_REASONS）に手で書き写していた。
 * このうち3箇所（作る・表示する・検査する）は既存の未分類ガード（下の unclassified）が
 * 食い違いを検出できる。だが findMutationLines の同着判定（`reason === "unreadable"` という
 * 1回きりの文字列比較）だけは違う——ここは「不明な値と一致するか」を聞いているだけなので、
 * 誰かが reason を改名・削除して他の3箇所を直しても、この1行を直し忘れると比較が
 * 黙って一致しなくなるだけでエラーは出ない（「1行が複数の hit を出したら unreadable を
 * 優先する」というタイブレークが、何も言わずに効かなくなる）。
 * これはテストで見つけた穴ではなく、この関数を読み返していて気づいた穴なので、そう書いておく。
 * 値を REASON にだけ書き、4箇所すべてがここを参照する形にすれば、この種の食い違いは
 * そもそも起こり得なくなる（KNOWN_REASONS も REASON から自動導出する）。
 */
const REASON = { LITERAL: "literal", UNREADABLE: "unreadable" };

/** 関数の入口（この行より上に遡って「誰の中か」を決める）。 */
const DECL = /(?:async\s+function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*useSubmitOnce\s*\(|useSubmitOnce\s*\(\s*async)/;

/** `method:` を探すキー。直後の空白（改行を含む）は snippet 側で正規化して読むので、ここでは追わない。 */
const METHOD_KEY = /method:\s*/g;
/** `method:` の値を読むのに十分な長さ。テンプレート・三項演算子は先頭の1文字が読めれば判定できる。 */
const SNIPPET_HORIZON = 300;

/**
 * `method:` の値を判定する。**拾うか（isMutation）と、なぜ拾ったか（reason）**をペアで返す。
 *
 * リテラル文字列（`'` か `"`）なら中身を読んで POST/PATCH/DELETE かどうかで決める
 * （拾う場合 reason: "literal" = 本当に変更系）。
 *
 * 🚨 識別子・三項演算子・テンプレートリテラル（`` ` ``）など**中身が読めないもの**は、
 * 変更系かもしれないので変更系として扱う（過検出に倒す。取りこぼす側より安全 — 2.2節。
 * reason: "unreadable" = 値が読めないので変更系として扱った）。
 * 三項演算子（`method: editing ? "PATCH" : "POST"`）を読み落として1本取りこぼした前科が
 * あるので（33行目のコメント参照）、「読めないなら疑う」を既定にする。
 *
 * 🚨 reason は「なぜ赤くなったか」を報告に載せるために存在する（2026-08-15 追加）。
 * "literal" と "unreadable" は見た目が同じ1行の報告になるが中身は別物なので、
 * 呼び出し側は必ずこの reason を表示に使うこと（黙って握りつぶさない）。
 */
function classifyMethodValue(value) {
  const quoted = /^(['"])((?:\\.|(?!\1).)*)\1/.exec(value);
  if (quoted) {
    const isMutation = /^(?:POST|PATCH|DELETE)$/.test(quoted[2]);
    return isMutation ? { isMutation: true, reason: REASON.LITERAL } : { isMutation: false, reason: null };
  }
  return { isMutation: true, reason: REASON.UNREADABLE };
}

/**
 * ソースの中の `method:` を全部拾い、変更系と判定された出現の**行番号と理由（reason）**を
 * `{ line, reason }` の配列で返す（行番号は元のソース基準・0始まり）。
 *
 * 🚨 `method:` の直後だけを空白ひとつに正規化した「照合専用の文字列」（snippet）を作って判定する。
 * **行番号は正規化していない元のソースから数える**（正規化した文字列から行を数えると、
 * 潰した改行の分だけ報告の行番号がずれて、直す人が使えなくなる）。
 *
 * 同じ行に `method:` が複数回出て reason が割れた場合は "unreadable" を優先する
 * （見落としより過検出に倒す、という本体の方針をここでも維持する）。
 */
function findMutationLines(source) {
  const hits = new Map(); // line -> reason
  METHOD_KEY.lastIndex = 0;
  let m;
  while ((m = METHOD_KEY.exec(source))) {
    const raw = source.slice(m.index, m.index + SNIPPET_HORIZON);
    const snippet = raw.replace(/\s+/g, " ");
    const prefix = /^method:\s*/.exec(snippet);
    const value = snippet.slice(prefix[0].length);
    const { isMutation, reason } = classifyMethodValue(value);
    if (!isMutation) continue;
    const line = source.slice(0, m.index).split("\n").length - 1;
    if (reason === REASON.UNREADABLE || !hits.has(line)) hits.set(line, reason);
  }
  return [...hits.entries()].map(([line, reason]) => ({ line, reason })).sort((a, b) => a.line - b.line);
}

/**
 * 検出理由を短い日本語ラベルにする（既存の path:line 出力と同じ行に添える用）。
 *
 * 🚨 未分類の reason を "" で握りつぶさない（2026-08-15 追加）。
 * 分類できない hit（reason が "literal" / "unreadable" のどちらでもない）が来ても、
 * この関数が "" を返すと出力は「関数 save  ←」のように矢印の後が空で終わり、見た目は
 * ただの表示崩れにしか見えない。しかもその hit 自体は unguarded に積まれて exit 1 になる
 * ため、**exit コードだけでは「検査の分類が壊れた」ことが分からない**（unguarded が
 * あるから落ちているのか、reason が読めなくなったから落ちているのか区別できない）＝
 * 赤の中に赤が隠れる。ここで生の値を含む目立つ印を返し、下の自己検査ブロックで
 * 別枠の ■ として exit 1 の理由を明示する。
 */
function reasonLabel(reason) {
  if (reason === REASON.LITERAL) return 'method: が POST/PATCH/DELETE（本当に変更系）';
  if (reason === REASON.UNREADABLE) return "method: の値が読めない（識別子/三項演算子/テンプレート等）ため変更系として扱った（過検出）";
  return `🚨 分類できていない理由: "${reason}"（この検査の不具合）`;
}

const files = globSync("{app,components}/**/*.tsx", { cwd: root }).sort();

// 🚨 ゼロ件ガード（count-before-you-report.md の要求）:
// この検査の「自己検査（壊し方1〜3）」は**検出ルールが正しいか**しか証明しない。
// 「そもそも1件でも読んだか」は別の話で、これまでは無保証だった——PENDING が非空だった
// おかげで、下の腐敗検査（file は実在するのに該当検出が0件）が副作用として拾い、
// 偶然 exit 1 にしていただけ。PENDING が空になった日（移行待ちの2件が解消した日）には
// その偶然の防御も消え、glob が0件しか拾えなくても（例: 誤った cwd から実行された）
// 「防御済み: 0 / 未防御: 0 / 移行待ち: 0」で GREEN になってしまう。
// 「何も読んでいない」と「異常が無い」は見た目が同じなので、ここで明示的に区別する。
if (files.length === 0) {
  console.error("🚨 何も読んでいません（*.tsx が 0 件ヒット）。この検査は何も検証していません。");
  console.error(`  検索に使った root: ${root}`);
  console.error(`  glob パターン: {app,components}/**/*.tsx`);
  // 🚨 実行時のプロセス cwd（process.cwd()）はここでは無関係。root は import.meta.url から
  //   このスクリプト自身の場所を基準に導出しており（32-33行目）、プロセスをどこから起動しても
  //   変わらない。実測済み（リポジトリ直下からと /tmp からで exit 0・件数とも完全に同一）なので、
  //   「apps/studio 直下で実行してください」のような cwd 由来のアドバイスを再び足さないこと。
  console.error("  考えられる原因: root から見て app/ または components/ が想定の場所に無い");
  console.error("  （例: このスクリプトが apps/studio/scripts/ の外へ移動・コピーされた、");
  console.error("  app/ や components/ がリネーム・削除された、globSync の挙動が変わった）。");
  process.exit(1);
}

const unguarded = [];
const guarded = [];
const suspects = [];
const pending = [];

for (const file of files) {
  const source = readFileSync(resolve(root, file), "utf8");
  const lines = source.split("\n");
  const skip = PENDING.find((p) => p.file === file);

  for (const { line: i, reason } of findMutationLines(source)) {
    // 直前の関数入口まで遡る
    let owner = null;
    for (let j = i; j >= 0 && i - j < 60; j -= 1) {
      const m = DECL.exec(lines[j]);
      if (!m) continue;
      owner = m[1] ? { kind: "bare", name: m[1] } : { kind: "guarded", name: m[2] ?? "(無名)" };
      break;
    }

    // この呼び出し単独で見て「未防御」になる形か（!owner または bare）を kind として持っておく。
    // PENDING の例外を外したら実際どうなるか(d)を、通常経路と同じ判定式で出すため。
    const wouldBeGuarded = owner?.kind === "guarded";
    const entry = { file, line: i + 1, owner: owner?.name ?? "(不明)", kind: wouldBeGuarded ? "guarded" : "bare", reason };
    if (skip) pending.push(entry);
    else if (!wouldBeGuarded) unguarded.push(entry);
    else guarded.push(entry);
  }

  // 🚨 行ごとの操作で keyOf を忘れていないか（1行を消している間に他の行が押せなくなる）。
  // `NAME.run(引数あり)` を使っているのに `NAME.isPending(` が一度も出てこないものを疑う。
  for (const m of source.matchAll(/\b(\w+)\.run\(\s*[^)\s]/g)) {
    const name = m[1];
    if (source.includes(`${name}.isPending(`)) continue;
    if (suspects.some((s) => s.file === file && s.name === name)) continue;
    suspects.push({ file, name });
  }
}

// ── PENDING の腐敗検査（このリストが「誰も見ていない免除」にならないようにする）──
// 🚨 見ていないと気づけない2パターンを両方 FAIL にする:
//   1. file が実在しない（削除されたのにエントリだけ残っている。今回 bug-report-form.tsx で実際に起きた）
//   2. file は実在するが該当する検出が0件（もう防御が要らない/例外の意味が無い。放置すると
//      将来そのファイルに変更系が増えても無条件に免除され続ける）
const staleExceptions = [];
for (const entry of PENDING) {
  if (!existsSync(resolve(root, entry.file))) {
    staleExceptions.push({ file: entry.file, reason: "ファイルが存在しません（削除された可能性。エントリを消してください）" });
    continue;
  }
  const hitCount = pending.filter((p) => p.file === entry.file).length;
  if (hitCount === 0) {
    staleExceptions.push({ file: entry.file, reason: "該当する検出が0件です（例外はもう不要。エントリを消してください）" });
  }
}

// 🚨 reason が分類できていない hit の検査（reasonLabel 自身が壊れていないかの自己検査）。
// なぜ要るか: 分類できない hit は「変更系かもしれない」側に倒すため必ず unguarded にも
// 積まれ、そちらの exit 1 だけで検査は落ちる。だが exit コードは「未防御があるから落ちた」
// のか「reason 表示そのものが壊れて何が起きたか説明できないから落ちた」のかを区別しない。
// hit 自体が既にこの検査を赤くしているので、reason の破損は赤の中に隠れて見えなくなる
// （赤の中の赤）。ここで reason の値を独立に検査し、専用の ■ セクションと専用の exit 1
// 理由で「この検査は自分の記録簿(reasonLabel)を信用できない」ことを明示する。
const KNOWN_REASONS = new Set(Object.values(REASON));
const unclassified = [...unguarded, ...guarded, ...pending].filter((h) => !KNOWN_REASONS.has(h.reason));

console.log(`防御済み: ${guarded.length} 件 / 未防御: ${unguarded.length} 件 / 移行待ち: ${pending.length} 件`);

if (suspects.length > 0) {
  console.warn("\n■ 行ごとの操作で keyOf を忘れている疑い（引数つきで呼んでいるのに isPending を使っていない）");
  console.warn("  行ごとの削除で鍵を共有すると、1行を消している間に他の行が押せなくなります。");
  for (const s of suspects) console.warn(`  ${s.file}  ${s.name}`);
}

if (pending.length > 0) {
  console.log("\n■ 移行待ち（担当が別・未決）");
  for (const entry of PENDING) {
    const hits = pending.filter((p) => p.file === entry.file);
    if (hits.length === 0) continue; // 0件は上の腐敗検査で FAIL 済み。ここでは二重に出さない。
    console.log(`  ${entry.file}`);
    console.log(`    決める人: ${entry.decidesBy} ｜ 状態: ${entry.status} ｜ 記録: ${entry.recordedAt}（この監査で確認した日。元の記録日は不明）`);
    console.log(`    何を決めるか: ${entry.decision}`);
    for (const h of hits) {
      // (d) この例外を外したら実際どうなるか。owner.kind の分類をそのまま流用する。
      const withoutException = h.kind === "guarded" ? "この例外が無くても防御済み" : "この例外が無ければ未防御";
      console.log(`    ${h.line}行目  関数 ${h.owner}  ｜ ${withoutException} ｜ ${reasonLabel(h.reason)}`);
    }
  }
}

if (staleExceptions.length > 0) {
  console.error("\n■ 例外リスト（PENDING）が腐っています");
  console.error("  存在しない/該当しないファイルを例外として残すと、誰も見ていないまま将来のコードまで無条件に免除します。");
  for (const s of staleExceptions) console.error(`  ${s.file}  ← ${s.reason}`);
}

if (unguarded.length > 0) {
  console.error("\n■ 二重送信の防御がありません");
  console.error("  変更系の送信は hooks/use-submit-once.ts の useSubmitOnce を通してください。");
  console.error("  useState / disabled では防げません（setState は非同期で、2回目の押下に間に合いません）。\n");
  for (const h of unguarded) console.error(`  ${h.file}:${h.line}  関数 ${h.owner}  ← ${reasonLabel(h.reason)}`);
} else {
  console.log("未防御なし。");
}

if (unclassified.length > 0) {
  console.error("\n■ この検査自身の記録簿が壊れています（reason を分類できない hit がありました）");
  console.error("  reason を作る側（classifyMethodValue）と表示する側（reasonLabel）の認識がずれています。");
  console.error("  reason を足した／消した／改名した、いずれの場合も次の4箇所を同時に直してください");
  console.error("  （1箇所でも取り残すと、追加なら気づけますが削除・改名は黙って再発します）:");
  console.error("    - REASON（正本の定義。値はここにしか書かない）");
  console.error("    - classifyMethodValue（REASON の値を返す）");
  console.error("    - findMutationLines の同着判定（`reason === REASON.UNREADABLE` のタイブレーク）");
  console.error("    - reasonLabel（表示ラベル）");
  for (const h of unclassified) {
    console.error(`  ${h.file}:${h.line}  関数 ${h.owner}  ← ${reasonLabel(h.reason)}`);
  }
}

// ── 自己検査（この検査が本当に検出できるかを毎回その場で確かめる。check-user-label-leak.mjs と同じ書式）──
// 🚨 ディスクに .tsx を作らない（共有ツリーに置き忘れると他人のコミットに混ざる）。
//    既存のソース文字列（下の BASELINE）への置換で壊す。

/** 壊す元になる、変更系の印を一つも含まない素直な fetch。ここへ壊し方を差し込む。 */
const BASELINE = [
  "export function SaveButton() {",
  "  async function handleSave() {",
  '    await fetch("/api/items", {',
  '      headers: { "content-type": "application/json" },',
  "    });",
  "  }",
  "  return null;",
  "}",
  "",
].join("\n");

const NEEDLE = '      headers: { "content-type": "application/json" },';

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const baselineDetections = findMutationLines(BASELINE).length; // 壊す前は 0 のはず

const selfTests = [
  {
    name: '壊し方1: 素直な形（method: "POST"）を差し込む',
    apply(base) {
      const count = countOccurrences(base, NEEDLE);
      const after = base.replaceAll(NEEDLE, `      method: "POST",\n${NEEDLE}`);
      return { after, count };
    },
  },
  {
    name: "壊し方2: 変数で渡す形（method: VERB）を差し込む",
    apply(base) {
      const count = countOccurrences(base, NEEDLE);
      const after = base.replaceAll(NEEDLE, `      method: VERB,\n${NEEDLE}`);
      return { after, count };
    },
  },
  {
    name: "壊し方3: 改行を挟んだ形（method: の直後で改行してから値）を差し込む",
    apply(base) {
      const count = countOccurrences(base, NEEDLE);
      const after = base.replaceAll(NEEDLE, `      method:\n        "POST",\n${NEEDLE}`);
      return { after, count };
    },
  },
];

console.log("\n■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
let selfTestFailed = false;
for (const test of selfTests) {
  const { after, count } = test.apply(BASELINE);
  const detected = findMutationLines(after).length - baselineDetections;
  const ok = count > 0 && detected === count;

  console.log(`  ${ok ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${detected} 件`);
  if (count === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、検出 0 件は何も確かめていない。");
  }
  if (!ok) selfTestFailed = true;
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

process.exit(
  unguarded.length === 0 && !selfTestFailed && staleExceptions.length === 0 && unclassified.length === 0 ? 0 : 1,
);
