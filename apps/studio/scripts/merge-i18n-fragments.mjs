#!/usr/bin/env node
/**
 * 各バッチが出力した辞書フラグメントを ja.json / en.json 本体へマージする。
 * 並列作業者が本体を同時編集して壊すのを避けるための仕組み（F1 の作業手順）。
 *
 * 衝突（同じキーを別バッチが別の値で定義）は**黙って上書きせず落とす**。
 *
 *   node scripts/merge-i18n-fragments.mjs           # マージ実行
 *   node scripts/merge-i18n-fragments.mjs --dry-run # 検査のみ
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = resolve(here, "../i18n/messages");
const fragmentsDir = resolve(messagesDir, "_fragments");
const dryRun = process.argv.includes("--dry-run");

const LOCALES = ["ja", "en"];

function flatten(value, prefix = "", out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, out);
    } else {
      out.set(path, child);
    }
  }
  return out;
}

function unflatten(entries) {
  const root = {};
  for (const [path, value] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    const parts = path.split(".");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part];
    }
    node[parts.at(-1)] = value;
  }
  return root;
}

const fragmentFiles = readdirSync(fragmentsDir).filter((f) => f.endsWith(".json"));
const conflicts = [];
const merged = {};

for (const locale of LOCALES) {
  // 本体を種として読み込む（common などの既存キー）。
  const base = flatten(JSON.parse(readFileSync(resolve(messagesDir, `${locale}.json`), "utf8")));
  const owner = new Map([...base.keys()].map((k) => [k, `${locale}.json（既存）`]));

  for (const file of fragmentFiles.filter((f) => f.endsWith(`.${locale}.json`))) {
    const fragment = flatten(JSON.parse(readFileSync(resolve(fragmentsDir, file), "utf8")));
    for (const [key, value] of fragment) {
      if (base.has(key) && base.get(key) !== value) {
        conflicts.push({
          locale,
          key,
          existing: base.get(key),
          existingFrom: owner.get(key),
          incoming: value,
          incomingFrom: file,
        });
        continue;
      }
      base.set(key, value);
      owner.set(key, file);
    }
  }
  merged[locale] = base;
}

console.log(`フラグメント: ${fragmentFiles.length} ファイル`);
for (const locale of LOCALES) {
  console.log(`  ${locale}: ${merged[locale].size} キー`);
}

if (conflicts.length > 0) {
  console.error(`\n■ キー衝突 ${conflicts.length} 件（同じキーに別の値。手で解決すること）`);
  for (const c of conflicts) {
    console.error(`  [${c.locale}] ${c.key}`);
    console.error(`      ${c.existingFrom}: ${JSON.stringify(c.existing)}`);
    console.error(`      ${c.incomingFrom}: ${JSON.stringify(c.incoming)}`);
  }
  process.exit(1);
}

// ja / en のキー集合が一致しているか（受入基準7 の先出し確認）
const jaKeys = new Set(merged.ja.keys());
const enKeys = new Set(merged.en.keys());
const onlyJa = [...jaKeys].filter((k) => !enKeys.has(k));
const onlyEn = [...enKeys].filter((k) => !jaKeys.has(k));
if (onlyJa.length || onlyEn.length) {
  console.error(`\n■ キー集合が不一致`);
  if (onlyJa.length) console.error(`  en に無い: ${onlyJa.join(", ")}`);
  if (onlyEn.length) console.error(`  ja に無い: ${onlyEn.join(", ")}`);
  process.exit(1);
}

if (dryRun) {
  console.log("\n--dry-run のため書き込みはしていない。衝突・キー欠けは無し。");
  process.exit(0);
}

for (const locale of LOCALES) {
  const out = `${JSON.stringify(unflatten(merged[locale]), null, 2)}\n`;
  writeFileSync(resolve(messagesDir, `${locale}.json`), out, "utf8");
}
console.log("\nマージ完了: ja.json / en.json を更新した。");
