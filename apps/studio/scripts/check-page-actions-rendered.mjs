/**
 * `lib/admin/page-actions.ts` が**宣言したアクションが、実際に画面へ出ているか**を確かめる。
 *
 *   node scripts/check-page-actions-rendered.mjs
 *
 * ── なぜ別の検査が要るのか ──
 *
 * `check-page-actions.mjs` は**宣言の中身**（辞書キー・form の id・行き先）が
 * 実在するかを見る。だが**「宣言したものが画面に出ているか」は一度も見ていなかった。**
 *
 * 実際に起きたこと（2026-08-15）:
 *   /admin/content/[collection]/new と /admin/content/[collection]/[id] は
 *   `kind:"submit" form:"item-form" role:"primary"` を**宣言していたのに、
 *   どちらの画面も `<PageAction>` を描いていなかった**。
 *   → **保存ボタンがどこにも無い**のに、検査は緑だった。
 *   → ⌘Enter（保存）を実装した側も、発火できる画面が 1 つも無くて止まっていた。
 *
 * 🚨 **「宣言が正しい」と「宣言どおり動く」は別のこと。** 前者だけ見る検査は、
 *    後者が全部壊れていても緑になる（`~/.claude/rules/count-before-you-report.md` の
 *    「0 件は単独では情報を持たない」と同じ形）。
 *
 * ── どう測るか ──
 *
 * ページ（`app/(admin)/<route>/page.tsx`）から **`@/` の import を再帰的にたどり**、
 * たどり着いた範囲に `<PageAction` があるかを見る。
 * 🚨 **page.tsx だけを見ては駄目**。実際 `/admin/notifications` は
 *    `notifications-manager.tsx` の中、`/admin/reports` は `bug-report-action.tsx` の中、
 *    アイテムの保存は `item-form.tsx` の中で描いている。
 *    page.tsx だけ数えると、**出ているものを「出ていない」と誤って数える**。
 *
 * `kind:"submit"` は、たどり着いた範囲に **その `form` の id を持つ呼び出し**が
 * あることまで見る（id を書き間違えると、押しても黙って何も起きないため）。
 */

import { execFileSync } from "node:child_process";

import { stripComments } from "./strip-comments.mjs";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actionsPath = resolve(root, "lib/admin/page-actions.ts");

if (!existsSync(actionsPath)) {
  console.error("■ lib/admin/page-actions.ts が無い");
  process.exit(1);
}

// 🚨 **採取した HEAD と作業ツリーの状態を出す**（司令塔 2026-08-15）。
//    共有ツリーでは HEAD が数分で動く（実測: 同じ夜に 9df2aca → cb3a5ba → 3d49196）。
// 🚨 見ていない範囲: 数えるのは **この検査が見る範囲の未コミット変更だけ**。
{
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "lib/admin", "app", "components"],
    { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean).length;
  console.log(`採取: HEAD ${head} / この検査が見る範囲の未コミット変更 ${dirty} 件`);
  console.log("  見る範囲: lib/admin/page-actions.ts と app/・components/ 配下の呼び出し");
}

const src = readFileSync(actionsPath, "utf8");
const tableStart = src.indexOf("export const PAGE_ACTIONS");
if (tableStart < 0) {
  console.error("■ PAGE_ACTIONS が見つからない（名前を変えたなら、この検査も直すこと）");
  process.exit(1);
}
const table = src.slice(tableStart);

/** ルートごとの宣言を切り出す */
const marks = [...table.matchAll(/^ {2}"(\/admin[^"]*)":\s*\[/gm)].map((m) => ({
  route: m[1],
  at: m.index ?? 0,
}));
const declarations = marks.map((mark, i) => {
  const block = table.slice(mark.at, i + 1 < marks.length ? marks[i + 1].at : table.length);
  return {
    route: mark.route,
    entries: [...block.matchAll(/kind:\s*"(\w+)"/g)].map((m) => m[1]),
    forms: [...block.matchAll(/form:\s*"([^"]+)"/g)].map((m) => m[1]),
  };
});

/** `@/...` の import をたどるための解決 */
function resolveAlias(spec, fromFile) {
  const raw = spec.startsWith("@/")
    ? resolve(root, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(fromFile), spec)
      : null;
  if (!raw) return null; // 外部パッケージは追わない
  for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const candidate = `${raw}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return existsSync(raw) ? raw : null;
}

/**
 * そのファイルから到達できるファイル一式。
 * 🚨 深さを切らない（切ると「深いところで描いている」を見落とす）。
 *    循環は visited で止まる。
 */
function reachableFrom(entryFile) {
  const seen = new Set();
  const stack = [entryFile];
  while (stack.length > 0) {
    const file = stack.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const body = readFileSync(file, "utf8");
    for (const m of body.matchAll(/from\s+"([^"]+)"/g)) {
      const next = resolveAlias(m[1], file);
      if (next && !seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

const problems = [];
let inspectedRoutes = 0;
let inspectedFiles = 0;
let foundCallSites = 0;

for (const { route, entries, forms } of declarations) {
  const page = resolve(root, `app/(admin)${route}/page.tsx`);
  if (!existsSync(page)) {
    problems.push(`${route} … 宣言はあるのに page.tsx が無い`);
    continue;
  }
  inspectedRoutes += 1;

  const files = reachableFrom(page);
  inspectedFiles += files.size;

  let calls = 0;
  const formsSeen = new Set();
  for (const file of files) {
    // 🚨 **コメントを実装として数えない**（2026-08-15 実測）。
    //    `form="collection-delete-form"` を**コメントが供給**していて、
    //    実装行を消しても検査が緑のままだった（メモリ上で再現済み）。
    const body = stripComments(readFileSync(file, "utf8"));
    const hits = body.match(/<PageAction\b/g);
    if (!hits) continue;
    calls += hits.length;
    for (const m of body.matchAll(/form=["{]"?([\w-]+)"?/g)) formsSeen.add(m[1]);
  }
  foundCallSites += calls;

  // 🚨 **この検査は「ルートに 1 つでも出ているか」までしか見ていない。**
  //    宣言が 2 件あって 1 件しか描いていなくても通る。
  //    実際に踏んだ（2026-08-15）: `/admin/files/[id]` は「保存(submit)」と「削除(button)」の
  //    2 件を宣言していて、保存を足した時点でこの検査は緑になった。**削除は無いまま。**
  //
  //    件数で比べる形（見つけた数 < 宣言数 なら落とす）にはしていない。
  //    `reachableFrom` は import を辿るので、**別のルート用の `<PageAction>` を持つ部品を
  //    経由しただけで数が増える**（例: files のページから files-manager を辿ると、
  //    アップロード用の呼び出しまで数に入る）。**過検出で人を止めるほうが害が大きい。**
  //
  //    🚨 **import しただけでも数に入る（実測 2026-08-15）。**
  //    `/admin/settings/version` から `<VersionCheckAction />` の**呼び出しだけ**を消して
  //    走らせたら、**緑のままだった**（import が残っているので `reachableFrom` が
  //    その部品に届き、中の `<PageAction>` を数えた）。import ごと消すと赤くなる。
  //    → **この検査は「その部品を描いている」ことの証拠にはならない。**
  //      描いているかどうかは、最後はブラウザで見るしかない。
  //
  //    いま確実に一致を見られるのは `kind:"submit"` だけ（form の id という手がかりがある）。
  //    `link` / `button` は呼び出し側に宣言と結びつく文字列が無いので、静的には照合できない。
  //    → **照合できないものは「見た」と言わない。** 下の集計で件数を出して、
  //      人が突き合わせられるようにしてある。
  if (calls === 0) {
    problems.push(
      `${route} … ${entries.length} 件を宣言しているのに <PageAction> がどこにも無い` +
        `（page.tsx から辿れる ${files.size} ファイルを見た）`,
    );
    continue;
  }

  // 🚨 `submit` は form の id まで一致していること。id が違うと黙って効かない。
  for (const form of new Set(forms)) {
    if (!formsSeen.has(form)) {
      problems.push(`${route} … form="${form}" を宣言しているが、その id を渡す呼び出しが無い`);
    }
  }
}

console.log(`宣言のあるルート: ${declarations.length} 件 / page.tsx があり検査したもの: ${inspectedRoutes} 件`);
console.log(`辿ったファイル: のべ ${inspectedFiles} 件 / 見つけた <PageAction>: のべ ${foundCallSites} 件`);

// 🚨 **緑を「全部照合した結果」と読ませない。**
//    form の id で一致まで見られるのは submit だけ。link と button は静的に結びつけられない。
//    その件数をここに出して、**何を見ていないか**が数で分かるようにする。
const totalEntries = declarations.reduce((sum, d) => sum + d.entries.length, 0);
const submitEntries = declarations.reduce(
  (sum, d) => sum + d.entries.filter((k) => k === "submit").length,
  0,
);
console.log(
  `宣言の総数: ${totalEntries} 件` +
    ` … うち form の id まで一致を見たもの: ${submitEntries} 件 /` +
    ` 一致を見ていないもの（link・button）: ${totalEntries - submitEntries} 件`,
);
console.log(
  "🚨 link と button は、呼び出し側に宣言と結びつく文字列が無いため**静的には照合できない**。" +
    "「ルートに 1 つでも <PageAction> があるか」までしか見ていない。",
);

// 🚨 対象が 0 なら「異常が無い」ではなく「見ていない」。失敗として扱う。
if (inspectedRoutes === 0) {
  console.error("\n■ 検査対象が 0 件（宣言を読めていない＝検査が空振りしている）");
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`\n■ 宣言したのに画面へ出ていない: ${problems.length} 件`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("問題なし（上の件数を実際に辿った結果として 0 件）");
