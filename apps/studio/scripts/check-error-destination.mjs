#!/usr/bin/env node
/**
 * 失敗したときの**戻り先の画面**が、理由（`?error=<鍵>`）を出せることを確かめる。
 *
 * 由来: 2026-08-17。`1ecfc209` で「失敗すると入力が消える」を直すため、欄の作成の戻り先を
 * コレクション画面から**フォームの画面**へ移した。ところがフォームの画面は `searchParams` を
 * 読んでおらず、**`?error=conflict` が黙って捨てられた**。
 *   実測 … URL は `?error=conflict` なのに **画面の文言 0 行**（帯も alert も無い）
 *   ＝ 入力は残るが、**なぜ失敗したのか分からない**。片方を直して片方を壊していた。
 *
 * 🚨 **URL に鍵が付いていることは、画面に文言が出ていることの証拠ではない。**
 * 規約: DESIGN.md（司令塔が 2026-08-17 に追加）。決定は
 * `knowledge/decisions/error-destination-must-render-the-reason.md`。
 *
 * ## 🚨 過検出に倒してある（司令塔の指示・2026-08-17）
 * 戻り先の式を解決できなかったときは、**黙って緑にせず落とす**。
 * 理由: **取りこぼすと気づけない**（この検査が在るのに穴が空く）。
 * 過検出なら**人が 1 件見に行くだけ**で済む。
 *
 * ## 🚨 2026-08-17 時点、この検査は門（lefthook）に入っていない。＝ 誰も回さない。
 *    置いてあるだけでは「異常が無い 0」ではなく **「見ていない 0」** を作る。
 *    手で回すこと: `node scripts/check-error-destination.mjs`
 *    （登録は人がやる。入ったら**この段落を消すこと**——残すと但し書きのほうが嘘になる）
 *
 * ## 🚨 この検査が見ていないもの（出力にも同じものを印字する）
 * 1. **`redirectWithMessage` の呼び出しだけ**を見る。ほかの口で `?error=` を付ける経路は見ていない。
 * 2. 受ける口（`errorKeyFromQuery`）と**出す口**（`<ErrorBanner>`）の**両方**を見る。
 *    ただし見えるのは「**同じ画面のどこかに在る**」ことだけ——
 *    別の error を出していても緑になる。**その 1 段は人が画面で見る**。
 *    🚨 最初の版は受ける口だけを見ていて、**帯を消した版が素通りした**（実測 rc=0）。
 * 3. **索引を見る**ので、まだ `git add` していない変更は見えない。
 * 4. 戻り先が**動的に組み立てられている**（変数を跨ぐ・条件で分かれる）ときは解決できない
 *    → その場合は 1 件として**落とす**（黙って通さない）。
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";
import { stripComments } from "./strip-comments.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 走る場所（母集合）。**ここに書いてあるものしか見ていない**（盲点 1）。 */
const ROUTES_GLOB = "app/admin/actions/**/route.ts";
/** 戻り先の画面を探す根。App Router の区画。 */
const PAGES_ROOT = "app/(admin)";
/**
 * 戻り先が理由を出せることの合図。**2 つ揃って初めて「出せる」**。
 *
 * 🚨 最初の版は `errorKeyFromQuery(` **だけ**を見ていた。自分で抜け道を通したら**素通りした**
 *    （実測 2026-08-17: 帯 `<ErrorBanner>` を消し、呼び出しだけ残した版で **rc=0**）。
 *    ＝ **堀池さんが報告した状態そのもの**（URL に鍵は付くが画面には何も出ない）が通る。
 *    → **画面へ出している側も見る。**
 * 規律: pages（w4A:p2F）の 1 行「**必須にした・検査を足した で安心しない。
 *    抜け道を 1 つ自分で挙げて、それを実際に通してみる**」。
 */
const RECEIVERS = [
  { re: /\berrorKeyFromQuery\s*\(/, what: "URL の鍵を受ける口（errorKeyFromQuery）" },
  { re: /<ErrorBanner\b/, what: "画面へ出す口（<ErrorBanner>）" },
];

const BLIND_SPOTS = [
  "redirectWithMessage の呼び出しだけを見る（ほかの口で ?error= を付ける経路は見ていない）",
  "受ける口と <ErrorBanner> の両方が在るかを見る。ただし **同じ画面のどこかに在る** ことしか見ない（別の error を出していても緑）",
  "ErrorBanner 以外の出し方をしていると落ちる（過検出。人が 1 件見に行く）",
  "索引を見るので、まだ git add していない変更は見えない",
  "戻り先を解決できないときは緑にせず落とす（過検出に倒してある）",
];

/**
 * 引数を**先頭階層のカンマ**で割る。テンプレート `${}` の中や入れ子の括弧では割らない。
 * 🚨 自前で書いているのは、`redirectWithMessage(request, `${path}/x`, "error", key)` のように
 *    **2 番目の引数にテンプレートが来る**ため（素の split(",") では壊れる）。
 */
function splitArgs(text) {
  const args = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      current += c;
      if (c === "\\") {
        current += text[i + 1] ?? "";
        i += 1;
      } else if (c === quote) quote = null;
      else if (quote === "`" && c === "$" && text[i + 1] === "{") depth += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      current += c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0 && c === ")") break;
      depth -= 1;
    }
    if (c === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/**
 * テンプレートや文字列を「動的セグメントを星印にしたパス」へ。解決できなければ null。
 * 例: `${path}/fields/new` → 星印 + `/fields/new`
 * 🚨 この説明に星印と斜線を並べて書かないこと（ブロックコメントがそこで閉じる。実際に踏んだ）。
 */
function literalToPath(expr) {
  const t = expr.trim();
  if (/^`[^`]*`$/.test(t)) {
    // テンプレート。`${…}` を 1 セグメントの `*` にする（入れ子の `}` は想定しない）。
    const inner = t.slice(1, -1);
    if (inner.includes("`")) return null;
    return inner.replace(/\$\{[^{}]*\}/g, "*");
  }
  if (/^"[^"]*"$/.test(t) || /^'[^']*'$/.test(t)) return t.slice(1, -1);
  return null;
}

/**
 * 式を解決する。テンプレートなら中の `${…}` を、同じファイルの `const` を辿って**再帰的に**開く。
 *
 * 🚨 1 段だけだと足りない（実測 2026-08-17・この検査の最初の版）:
 *    `const formPath = <テンプレート>` の中に `path` が入っていて、
 *    `path` を開かないと「星印/fields/new」のままになり、**戻り先が見つからないと誤報**した。
 */
function resolveExpr(source, expr, depth = 0) {
  if (depth > 5) return null;
  const t = expr.trim();
  const direct = literalToPath(t);
  if (direct !== null && !direct.includes("*")) return direct;

  // テンプレートなら、`${…}` を 1 つずつ開いてから星印にする
  if (/^`[^`]*`$/.test(t)) {
    const inner = t.slice(1, -1);
    let out = "";
    let rest = inner;
    for (;;) {
      const m = /\$\{([^{}]*)\}/.exec(rest);
      if (!m) {
        out += rest;
        break;
      }
      out += rest.slice(0, m.index);
      const opened = resolveExpr(source, m[1].trim(), depth + 1);
      // 開けない中身（関数呼び出し・演算）は 1 セグメントの星印として扱う
      out += opened ?? "*";
      rest = rest.slice(m.index + m[0].length);
    }
    return out;
  }
  if (direct !== null) return direct;

  // 識別子なら、同じファイルの `const <名前> = …;` を辿る
  if (/^[A-Za-z_$][\w$]*$/.test(t)) {
    const m = new RegExp(`\\bconst\\s+${t}\\s*=\\s*([^;\\n]+);`).exec(source);
    if (!m) return null;
    return resolveExpr(source, m[1], depth + 1);
  }
  // `encodeURIComponent(x)` のような呼び出しは 1 セグメントの星印
  if (/^[\w$.]+\(.*\)$/.test(t)) return "*";
  return null;
}

/**
 * 解決した URL パスから、戻り先の `page.tsx`（リポジトリ相対）を探す。
 *
 * 🚨 **星印は動的セグメントにだけ当てる。リテラルは同じ名前にだけ当てる。**
 *    緩くすると `/admin/content/星印/new` が `[collection]/[id]/page.tsx` に当たる
 *    （実測 2026-08-17・この検査の最初の版。**当たった先も受け皿を持っていたので緑になり、
 *    違う画面を見て緑と言っていた**＝ 同じ結論が違う理由で出る形）。
 */
function findPage(urlPath, pageFiles) {
  const want = urlPath.split("?")[0].split("/").filter(Boolean);
  for (const file of pageFiles) {
    // 例: app/(admin)/admin/collections/[collection]/fields/new/page.tsx
    const segs = file
      .slice(`${PAGES_ROOT}/`.length, -"/page.tsx".length)
      .split("/")
      .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
    if (segs.length !== want.length) continue;
    const isDynamic = (s) => s.startsWith("[") && s.endsWith("]");
    if (segs.every((s, i) => (want[i] === "*" ? isDynamic(s) : s === want[i]))) return file;
  }
  return null;
}

const routeFiles = trackedGlob(ROUTES_GLOB, { cwd: root });
const pageFiles = trackedGlob(`${PAGES_ROOT}/**/page.tsx`, { cwd: root });

// 🚨 **0 の顔**: 母集合が空なら「違反が無い」ではなく「探し方が当たっていない」。
if (routeFiles.length === 0 || pageFiles.length === 0) {
  console.error(
    `■ 母集合が空です（route ${routeFiles.length} 本 / page ${pageFiles.length} 枚）。\n` +
      "  🚨 これは「違反が無い」ではなく、**この検査が動いていない**合図です。緑にしません。",
  );
  process.exit(1);
}

const failures = [];
const passed = [];
let calls = 0;

for (const rel of routeFiles) {
  const raw = readTracked(resolve(root, rel));
  if (raw === null) continue; // trackedGlob と同じ索引を見ているので通常起きない
  const source = stripComments(raw);
  const re = /redirectWithMessage\s*\(/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const args = splitArgs(source.slice(m.index + m[0].length));
    // 失敗の戻り先だけを見る（第 3 引数が "error"）。notice は対象外。
    if (args.length < 3 || !/^["']error["']$/.test(args[2])) continue;
    calls += 1;
    const expr = args[1];
    const urlPath = resolveExpr(source, expr);
    if (!urlPath) {
      failures.push(
        `${rel} … 戻り先の式を解決できません: ${expr}\n` +
          "      🚨 解決できないものは緑にしません（過検出に倒してある）。人が画面で確かめてください",
      );
      continue;
    }
    const page = findPage(urlPath, pageFiles);
    if (!page) {
      failures.push(
        `${rel} … 戻り先 ${urlPath} に対応する page.tsx が索引に見つかりません（式: ${expr}）`,
      );
      continue;
    }
    const pageSource = readTracked(resolve(root, page));
    if (pageSource === null) {
      failures.push(`${rel} … 戻り先 ${page} が索引に無い（改名・削除・未 add）`);
      continue;
    }
    const clean = stripComments(pageSource);
    const missing = RECEIVERS.filter((r) => !r.re.test(clean));
    if (missing.length === 0) passed.push(`${rel} → ${urlPath}（${page}）`);
    else {
      failures.push(
        `${rel} … 戻り先 ${urlPath} が理由を出せません（${page} に ${missing.map((m) => m.what).join(" と ")} が無い）\n` +
          "      🚨 URL に ?error= が付いても、画面には何も出ません（実測 2026-08-17: 文言 0 行）",
      );
    }
  }
}

console.log(`失敗の戻り先（redirectWithMessage の "error"）: ${calls} 箇所 / route ${routeFiles.length} 本`);
console.log(`  理由を出せる戻り先: ${passed.length}`);
for (const p of passed) console.log(`  🟢 ${p}`);

console.log("\n□ この検査が見ていないもの");
for (const b of BLIND_SPOTS) console.log(`  ・${b}`);

if (failures.length > 0) {
  console.error(`\n■ 理由を出せない戻り先: ${failures.length} 件`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\n  直し方: 戻り先の page.tsx に `searchParams` を受け、" +
      "`errorKeyFromQuery(params.error)` を `ErrorBanner` へ渡す（既に在る形をそのまま使う）。",
  );
}

process.exit(failures.length === 0 ? 0 : 1);
