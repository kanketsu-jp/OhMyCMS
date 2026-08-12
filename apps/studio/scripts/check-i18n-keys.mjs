#!/usr/bin/env node
/**
 * ja と en のキー集合が完全一致することを機械的に検証する。
 * 受入基準7 用。差分があれば終了コード1で落ちる。
 *
 * 辞書は名前空間ごとのファイル（i18n/messages/<locale>/<namespace>.json）。
 * ディスクの構成とランタイムのローダー（i18n/messages.ts）のズレも同時に検査する。
 *
 *   node scripts/check-i18n-keys.mjs
 */

import { assertLoaderInSync, flatten, loadDictionary, namespacesOnDisk } from "./i18n-load.mjs";

let failed = false;

// 1) ローダーとディスクの同期
const sync = assertLoaderInSync();
if (sync.ok) {
  console.log(`名前空間: ${sync.namespaces.length} 個（i18n/messages.ts とディスクが一致）`);
} else {
  console.error("■ ローダーとディスクがズレています");
  console.error(`  ${sync.reason}`);
  failed = true;
}

// 2) ja / en で名前空間のファイル構成が同じか
const jaNs = namespacesOnDisk("ja");
const enNs = namespacesOnDisk("en");
const nsOnlyJa = jaNs.filter((n) => !enNs.includes(n));
const nsOnlyEn = enNs.filter((n) => !jaNs.includes(n));
if (nsOnlyJa.length || nsOnlyEn.length) {
  console.error("■ ja と en で名前空間のファイル構成が違います");
  if (nsOnlyJa.length) console.error(`  en に無い: ${nsOnlyJa.join(", ")}`);
  if (nsOnlyEn.length) console.error(`  ja に無い: ${nsOnlyEn.join(", ")}`);
  failed = true;
}

// 3) キー集合の一致
const ja = flatten(loadDictionary("ja"));
const en = flatten(loadDictionary("en"));
const onlyInJa = [...ja].filter((k) => !en.has(k)).sort();
const onlyInEn = [...en].filter((k) => !ja.has(k)).sort();

console.log(`ja のキー数: ${ja.size}`);
console.log(`en のキー数: ${en.size}`);

if (onlyInJa.length === 0 && onlyInEn.length === 0) {
  console.log("差分: 0 件（キー集合は完全一致）");
} else {
  if (onlyInJa.length > 0) {
    console.error(`\n■ en に無いキー (${onlyInJa.length} 件):`);
    for (const key of onlyInJa) console.error(`  - ${key}`);
  }
  if (onlyInEn.length > 0) {
    console.error(`\n■ ja に無いキー (${onlyInEn.length} 件):`);
    for (const key of onlyInEn) console.error(`  - ${key}`);
  }
  failed = true;
}

process.exit(failed ? 1 : 0);
