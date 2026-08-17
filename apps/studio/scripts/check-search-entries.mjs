#!/usr/bin/env node
/**
 * ナビから辿れる画面が横断検索の PAGE_ENTRIES に入っているかを確かめる。
 *
 * 由来: 2026-08-15。`/admin/settings/sso` はナビに出ていたが、検索の静的画面一覧から
 * 漏れていた。検索対象は「ルート一覧」ではなく「ナビから辿れる目的地」に揃える。
 *
 * 🚨 ナビの `href` は2形ある:
 *   - オブジェクト: `{ href: "/admin/..." }`
 *   - JSX: `<Link href="/admin/...">`
 * 片方だけを見ると、JSX だけで追加された `/admin/reports` のような行を見落とす。
 *
 * 🚨 走るたびに、実物を2通りに壊して赤くなることを確かめてから判定を出す。
 *    置換・挿入が 0 件なら壊せていないので、検査結果は信用できない。
 *
 *   node scripts/check-search-entries.mjs
 */

import { readFileSync } from "node:fs";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAYOUT_SOURCE = "app/(admin)/layout.tsx";
const SEARCH_SOURCE = "lib/search/service.ts";
const ADMIN_APP_DIR = "app/(admin)";

function normalizeHref(href) {
  const withoutFragment = href.split("#")[0].split("?")[0];
  return withoutFragment.length > 1 ? withoutFragment.replace(/\/+$/, "") : withoutFragment;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function extractNavHrefs(source) {
  const hrefs = [];
  const patterns = [
    // Object literal form: { href: "/admin/..." }
    /\bhref\s*:\s*["'](\/admin[^"']*)["']/g,
    // JSX prop form: <Link href="/admin/...">
    /\bhref\s*=\s*["'](\/admin[^"']*)["']/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) hrefs.push(normalizeHref(match[1]));
  }

  return uniqueSorted(hrefs);
}

function extractPageEntryHrefs(source) {
  const start = source.indexOf("const PAGE_ENTRIES");
  const end = source.indexOf("];", start);
  if (start === -1 || end === -1) return [];

  const body = source.slice(start, end);
  const hrefs = [];
  let match;
  const pattern = /\bhref\s*:\s*["'](\/admin[^"']*)["']/g;
  while ((match = pattern.exec(body)) !== null) hrefs.push(normalizeHref(match[1]));
  return uniqueSorted(hrefs);
}

function routeFromPageFile(file) {
  const prefix = `${ADMIN_APP_DIR}/`;
  if (!file.startsWith(prefix) || !file.endsWith("/page.tsx")) return null;

  const route = `/${file.slice(prefix.length, -"/page.tsx".length)}`;
  if (route.includes("[")) return null;
  return normalizeHref(route);
}

function extractStaticRoutes() {
  return uniqueSorted(
    trackedGlob(`${ADMIN_APP_DIR}/**/page.tsx`, { cwd: root })
      .map(routeFromPageFile)
      .filter((route) => route !== null),
  );
}

function findViolations({ layoutSource, searchSource, routes }) {
  const navHrefs = extractNavHrefs(layoutSource);
  const pageEntryHrefs = extractPageEntryHrefs(searchSource);
  const routeSet = new Set(routes);
  const pageEntrySet = new Set(pageEntryHrefs);

  return {
    navHrefs,
    pageEntryHrefs,
    routes,
    missingFromSearch: navHrefs.filter((href) => !pageEntrySet.has(href)),
    deadPageEntries: pageEntryHrefs.filter((href) => !routeSet.has(href)),
  };
}

function countOccurrences(haystack, needle) {
  return needle ? haystack.split(needle).length - 1 : 0;
}

function replaceAllCount(source, from, to) {
  const count = countOccurrences(source, from);
  return { count, source: source.replaceAll(from, to) };
}

function insertAfterCount(source, marker, insertion) {
  const count = countOccurrences(source, marker);
  if (count === 0) return { count, source };
  return { count, source: source.replace(marker, `${marker}${insertion}`) };
}

// 🚨 **両側を同じ側（索引）から読む**。ルートの列挙を索引にして宣言を作業ツリーのままにすると、
//    「実在するのに宣言が無い」が「宣言が在るのに実在しない」に**裏返るだけ**になる
//    （2026-08-16 実測。詳しくは lib/tracked-files.mjs の `readTracked`）。
//    ＝ **どちらもまだ入っていなければ緑**。入れた側だけ入っていれば、入れた人が落ちる。
const layoutSource = readTracked(resolve(root, LAYOUT_SOURCE));
const searchSource = readTracked(resolve(root, SEARCH_SOURCE));
// 🚨 `null`（未追跡）は「中身が空」ではない。この 2 本は追跡済みでなければ検査そのものが成り立たない。
for (const [name, src] of [[LAYOUT_SOURCE, layoutSource], [SEARCH_SOURCE, searchSource]]) {
  if (src === null) {
    console.error(`🚨 ${name} が索引にありません。**この検査は何も照合していません**（緑にしないでください）`);
    process.exit(1);
  }
}
const routes = extractStaticRoutes();

console.log("■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
let selfTestFailed = false;

{
  const target = '  { labelKey: "page_settings_sso", href: "/admin/settings/sso" },\n';
  const broken = replaceAllCount(searchSource, target, "");
  const found = findViolations({
    layoutSource,
    searchSource: broken.source,
    routes,
  }).missingFromSearch.length;
  const ok = broken.count > 0 && found > 0;
  console.log(`  ${ok ? "✅" : "❌"} 壊し方1: PAGE_ENTRIES から既存の行を消す  置換 ${broken.count} 件 → 検出 ${found} 件`);
  if (broken.count === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、赤くならないのは当然。検査の書き方が古い。");
  }
  if (!ok) selfTestFailed = true;
}

{
  // 🚨 2026-08-17: 目印を `reportsNav` から替えた。I1 で **その変数ごと消えた**ため
  //    （囮が的を失い、自己検査が「挿入 0 件」で赤くなった。検査は正しく鳴いていた）。
  //    🚨 目印は **消えにくいもの**を選ぶ。`settingsItems` は左サイドバーの中身そのもの。
  const marker = "const settingsItems = [\n";
  const insertion = '  <Link href="/admin/__search_self_test" />;\n';
  const broken = insertAfterCount(layoutSource, marker, insertion);
  const found = findViolations({
    layoutSource: broken.source,
    searchSource,
    routes,
  }).missingFromSearch.length;
  const ok = broken.count > 0 && found > 0;
  console.log(`  ${ok ? "✅" : "❌"} 壊し方2: JSX 形式のナビ行を足す  挿入 ${broken.count} 件 → 検出 ${found} 件`);
  if (broken.count === 0) {
    console.error("     ↑ 挿入が 0 件。壊せていないので、赤くならないのは当然。検査の書き方が古い。");
  }
  if (!ok) selfTestFailed = true;
}

const result = findViolations({ layoutSource, searchSource, routes });

console.log("\n■ 判定");
console.log(`  ナビの行き先: ${result.navHrefs.length} 件`);
console.log(`  PAGE_ENTRIES: ${result.pageEntryHrefs.length} 件`);
console.log(`  app/(admin) の静的ルート: ${result.routes.length} 件`);
console.log(`  ナビにあるが PAGE_ENTRIES に無い: ${result.missingFromSearch.length} 件`);
console.log(`  PAGE_ENTRIES にあるがルートが無い: ${result.deadPageEntries.length} 件`);

for (const href of result.missingFromSearch) {
  console.error(`  🚨 nav missing from PAGE_ENTRIES: ${href}`);
}
for (const href of result.deadPageEntries) {
  console.error(`  🚨 PAGE_ENTRIES dead route: ${href}`);
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

process.exit(
  result.missingFromSearch.length === 0 &&
    result.deadPageEntries.length === 0 &&
    !selfTestFailed
    ? 0
    : 1,
);
