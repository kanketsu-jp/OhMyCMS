#!/usr/bin/env node
/**
 * ja.json と en.json のキー集合が完全一致することを機械的に検証する。
 * 受入基準7 用。差分があれば終了コード1で落ちる。
 *
 *   node scripts/check-i18n-keys.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = resolve(here, "../i18n/messages");

/** 入れ子 JSON を "a.b.c" のフラットなキー集合にする。 */
function flatten(value, prefix = "", out = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

function load(locale) {
  const file = resolve(messagesDir, `${locale}.json`);
  return flatten(JSON.parse(readFileSync(file, "utf8")));
}

const ja = load("ja");
const en = load("en");

const onlyInJa = [...ja].filter((k) => !en.has(k)).sort();
const onlyInEn = [...en].filter((k) => !ja.has(k)).sort();

console.log(`ja.json のキー数: ${ja.size}`);
console.log(`en.json のキー数: ${en.size}`);

if (onlyInJa.length === 0 && onlyInEn.length === 0) {
  console.log("差分: 0 件（キー集合は完全一致）");
  process.exit(0);
}

if (onlyInJa.length > 0) {
  console.error(`\nen.json に無いキー (${onlyInJa.length} 件):`);
  for (const key of onlyInJa) console.error(`  - ${key}`);
}
if (onlyInEn.length > 0) {
  console.error(`\nja.json に無いキー (${onlyInEn.length} 件):`);
  for (const key of onlyInEn) console.error(`  - ${key}`);
}
process.exit(1);
