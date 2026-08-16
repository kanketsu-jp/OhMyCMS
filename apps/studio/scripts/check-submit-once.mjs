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
 * 🚨 見ていないもの（`checks-must-declare-blind-spots.md` の要求。塞げないことは隠さず書く）
 *   **各項目に【鳴る】か【書いただけ】を付ける**（2026-08-16）。
 *   🚨 **「書いただけ」の記述は、誰かが検出器を広げた日に古くなり、古いまま残る。**
 *   **【鳴る】＝ 末尾の「死角の見張り」が毎回通していて、拾えるようになったら ❌ を出す。**
 *   （🟢 対象ファイルの列挙は `globSync`＝ファイルシステム直読み。`git ls-files` ではないので、
 *     **未追跡ファイルも拾う**。実測 2026-08-16: 未追跡 .tsx は 0 件・追跡済み 131 件）:
 *   - 【鳴る】🚨 **母集合は「`fetch(` の呼び出しで `method:` を持つもの」だけ**（2026-08-16 に明記）。
 *     **`<form action={...}>` で送るものは、この検査に一度も入っていない。**
 *     🚨 **件数は散文に書かない。末尾の「死角の見張り」が毎回数えて出す。**
 *     （以前ここに「16 件・うち 8 件」と手で書いていた。散文と出力の二重管理は片方が腐る）
 *     🚨 **この 8 件に二重送信の害が在るかは、1 件ずつ見ないと分からない（未確認）。**
 *     **「見えていない」と「害が在る」は別の主張なので、件数だけを書いておく。**
 *     🚨 **この欄が空だった間、「未防御 0 件」は母集合の外を含んでいなかった。**
 *   - 【鳴る】🚨 **見逃す形を実演して確かめた（2026-08-16）。思いつきで書いていない。**
 *     方法: `BASELINE` に入力を足して `findMutationLines` の件数が増えるかを見る
 *       🚨 見逃す … `<form action={fn}>` ／ `axios.post` ／ `navigator.sendBeacon`
 *                  ／ Server Action の直呼び ／ `XMLHttpRequest`
 *       🟢 拾う   … **同一ファイル**の変数経由（`const opts = { method: "POST" }; fetch(url, opts)`）
 *       🟢 対照   … `fetch(url, { method: "POST" })` → 拾う（＝検出器が動いていることの確認）
 *       → **6 通り中 5 通りを見逃した**
 *     🚨 **どれが実際にこのコードに在るかは、末尾の見張りが毎回出す**（散文に数を書かない）。
 *   - 【書いただけ】**別ファイルに置いた options を spread する形は拾えない**
 *     （例: 別ファイルの `const opts = { method: "POST" }` → `fetch(url, { ...opts })`）。
 *     1ファイルずつ読む静的検査なので、他ファイルの中身までは追えない。
 *     🚨 **同一ファイルなら拾う**（上の実演で確認済み）。「変数経由は全部だめ」ではない。
 *   - 【書いただけ】🚨 `lib/` を走査していないのは**別の理由**（静的解析の限界ではない）。
 *     実測すると変更系は3件だけで、中身は `lib/auth/google.ts` と `lib/drive/oauth.ts` の
 *     **サーバ側 OAuth トークン交換**——**利用者が押して送るものではない**ので、
 *     二重送信の防御が要らない。走査範囲を広げると、直しようのない指摘が3件出続ける。
 *   - 【書いただけ】`method:` の値が識別子・三項演算子・テンプレートリテラルなど**中身が読めないもの**は、
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
 * PENDING に許す件数の上限（ラチェット）。
 *
 * 🚨 なぜ要るか: 直前のコメント（「減らすためのリストであり、増やすためのものではない」）は
 * 何も強制していなかった。違反を直す代わりにここへ1件足しても検査は黙って green のままで、
 * それは注意書きであって防御ではない。この定数に「今 PENDING に何件あるか」を実測してそのまま
 * 書く（自動導出しない）。PENDING.length がこれを超えたら検査を FAIL にする。上限を上げたい人は
 * この行を意図的に書き換える必要があり、その変更は差分としてレビューに必ず出る＝黙っては増やせない。
 *
 * 下げるのは自由で、むしろ推奨。PENDING が減ったら、このリテラルも一緒に下げること
 * （下の「PENDING の上限」検査が、下げ忘れをその都度促す）。ラチェットは締め続けないと
 * 意味を持たない——上限だけ置いて誰も下げなければ、それもまた「言うだけ」に戻ってしまう。
 */
const MAX_PENDING = 2;

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
    // 🚨 PUT が抜けていた（2026-08-15 発覚）。POST/PATCH/DELETE だけを変更系として拾っていたため、
    // components/admin/file-labels-editor.tsx と components/admin/folder-labels-menu.tsx の
    // `method: "PUT"`（/api/files/{id}/labels・/api/folders/{id}/labels）が「リテラルだが変更系ではない」
    // として素通りしていた。この2件は既に useSubmitOnce で守られていたので実害は無かったが、
    // 検査自体はPUTを一度も見ていなかった＝ガード無しのPUTが増えても検出できない状態だった。
    // 変更系の4動詞は POST / PUT / PATCH / DELETE。
    const isMutation = /^(?:POST|PUT|PATCH|DELETE)$/.test(quoted[2]);
    return isMutation ? { isMutation: true, reason: REASON.LITERAL } : { isMutation: false, reason: null };
  }
  return { isMutation: true, reason: REASON.UNREADABLE };
}

/**
 * 🚨 コメントの中の `method:` を実装として誤検出していた（2026-08-15 プローブで発覚。
 * 実際の違反ではなく予防的な修正）。
 *
 * JSDoc の使用例に `fetch(url, { method: "POST" })` を書いただけのファイルが
 * 「未防御（owner: 関数 (不明)）」として検出された。指摘された側は困る——
 * コメントを `useSubmitOnce` で包むことはできないので、直しようがない「違反」を
 * 例外リストに足すか、検査を避けて回るしかなくなる。
 *
 * 計測: この修正の直前、走査対象 134 ファイル中の `method:` の出現は
 * コメント内 = 0 件・コード内 = 45 件だった（つまり今回は予防であり、
 * 既存の防御済み41・未防御0・移行待ち4という件数は変わらない）。
 *
 * 直し方として「行の `//` 以降を正規表現で削る」ような素朴なコメント除去は選ばない。
 * 文字列リテラルの中の `//`（例: `"https://example.com"`）はコメントの開始ではないため、
 * 行単位で `//` 以降を削ると URL を含む文字列の後ろにある本物のコードまで一緒に消えてしまう
 * （＝同じ行の後続にある本当の `method: "POST"` を見失う）。そのため、
 * ソースを1文字ずつ状態遷移で読み、「コード」「行コメント」「ブロックコメント」
 * 「文字列（'/"/`）」のどの中にいるかを追跡してコメント範囲だけを求める。
 */

/**
 * ソース中の「コメント範囲」を `[start, end)` の半開区間の配列で返す（開始位置の昇順）。
 * 行番号を再計算するためのものではない——**元のソースをそのまま使い、除去も置換もしない**。
 * 呼び出し側は各マッチの `index` がこの範囲に入っているかだけを見る
 * （行番号が今までとずれないようにするため。テキストを削って詰めると行がずれる）。
 *
 * 見ていないもの（検出漏れになり得る既知の限界。ファイル冒頭の「見ていないもの」欄と同じ姿勢で書く）:
 *   - 正規表現リテラル（`/foo\/\/bar/` のような形）は文字列として扱っていないため、
 *     中の `//` を行コメントの開始と誤認する可能性がある。
 *     実測した（2026-08-16）。再現する：`const re = /\/\/ method: "POST"/;` を書いた行が
 *     「変更系」として報告された（所有関数が特定できないため 関数 (不明) と出る）。
 *     🚨 ただし取りこぼしにはならなかった。同じファイルの次の行に書いた本物の
 *     `method: "POST"` は正しく検出された。字句の状態は正規表現リテラルの後で戻っている。
 *     実害が小さいと見ている理由は判断ではなく構造にある：正規表現リテラルの中に
 *     エスケープされていない `//` は書けない（そこで正規表現が終わるため）ので、
 *     「実コードを丸ごと読み飛ばす」形にはなりにくい。直していない——直すには
 *     正規表現リテラルを字句として扱う必要があり、除算の `/` か正規表現の `/` かの
 *     判定（構文解析）が要る。
 *   - テンプレートリテラルの `${ 式 }` の中身は文字列として扱わない（＝コメント扱いもしない）。
 *     `${ 式 }` は実コードなので、その中に `method: "POST"` があれば意図的に検出対象のままにする。
 */
function computeCommentRanges(source) {
  const CODE = 0;
  const LINE = 1;
  const BLOCK = 2;
  const SINGLE = 3;
  const DOUBLE = 4;
  const TEMPLATE = 5;

  const ranges = [];
  let state = CODE;
  let rangeStart = -1;
  // テンプレートリテラルの `${ 式 }` に入るたびに、戻り先の波括弧の深さを積む。
  const templateReturnStack = [];
  let braceDepth = 0;

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];

    if (state === CODE) {
      if (c === "/" && next === "/") {
        state = LINE;
        rangeStart = i;
        i += 1;
        continue;
      }
      if (c === "/" && next === "*") {
        state = BLOCK;
        rangeStart = i;
        i += 1;
        continue;
      }
      if (c === "'") {
        state = SINGLE;
        continue;
      }
      if (c === '"') {
        state = DOUBLE;
        continue;
      }
      if (c === "`") {
        state = TEMPLATE;
        continue;
      }
      if (templateReturnStack.length > 0 && c === "{") {
        braceDepth += 1;
        continue;
      }
      if (templateReturnStack.length > 0 && c === "}") {
        if (braceDepth === 0) {
          // `${ ... }` の閉じ。テンプレートリテラルの地の文へ戻る。
          state = TEMPLATE;
          braceDepth = templateReturnStack.pop();
        } else {
          braceDepth -= 1;
        }
        continue;
      }
      continue;
    }

    if (state === LINE) {
      if (c === "\n") {
        ranges.push([rangeStart, i]);
        state = CODE;
      }
      continue;
    }

    if (state === BLOCK) {
      if (c === "*" && next === "/") {
        ranges.push([rangeStart, i + 2]);
        state = CODE;
        i += 1;
      }
      continue;
    }

    if (state === SINGLE || state === DOUBLE) {
      if (c === "\\") {
        i += 1; // エスケープされた次の1文字は読み飛ばす（\" などをクォート終端と誤認しない）
        continue;
      }
      if ((state === SINGLE && c === "'") || (state === DOUBLE && c === '"')) {
        state = CODE;
      }
      continue;
    }

    if (state === TEMPLATE) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === "`") {
        state = CODE;
        continue;
      }
      if (c === "$" && next === "{") {
        templateReturnStack.push(braceDepth);
        braceDepth = 0;
        state = CODE;
        i += 1;
        continue;
      }
      continue;
    }
  }

  // 行コメント／ブロックコメントが閉じないままファイル末尾に達した場合、そこまでを範囲に含める。
  if (state === LINE || state === BLOCK) ranges.push([rangeStart, source.length]);

  return ranges;
}

/** `index` がコメント範囲（開始位置昇順）に含まれるか。範囲を超えたら探索を打ち切る。 */
function isInsideCommentRanges(index, ranges) {
  for (const [start, end] of ranges) {
    if (index < start) break;
    if (index < end) return true;
  }
  return false;
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
 *
 * 🚨 コメント（行コメント／ブロックコメント）の中に出現した `method:` は無視する
 * （computeCommentRanges 直前のコメント参照）。行番号は**元のソースからそのまま**数える
 * （コメントを削って詰めていないので、報告する行番号は今までと変わらない）。
 */
function findMutationLines(source) {
  const hits = new Map(); // line -> reason
  const commentRanges = computeCommentRanges(source);
  METHOD_KEY.lastIndex = 0;
  let m;
  while ((m = METHOD_KEY.exec(source))) {
    if (isInsideCommentRanges(m.index, commentRanges)) continue; // コメントの中は実装ではない
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

/**
 * 行ごとの操作で keyOf を忘れていないか（1行を消している間に他の行が押せなくなる）を疑う。
 * `NAME.run(引数あり)` を使っているのに `NAME.isPending(` が一度も出てこない名前を、
 * ファイル内で重複を除いて返す。
 *
 * 🚨 このスキャンには comment 対応が漏れていた（2026-08-16 発覚）。1つ目のスキャン
 * （method: を探す findMutationLines）を computeCommentRanges で直したとき、同じファイルに
 * ある2つ目のこのスキャンには適用し忘れていた——レキサ自体は既にこのファイルにあるのに、
 * 呼び忘れただけ。生ソースのまま読むと**両方向**で壊れる:
 *   - `NAME.run(` がコメント（この検査の使用例を書いた JSDoc 等）の中にあると、
 *     実装ではないものを「疑い」として報告する（誤報）。
 *   - `NAME.isPending(` がコメントアウトされた／説明用に書かれたコードの中にあると、
 *     単純な文字列一致（旧実装の `source.includes(...)`）がそれを「防御あり」と誤認し、
 *     本物の疑いを黙って握りつぶす（検出漏れ。誤報より悪い——「疑いが無い」と言われたら
 *     誰も見に行かない）。
 * そのため commentRanges を再利用し、`run(` 側はコメント内ならスキップ、`isPending(` 側は
 * 「コード内に1つでもあれば防御あり」とし、コメント内の出現だけでは防御ありと見なさない。
 * 関数化したのは、この振る舞いを自己検査（下の壊し方6）から独立に呼べるようにするため。
 */
function findKeyOfSuspects(source) {
  const commentRanges = computeCommentRanges(source);
  const names = [];
  for (const m of source.matchAll(/\b(\w+)\.run\(\s*[^)\s]/g)) {
    if (isInsideCommentRanges(m.index, commentRanges)) continue; // コメントの中は実装ではない
    const name = m[1];
    if (names.includes(name)) continue;
    const isPendingRe = new RegExp(`\\b${name}\\.isPending\\(`, "g");
    let hasRealIsPending = false;
    let pm;
    while ((pm = isPendingRe.exec(source))) {
      if (!isInsideCommentRanges(pm.index, commentRanges)) {
        hasRealIsPending = true;
        break;
      }
    }
    if (!hasRealIsPending) names.push(name);
  }
  return names;
}

const unguarded = [];
const guarded = [];
const suspects = [];
const pending = [];

// 🚨 `<form action={...}>` を**毎回数える**（2026-08-16）。
// 以前はこの数（16 件・うち 8 件）を冒頭の散文に手で書いていた。散文と出力の二重管理は
// 片方が必ず腐るので、**道具が毎回出す側を正**にする。散文からは数を外した。
// この検査は form を「見ていない」ので、ここは**検出ではなく計数**。落とさない（報告だけ）。
const formActions = { total: 0, unguarded: [] };

// 🚨 「候補」と「実際に判定が働いた数」を分ける（2026-08-16・司令塔の指示）。
//    ゼロ件ガード（上）は `files.length`＝**globSync の候補**しか見ていなかった。
//    候補が 133 件あっても、検出器が死んでいれば**1 件も判定されないまま緑になる**。
//    そこで「`findMutationLines` が 1 件以上返したファイル」を数え、0 なら落とす。
//    🚨 これは「異常が無い 0」ではなく「**見ていない 0**」を捕まえるための数。
//
// 🚨 **0 だけを見てはいけない**（2026-08-16・design の指摘）。
//    「0 なら落とす」は **30 → 1 に減っても通る**。「見ていない 0」は塞げても
//    「**ほとんど見ていない**」は塞げない。そこで下限をラチェットにする（MAX_PENDING と同じ形）。
//    実測 2026-08-16: **30 本**。ここに実測値をそのまま書き、下回ったら落とす。
//    🚨 **自動導出しない**——導出すると、減った日に下限も一緒に下がって何も言わなくなる。
// 🚨 **床**（2026-08-16・design の分類で置き直した）。実測は 30 本だが、ここに 30 と書くと
//    **画面が 1 つ減っただけで鳴る**＝ 実測値に近い絶対値は腐る（司令塔の訂正:
//    「絶対値は悪」ではなく「**実測値に近い絶対値**が悪い」）。
//    🚨 これは**ラチェットではない**。目的が違う——PENDING の上限は「改善を固定する」ためだが、
//    こちらは「**走査が丸ごと止まったのを捕まえる**」ため。締め続けるものではない。
//    app/ + components/ で `method:` を持つ画面が 15 を下回ることは想定しない。
const MIN_SCANNED = 15;
// 🚨 **1 ファイルあたりの平均文字数**の下限（2026-08-16・shell の形）。
//    最初は**合計**の下限（434,000）を置いたが、🚨 **合計は repo が育つと腐る**——
//    ファイルが増えれば合計も増え、下限は毎年ゆるくなる。**平均は育たない。**
//    そして「本数は 133 のまま、中身だけ痩せた」を捕まえられるのは平均のほう。
//    🚨 **比率（走査 ÷ 候補）は使えない**: この検査は**間引きが無い**（全ファイルを走査する）ので、
//    その比は常に 1.0 で動かない。**間引きが在る検査でしか比率は効かない**（司令塔の訂正）。
//    実測 2026-08-16: 620,138 ÷ 133 ＝ **4,662 文字/ファイル**。その半分を下限にする。
const MIN_AVG_BYTES = 2_300;
let scannedWithHits = 0;
// 🚨 **読めた量**（2026-08-16・司令塔の指示）。件数のガードは「読み込みが死んだ」を捕まえられない。
//    ファイル数が 133 のままでも、中身が空なら「判定 0 本」になり、0 ガードは鳴るが
//    **原因が「検出器が壊れた」なのか「1 文字も読めていない」なのか区別できない**。
//    🚨 **比率（走査 ÷ 候補）は採らなかった**: polish の検査は 0.65 で「範囲が広がると 1.0 へ跳ねる」
//    という意味を持つが、この検査の 30/133 ＝ 0.226 は「`method:` を持つ画面の割合」で、
//    画面が増えれば自然に動く。**意味を持たない比率を基準線にすると、毎回鳴って無視される。**
let bytesRead = 0;

for (const file of files) {
  const source = readFileSync(resolve(root, file), "utf8");
  bytesRead += source.length;
  if (findMutationLines(source).length > 0) scannedWithHits += 1;
  for (const m of source.matchAll(/<form[^>]{0,300}?action=\{([^}]{1,80})\}/g)) {
    formActions.total += 1;
    // `.run`（useSubmitOnce が返す形）を通っていないものを未防御として数える
    if (!/\.run\b/.test(m[1])) {
      formActions.unguarded.push(`${file}:${source.slice(0, m.index).split("\n").length}`);
    }
  }
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

  for (const name of findKeyOfSuspects(source)) {
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

// ── PENDING の上限検査（ラチェット。「増やすためのものではない」を実際に強制する）──
// 🚨 これは直前の腐敗検査（stale）とは別物: stale は「もう要らない例外が残っている」を
// 検出し、こちらは「例外の“数”自体が増えていないか」を検出する。片方が緑でももう片方が
// 赤になり得る（例: 古い例外を消さずに新しい例外を足すと両方赤くなる）。
const pendingExceeded = PENDING.length > MAX_PENDING;
const pendingBelowCeiling = PENDING.length < MAX_PENDING;

if (pendingExceeded) {
  console.error("\n■ 例外リスト（PENDING）が増えました");
  console.error(`  上限 ${MAX_PENDING} 件に対して、現在 ${PENDING.length} 件あります。`);
  console.error("  この例外リストは違反を減らすためのものであり、違反を直す代わりに");
  console.error("  エントリを足して green を保つためのものではありません（PENDING 直前のコメント参照）。");
  console.error("  上限を上げる必要が本当にあるなら、check-submit-once.mjs の MAX_PENDING を");
  console.error("  意図的に書き換えてください。その変更が差分としてレビューに出ることが目的です。");
} else if (pendingBelowCeiling) {
  console.log(`\nPENDING は ${PENDING.length} 件・上限 ${MAX_PENDING} 件です。減らせたなら MAX_PENDING も下げてください（ラチェットを締める）。`);
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

// 🚨 単位を明示する（2026-08-16・司令塔の指示「その数に正しい名前が付いているか」）。
// 以前は「防御済み: 41 件」とだけ出していた。**41 は検出**箇所**の数**で、
// 同じ出力に並ぶ「判定が働いたのは 30 本」は**ファイル**の数。単位が違うものが並んでいた。
// さらに MAX_PENDING（=2）は**ファイル**数、「移行待ち 4 件」は**箇所**数で、これも別単位。
// 🚨 entry は { file, line, owner, kind, reason } の**オブジェクト**（496 行）。
// 一度 String(e).split(":") と書いて "[object Object]" になり、**全部同じ文字列＝ 1 ファイル**と出た。
// 30 ファイルで判定が働いているのに 1 は**ありえない**ので気づけた（数だけ見ていたら通していた）。
const fileCountOf = (list) => new Set(list.map((e) => e.file)).size;
console.log(
  `防御済み: ${guarded.length} 箇所（${fileCountOf(guarded)} ファイル） / ` +
    `未防御: ${unguarded.length} 箇所（${fileCountOf(unguarded)} ファイル） / ` +
    `移行待ち: ${pending.length} 箇所（${PENDING.length} ファイル ＝ MAX_PENDING の単位）`,
);

// 🚨 このセクションは毎回 exit 0 のまま8件を出し続けていた（決める人も状態も無い）。
// PENDING（移行待ち）リストで既に直した「未決のまま緑」と同じ問題——司令塔承認の上で
// 同じメタデータの型をこちらにも付ける（2026-08-16）。
//
// 🚨 owner（誰が決めるか）は推測しない。今日この監査対象で直近コミットから
// 持ち主を推測して5回取り違えたので（count-before-you-report.md）、ここは
// ファイルごとではなく**セクション全体のヘッダ**として「未確定（名乗り待ち）」を置く
// （対象ファイルが複数ペインにまたがるため、ファイル単位で持ち主を決め打ちできない）。
if (suspects.length > 0) {
  console.warn("\n■ 行ごとの操作で keyOf を忘れている疑い（引数つきで呼んでいるのに isPending を使っていない）");
  console.warn("  行ごとの削除で鍵を共有すると、1行を消している間に他の行が押せなくなります。");
  console.warn("  記録: 2026-08-16（この監査で確認した日。元の記録日は不明）");
  console.warn("  状態: 未決");
  console.warn("  決める人: 未確定（名乗り待ち） — 該当ファイルの持ち主が名乗るまで空");
  console.warn("  何を決めるか: 行ごとの鍵（NAME.isPending(引数)）が要るかどうか。要らないなら、要らない理由を1行その場に書く");
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

/**
 * 🚨 この検査で「内部を殺して囮（自己検査）を分離する」検証をする前に読むこと。
 *
 * 内部の一部を殺したのに下の囮（selfTests / 壊し方6）が green のままだったとき、
 * 理由は次の5つのどれかで、見分けずに「壊れている」と結論しないこと:
 *   ① 囮が写し（本物を見ていない） — 囮が本体のロジックを呼ばず、別の判定を再実装している
 *   ② 上流の共有部品を殺した（土台が死ねば全部死ぬ。正常） — 例えば computeCommentRanges を
 *      殺すと、method: 検出も keyOf 検出も両方巻き添えで落ちる。それは異常ではない
 *   ③ まだ出番が来ていない穴（該当するコードが今は無い） — 例えば PENDING が空のときの
 *      腐敗検査（364行目のゼロ件ガードのコメント参照）
 *   ④ 仕事をしていない部品を殺した（殺しても何も変わらない） — 呼ばれていない／到達しない分岐
 *   ⑤ 🚨 安全網が受け止めている（壊れているのに検出が続く） — この検査で実際に起きた形。次項
 *
 * 実測（2026-08-16、この検査自身で）:
 *   ・`method:` の直後の空白マッチ（METHOD_KEY の `\s*`）だけを殺す
 *     → 囮は1本も落ちず、件数（防御済み41 / 未防御0 / 移行待ち4）も1つも動かない
 *   ・過検出の枝（classifyMethodValue の「値が読めない→変更系として扱う」判定。139行目）
 *     だけを殺す → 壊し方2（`method: VERB` を差し込む囮）のみ ❌
 *   ・🚨 両方を同時に殺す → 壊し方1・3（`method: "POST"` を素直に/改行を挟んで差し込む囮）も
 *     ❌ になり、件数は 0 / 0 / 0 まで落ちる
 *
 * 理由: `\s*` を殺すと `method:` の直後の値は ` "POST"`（先頭に空白が付いたまま）で
 * snippet 化される。この形は classifyMethodValue の quoted 判定（128行目
 * `/^(['"]).../`）に**引用符で始まらない**ため一致せず、「値が読めない」に落ちる。
 * すると過検出の枝（139行目）がそのまま拾い直すので検出は途切れず、囮（壊し方1・3）は
 * green のまま——**空白マッチが死んでいることに、囮だけでは気づけない**。
 *
 * 🚨 次にこの検査で囮を分離したいとき:
 *   過検出の枝（classifyMethodValue の unreadable 判定）も**一緒に**外してから内部を殺すこと。
 *   外さずに内部だけ殺すと、④（仕事をしていない部品を殺した）と⑤（安全網が受け止めている）の
 *   見分けが付かない——どちらも「囮が green のまま」という同じ見た目になる。
 *
 * なぜこの安全網を消さないか（意図した設計であり見落としではない）:
 *   過検出（値が読めないものを変更系として拾う）へ倒すのは、取りこぼしより過検出のほうが
 *   安いという本体の方針（117-122行目）そのもの。その代償として「内部の一部が壊れても
 *   検出が続くので、囮だけでは分離しにくい」という副作用を引き受けている。代償を消す
 *   （＝過検出をやめる）のではなく、**代償の存在を書き残す**側を選んだ。
 *
 * 🚨 件数（防御済み/未防御/移行待ち）が動かないことは「正常」の証拠にならない。
 *   `\s*` を殺して安全網だけで検出が続いていた間も、件数は 41 / 0 / 4 のまま変わらなかった。
 *   件数が同じでも内部の一部は実際に壊れていることがある——件数の一致だけを見て
 *   「無事」と判断しないこと。
 */

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
  {
    // 🚨 PUT が抜けていたのを直した回帰防止（2026-08-15 追加）。壊し方1〜3 は元々 POST しか
    // 差し込んでいなかったため、PUT を見落としていても自己検査は全部 ✅ のままだった。
    name: '壊し方4: PUT（method: "PUT"）を差し込む',
    apply(base) {
      const count = countOccurrences(base, NEEDLE);
      const after = base.replaceAll(NEEDLE, `      method: "PUT",\n${NEEDLE}`);
      return { after, count };
    },
  },
  {
    // 🚨 壊し方1〜4 とは**逆向き**の自己検査（2026-08-16 追加。コメント誤検出の修正に対応）。
    // 壊し方1〜4は全部「これは検出されなければならない」を確かめている。だが「検出できるか」
    // だけを確かめる自己検査は、**過検出**（コメントの中身まで実装として拾ってしまう）には
    // 原理的に気づけない——検出されて当然の壊し方しか用意していないので、
    // 「検出されてはいけないのに検出された」を見る手段が無い。
    // ここでは形を逆にし、`method: "POST"` を行コメントの中に差し込んで
    // 「検出 0 件（＝コメントは実装として数えない）」を期待値にする。
    // expectZero を立てることで、下のループは「壊した後に検出が増えないこと」を確認する。
    //
    // 🚨 なぜ pairedPositive が要るか（2026-08-16 追加。実測して発覚）:
    // 「検出 0 件のはず」という expect-zero だけの自己検査は、**分類器(classifyMethodValue)が
    // 死んで何も検出しなくなった状態**でも満たされてしまう——死んだ検出器は何も検出しないので、
    // 「0件のはず」というテストにとっては常に正解に見える。実測: classifyMethodValue を
    // 常に isMutation:false を返すよう壊すと、壊し方1・3・4（「検出されるべき」の自己検査）は
    // 正しく ❌ になったのに、壊し方5だけは検出0件のまま ✅ で残った（分類器の死を隠す）。
    // 対策として、同じ内容を**コメントではなく実コードとして**差し込んだ対照（壊し方1と同形）を
    // 同時に走らせ、そちらは1件検出されることを要求する。両方そろって初めて
    // 「コメントだから無視できた」と言える。対照が無いと「分類器が死んでいるだけ」と
    // 区別がつかない（count-before-you-report.md の「expect-zero は死んだ検出器でも満たされる」
    // という教訓そのもの）。
    name: '壊し方5(逆方向): コメントの中の method: "POST" を差し込む→検出 0 件のはず',
    expectZero: true,
    apply(base) {
      const count = countOccurrences(base, NEEDLE);
      const after = base.replaceAll(NEEDLE, `      // method: "POST",\n${NEEDLE}`);
      return { after, count };
    },
    pairedPositive: {
      // 壊し方1と同形（コメントを外しただけ）。分類器が生きていれば必ず1件検出される対照。
      apply(base) {
        const count = countOccurrences(base, NEEDLE);
        const after = base.replaceAll(NEEDLE, `      method: "POST",\n${NEEDLE}`);
        return { after, count };
      },
    },
  },
];

console.log("\n■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
let selfTestFailed = false;
for (const test of selfTests) {
  const { after, count } = test.apply(BASELINE);
  const detected = findMutationLines(after).length - baselineDetections;
  // expectZero が立っている自己検査（壊し方5）は「検出されないこと」を期待値にする。
  // それ以外（壊し方1〜4）は従来どおり「置換した件数と同じだけ検出されること」を期待する。
  const expected = test.expectZero ? 0 : count;
  let ok = count > 0 && detected === expected;

  // 🚨 pairedPositive がある場合（壊し方5）は、expect-zero 側の結果だけでは ok にしない。
  // 「検出0件」は分類器が死んでいても満たされる（expect-zero は死んだ検出器でも通ってしまう。
  // 上のコメント参照）ので、同じ内容を実コードとして差し込んだ対照（1件検出されるはず）も
  // 必ず両方成立させる。片方だけ表示すると「どちらの半分が落ちたか」が読み取れないため、
  // 出力行に両半分の結果を並べる。
  let pairedSuffix = "";
  if (test.pairedPositive) {
    const { after: pAfter, count: pCount } = test.pairedPositive.apply(BASELINE);
    const pDetected = findMutationLines(pAfter).length - baselineDetections;
    const pExpected = pCount; // 実コードなので置換件数と同じだけ検出されるはず（死んだ検出器なら0のまま外れる）
    const pOk = pCount > 0 && pDetected === pExpected;
    ok = ok && pOk;
    pairedSuffix = `  ｜ 対照(実コードなら検出されるはず): 置換 ${pCount} 件 → 検出 ${pDetected} 件（期待 ${pExpected} 件）${pOk ? "✅" : "❌"}`;
  }

  console.log(`  ${ok ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${detected} 件（期待 ${expected} 件）${pairedSuffix}`);
  if (count === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、この結果は何も確かめていない。");
  }
  if (!ok) selfTestFailed = true;
}

// 🚨 壊し方6: 2つ目の検出（keyOf 忘れ疑い・findKeyOfSuspects）の自己検査（2026-08-16 追加）。
// 1つ目の検出（method:）を直したときにこちらへの適用を忘れていた実例そのものなので、
// 「1つ目を直したら5つの自己検査は全部通っていたのに、2つ目は誰も測っていなかった」を
// 二度と繰り返さないよう、専用のベースラインと壊し方でここに固定する。
// ここで確かめたいのは壊し方1〜5とは逆方向: 「コメントアウトされた isPending( が、
// 本物の疑い（コード側の run(）を黙って消してしまわないか」。ベースラインは
// isPending が一切無い＝1件検出されるはずの最小形。そこへコメントアウトした
// isPending( を足しても、検出件数が変わらない（＝コメントは防御として数えない）ことを期待する。
const KEYOF_BASELINE = [
  "export function RemoveButton() {",
  "  async function handleRemove(id) {",
  "    await remove.run(id);",
  "  }",
  "  return null;",
  "}",
  "",
].join("\n");
const KEYOF_NEEDLE = "  return null;";
const keyofBaselineDetections = findKeyOfSuspects(KEYOF_BASELINE).length; // isPending が無いので 1 のはず

console.log("\n■ 自己検査（keyOf 忘れ疑いの検出・コメント対応）");
{
  const name = "壊し方6: コメントアウトした isPending( を足す → 検出件数は変わらない（防御と誤認しない）";
  const count = countOccurrences(KEYOF_BASELINE, KEYOF_NEEDLE);
  const after = KEYOF_BASELINE.replaceAll(KEYOF_NEEDLE, `    // remove.isPending(id);\n${KEYOF_NEEDLE}`);
  const detected = findKeyOfSuspects(after).length - keyofBaselineDetections;
  const expected = 0; // コメント内の isPending は防御として数えないので、追加前後で検出件数は不変

  // 🚨 なぜ2つの半分を両方見るか（2026-08-16 追加。壊し方5と同じ理由）:
  // 「追加前後で検出件数が変わらない」という expect-zero の主張だけでは、
  // findKeyOfSuspects そのものが死んで**常に何も検出しなくなった**場合でも満たされてしまう
  // （0件 → 0件で「変わらない」に一致するため）。それを見抜くには、
  // 「そもそも素の状態（isPending が一切無い）で1件疑いが出るか」という対照（半分B）が要る。
  // 半分Bが無いまま「差分0件」だけを見ていると、「コメントだから無視できた」のか
  // 「検出器が死んでいるだけ」なのかが区別できない。
  const halfSuppressionOk = detected === expected; // 半分A: コメント化した isPending が疑いを黙って消していないか
  const halfDetectorAliveOk = keyofBaselineDetections === 1; // 半分B: 素の状態で検出器が本当に1件拾えているか（死んでいないか）
  const ok = count > 0 && halfDetectorAliveOk && halfSuppressionOk;

  console.log(
    `  ${ok ? "✅" : "❌"} ${name}` +
      `  ベースライン ${keyofBaselineDetections} 件 → 追加後の差分 ${detected} 件（期待 ${expected} 件）` +
      `  ｜ 半分A(抑制されていないか): ${halfSuppressionOk ? "✅" : "❌"}` +
      `  ｜ 半分B(対照・検出器が生きているか): ベースライン検出 ${keyofBaselineDetections} 件（期待 1 件） ${halfDetectorAliveOk ? "✅" : "❌"}`,
  );
  if (count === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、この結果は何も確かめていない。");
  }
  if (!halfDetectorAliveOk) {
    console.error(`     ↑ ベースライン自体が1件検出のはずが ${keyofBaselineDetections} 件だった。検出器(findKeyOfSuspects)が死んでいる可能性。`);
  }
  if (!ok) selfTestFailed = true;
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

// ── 死角の見張り（`checks-must-declare-blind-spots.md`）──
// 🚨 冒頭の「見ていないもの」は、2026-08-16 に実演して確かめた。
//    しかしその記述は**検出器を広げた瞬間に古くなる**。古くなったことに誰も気づかない。
//    → 見逃すはずの形を毎回通し、**拾えるようになったら鳴らす**（記述を直せ、と言う）。
//    🟢 対照（拾うはずの形）も一緒に通す。検出器が死んだときは、そちらが鳴る。
//
// 🚨 **この見張りの RED は、片側しか測れていない（2026-08-16・unverified）**:
//    🟢 測れた … 検出器を殺すと「拾うはず」の 2 件が ❌ になる（＝対照側は鳴る）
//    🚨 測れていない … **検出器を広げたとき「見逃すはず」が ❌ になるか**。
//       3 回試して 3 回とも**壊し方のほうが壊れた**（2 回は挿入コードの構文エラー、
//       1 回は置換が当たったのに狙った振る舞いが変わらなかった）。
//       🚨 **「鳴るはず」は設計上の期待であって、実測ではない。**
//       壊し方を思いついた人は、測って、この行を消してください。
// 🚨 **この見張りは、実物と同じ入口から入っていない**（2026-08-16・司令塔の規律に沿って明記）。
//    実物の経路 … `globSync` でファイル列挙 → `readFileSync` → `findMutationLines` → 防御判定
//    見張りの経路 … 🚨 **`findMutationLines` を直に呼ぶ**（列挙とその後の判定を飛ばしている）
//    ＝ 測れているのは「**検出器の一段が拾うか**」であって「経路全体で見逃すか」ではない。
//    🚨 **なぜ実物の入口から入れないか**: 入口は実在のファイルを読むので、囮を通すには
//    **共有ツリーに .tsx を置くことになる**（他ペインの門を巻き込む）。台に写しても、
//    root を実物へ固定すると結局その実物を読む。**作れないので、理由を書いて残す。**
//
// 🚨 3 つ目の欄は「**いまこのコードに在る形か**」（2026-08-16 実測）。
//    司令塔の指摘: **見逃す入力は、規約を知っている人が作らないと「在りえない形」ばかりになる。**
//    在りえない形だけで固めると、**見逃しの実害が 0 でも同じ緑**になり、何も言わない検査になる。
const BLIND_SPOTS = [
  ["<form action={fn}> で送る", '<form action={save}><button>x</button></form>', true, () => `在る（${formActions.total} 件・うち ${formActions.unguarded.length} 件が未防御）｜ 🚨 毎回数えている`],
  ["Server Action を直に呼ぶ", "await setLocaleAction(formData);", true, "在る（profile-settings.tsx:229）"],
  ["axios で送る", 'await axios.post("/api/x", body);', true, "無い（0 件）"],
  ["sendBeacon で送る", 'navigator.sendBeacon("/api/x", body);', true, "無い（0 件）"],
  ["XMLHttpRequest で送る", 'const x = new XMLHttpRequest(); x.open("POST", "/api/x"); x.send(body);', true, "無い（0 件）"],
  // 🚨 これは「見ていないもの」に**書いていない**形。拾えることを毎回示す（記述が広すぎないことの担保）
  ["同一ファイルの変数経由", 'const opts = { method: "POST" }; await fetch("/api/x", opts);', false, "在る"],
  ["🟢 対照: fetch + method", 'await fetch("/api/x", { method: "POST" });', false, "在る"],
];
const blindBase = findMutationLines(BASELINE).length;
let blindDrift = false;
console.log(
  `\n■ 走査の実数  候補 ${files.length} 本 / 🚨 **判定が働いた（method: を含む）のは ${scannedWithHits} 本** / 読めた文字数 ${bytesRead.toLocaleString("en-US")}（平均 ${Math.round(bytesRead / files.length).toLocaleString("en-US")} 文字/ファイル・下限 ${MIN_AVG_BYTES.toLocaleString("en-US")}）`,
);
// 🚨 **順序が意味を持つ**（2026-08-16）。読み込みが死ぬと判定も 0 になるので、
//    先に「判定 0」を見ると **どちらが止めたのか区別できない**（司令塔の指摘）。
//    **読み込みの死を先に疑う**——「違反 0 件」より先に「読めているか」を言う。
if (Math.round(bytesRead / files.length) < MIN_AVG_BYTES) {
  console.error(
    `🚨 1 ファイルあたりの平均文字数が下限を下回りました（${Math.round(bytesRead / files.length)} < ${MIN_AVG_BYTES}）。`,
  );
  console.error("  🚨 **違反の件数より先に、読み込みか走査の範囲が壊れていることを疑ってください。**");
  console.error("  （このとき「判定 0 本」も一緒に出ますが、原因は**読めていないこと**です）");
} else if (scannedWithHits === 0) {
  console.error("🚨 判定が 1 本も働いていません（🟢 読み込みは足りているので、読めていないせいではありません）。");
  console.error("  （検出器が壊れた／走査対象の形が変わった、のどちらか。**緑にしてはいけない状態です**）");
} else if (scannedWithHits < MIN_SCANNED) {
  console.error(`🚨 判定が働いた本数が床を割りました（${scannedWithHits} 本 < 床 ${MIN_SCANNED} 本）。`);
  console.error("  0 ではないので「何も見ていない」ではありませんが、**ほとんど見ていない**状態です。");
  console.error("  検出器が部分的に壊れたか、対象が本当に減ったか。減ったのなら MIN_SCANNED を下げてください。");
}
console.log("\n■ 死角の見張り（見逃すはずの形が、拾えるようになっていないか）");
// 🚨 「届いたか」を出力で示す（2026-08-16・司令塔の指示）。「検出 0 件」は
//    **届いて判定が通した**とも **そもそも届かなかった**とも読める。下の「拾うはず」2 本が
//    1 件以上を返していることが、**同じ関数に同じ形で入力が届いている**ことの証拠。
console.log(
  "  🚨 「検出 0 件」の読み方: 下の**拾うはず 2 本が 1 件以上**を返していれば、判定に**届いている**。" +
    "その 2 本が 0 なら、上の 0 は「見逃した」ではなく「**届いていない**」。",
);
for (const [name, code, shouldMiss, exists] of BLIND_SPOTS) {
  const got = findMutationLines(`${BASELINE}\n${code}`).length - blindBase;
  const ok = shouldMiss ? got === 0 : got > 0;
  if (!ok) blindDrift = true;
  console.log(
    `  ${ok ? "✅" : "❌"} ${shouldMiss ? "見逃すはず" : "拾うはず  "} ${name}（検出 ${got} 件）｜ 実在: ${typeof exists === "function" ? exists() : exists}`,
  );
}
console.log(
  `  🚨 「無い」と書いた形は、見逃していても実害が 0。実害が在るのは「在る」と書いた ${
    BLIND_SPOTS.filter((sp) => sp[2] && (typeof sp[3] === "function" ? sp[3]() : sp[3]).startsWith("在る")).length
  } 形（🚨 **半分だけ自動**: form の件数は毎回数えているが、他の「在る／無い」は 2026-08-16 の手動実測）`,
);
if (blindDrift) {
  console.error("\n🚨 死角の記述が実装と食い違っている。");
  console.error("  ・「見逃すはず」が拾えるようになった → **冒頭の「見ていないもの」から外す**");
  console.error("  ・「拾うはず」が拾えなくなった → **検出器が壊れている**（死角の話ではない）");
}

process.exit(
  unguarded.length === 0 &&
    !selfTestFailed &&
    staleExceptions.length === 0 &&
    unclassified.length === 0 &&
    !pendingExceeded &&
    !blindDrift &&
    scannedWithHits >= MIN_SCANNED &&
    Math.round(bytesRead / files.length) >= MIN_AVG_BYTES
    ? 0
    : 1,
);
