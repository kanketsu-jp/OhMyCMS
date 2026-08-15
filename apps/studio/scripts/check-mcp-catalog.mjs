#!/usr/bin/env node
/**
 * MCP のツール目録が、Studio 側の写しとずれていないかを検査する。
 *
 * ■ なぜ写しを置くのか（依存を足さなかった理由）
 *   正は `packages/mcp/src/catalog.ts` ただ1つ。Studio はそれを **import できない**:
 *     - `apps/studio` は `@ohmycms/mcp` に依存していない（実測 2026-08-15・依存46本に無し）
 *     - `packages/mcp` は `exports` / `main` / `types` を**1つも定義していない**（同）
 *     - `catalog.ts` は `schemas.ts` 経由で **zod** を引く。Studio に zod は**無い**
 *   入れるには「依存追加 + exports 定義 + bun.lock 更新」が要り、**bun.lock は9ペインが
 *   共有するツリーの中**にある。表示用の文字列のためにそこを動かすのは割に合わない。
 *   → **生成された写しを置き、ずれたら落ちる検査を付ける**（この家の `check-i18n-keys.mjs` と同じ形）。
 *
 * 🚨 **写しを手で直さないこと。** `--write` で作り直す。
 *
 * ■ 使い方
 *   node scripts/check-mcp-catalog.mjs          検査（ずれていたら exit 1）
 *   node scripts/check-mcp-catalog.mjs --write   写しを作り直す
 *
 * 🚨 抽出は**行またぎの文字列連結に対応**していること。
 *    `grep -oE 'description: "[^"]*"'` のような素朴な形は **22 本中 7 本しか拾えず**、
 *    それでも「完全一致」と出る（2026-08-15 実測。私自身がこの穴に落ちた）。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..", "..", "..", "packages", "mcp", "src", "catalog.ts");
// 🚨 **独立した数え先**。目録と同じ書き方の思い込みを共有しないため、
//    「実際に登録されているツール名」は server.ts から採る（下の理由を読むこと）。
const SERVER = join(HERE, "..", "..", "..", "packages", "mcp", "src", "server.ts");
const COPY = join(HERE, "..", "lib", "mcp", "tool-catalog.json");
const WRITE = process.argv.includes("--write");

/** JS の文字列リテラル（行またぎ・`+` 連結を含む）を1本に畳む。 */
function joinedString(raw) {
  const parts = [...raw.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  return parts.join("").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function parseCatalog(source) {
  const tools = [];
  // 目録の1件は `ohmycms_xxx: { … },` の形。
  // 🚨 **字下げの幅を決め打ちしない。** 2026-08-15 に実測したところ、
  //    4 スペースで書くだけで抽出から漏れ、**同じ思い込みで数えていた守りも一緒に漏れて**
  //    「22 本一致」と緑になった（＝検査を迂回できた）。
  const re = /^[ \t]+(ohmycms_[a-z_]+):\s*\{([\s\S]*?)^[ \t]+\},/gm;
  for (const m of source.matchAll(re)) {
    const [, name, body] = m;
    const title = body.match(/\btitle:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/);
    const description = body.match(/\bdescription:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/);
    tools.push({
      name,
      title: title ? joinedString(title[1]) : null,
      description: description ? joinedString(description[1]) : null,
      // 読み取り専用かどうかだけを写す。破壊的かどうかは registerTool の注記に従う。
      readOnly: /readOnlyHint:\s*true/.test(body),
    });
  }
  return tools;
}

const source = readFileSync(SOURCE, "utf8");
const tools = parseCatalog(source);

// 🚨 「0 件」は情報を持たない。**拾えていないのか、無いのか**をここで割る。
const declared = (source.match(/^[ \t]+ohmycms_[a-z_]+:/gm) ?? []).length;
if (tools.length === 0 || tools.length !== declared) {
  console.error(
    `🚨 目録を読み取れていません（宣言 ${declared} 件 / 抽出 ${tools.length} 件）。\n` +
      `   ${SOURCE} の書き方が変わった可能性があります。抽出の正規表現を直してください。`,
  );
  process.exit(1);
}
const missing = tools.filter((t) => !t.title || !t.description);
if (missing.length > 0) {
  console.error(`🚨 title か description を取れなかったツール: ${missing.map((t) => t.name).join(", ")}`);
  process.exit(1);
}

// 🚨 **目録を通さずに登録する迂回**を塞ぐ。2026-08-15 実測: server.ts に直接
//    `registerTool("ohmycms_zz", {…inline…})` と書くと、目録も写しも 22 本のままで
//    **検査は緑**だった（＝画面には永久に出ないツールが増える）。
//    server.ts は**別のファイル・別の書き方**なので、目録側の思い込みを共有しない。
const registered = [...readFileSync(SERVER, "utf8").matchAll(/registerTool\(\s*"(ohmycms_[a-z_]+)"/g)]
  .map((m) => m[1]);
if (registered.length === 0) {
  console.error(`🚨 server.ts から登録を1件も読み取れていません（${SERVER}）。書き方が変わった可能性があります。`);
  process.exit(1);
}
const catalogNames = new Set(tools.map((t) => t.name));
const onlyServer = registered.filter((n) => !catalogNames.has(n));
const onlyCatalog = tools.map((t) => t.name).filter((n) => !registered.includes(n));
if (onlyServer.length > 0 || onlyCatalog.length > 0) {
  console.error("🚨 目録と、実際に登録されているツールがずれています。");
  for (const n of onlyServer) console.error(`  + ${n}（server.ts で登録しているが目録に無い＝画面には出ません）`);
  for (const n of onlyCatalog) console.error(`  - ${n}（目録にあるが登録されていない＝使えません）`);
  process.exit(1);
}

const rendered = JSON.stringify(tools, null, 2) + "\n";

if (WRITE) {
  writeFileSync(COPY, rendered);
  console.log(`✅ 写しを作り直しました: ${tools.length} 本 → ${COPY}`);
  process.exit(0);
}

if (!existsSync(COPY)) {
  console.error(`🚨 写しがありません: ${COPY}\n   node scripts/check-mcp-catalog.mjs --write で作ってください`);
  process.exit(1);
}

const current = readFileSync(COPY, "utf8");
if (current === rendered) {
  console.log(`ツール ${tools.length} 本 — 正（packages/mcp/src/catalog.ts）と写しが一致`);
  process.exit(0);
}

console.error("🚨 MCP のツール目録が、Studio 側の写しとずれています。");
const currentTools = JSON.parse(current);
const byName = new Map(currentTools.map((t) => [t.name, t]));
for (const t of tools) {
  const c = byName.get(t.name);
  if (!c) {
    console.error(`  + ${t.name}（正にあるが写しに無い）`);
    continue;
  }
  for (const key of ["title", "description", "readOnly"]) {
    if (String(c[key]) !== String(t[key])) {
      console.error(`  ~ ${t.name}.${key}\n      正   : ${t[key]}\n      写し : ${c[key]}`);
    }
  }
  byName.delete(t.name);
}
for (const name of byName.keys()) console.error(`  - ${name}（写しにあるが正に無い）`);
console.error("\n  直すには: node scripts/check-mcp-catalog.mjs --write");
process.exit(1);
