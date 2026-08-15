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

/**
 * 目録と登録のずれを返す。**ファイルを読まない**ので、囮の文字列をそのまま渡せる。
 * 🚨 判定を関数にしてあるのは、**毎回その場で「検出できること」を確かめる**ため
 *    （この家の check-shortcuts / check-user-label-leak と同じ作法。10/23 本が採用している）。
 */
function findViolations(sourceText, serverText) {
  const found = parseCatalog(sourceText);
  const declaredCount = (sourceText.match(/^[ \t]+ohmycms_[a-z_]+:/gm) ?? []).length;
  const out = [];
  if (found.length === 0 || found.length !== declaredCount) {
    out.push({ rule: "抽出できていない", detail: `宣言 ${declaredCount} 件 / 抽出 ${found.length} 件` });
    return { tools: found, violations: out };
  }
  for (const t of found.filter((x) => !x.title || !x.description)) {
    out.push({ rule: "文言を取れない", detail: t.name });
  }
  const names = [...serverText.matchAll(/registerTool\(\s*"(ohmycms_[a-z_]+)"/g)].map((m) => m[1]);
  if (names.length === 0) {
    out.push({ rule: "登録を読めない", detail: "server.ts から 0 件" });
    return { tools: found, violations: out };
  }
  const inCatalog = new Set(found.map((t) => t.name));
  for (const n of names.filter((n) => !inCatalog.has(n))) {
    out.push({ rule: "登録が目録に無い", detail: `${n}（画面には出ません）` });
  }
  for (const n of found.map((t) => t.name).filter((n) => !names.includes(n))) {
    out.push({ rule: "目録が登録に無い", detail: `${n}（使えません）` });
  }
  return { tools: found, violations: out };
}

const source = readFileSync(SOURCE, "utf8");
const serverText = readFileSync(SERVER, "utf8");

// 🚨 自己検査: 囮を仕込んで、**この実行で**検出できることを確かめる。
//    「違反 0 件」が「異常が無い」なのか「見ていない」なのかを、毎回その場で割るため。
if (!WRITE) {
  const probes = [
    ["囮1: 登録だけ足す（目録を通さない）", source,
      serverText + '\n  server.registerTool(\n    "ohmycms_zz_probe",\n', "登録が目録に無い"],
    ["囮2: 目録の字下げを変えて足す", source.replace(/\n\} as const/, '\n    ohmycms_zz_indent: {\n      title: "x",\n      description: "y",\n      annotations: { readOnlyHint: true },\n    },\n} as const'),
      serverText, "目録が登録に無い"],
    // 🚨 字下げを前提にしない。2026-08-15、`^ {2}ohmycms_` で書いていたら、
    //    **4 スペースで足された項目だけ生き残って囮が成立しなくなった**
    //    （＝本体で直したのと同じ思い込みを、囮の側に残していた）。
    ["囮3: 目録を丸ごと読めなくする", source.replaceAll("ohmycms_", "zzz_"), serverText, "抽出できていない"],
  ];
  let alive = 0;
  console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
  for (const [name, src, srv, wantRule] of probes) {
    const hit = findViolations(src, srv).violations.some((v) => v.rule === wantRule);
    console.log(`  ${hit ? "✅" : "🚨"} ${name}  → ${hit ? `検出（${wantRule}）` : "**検出できない**"}`);
    if (hit) alive++;
  }
  if (alive !== probes.length) {
    console.error(`🚨 自己検査に失敗しました（${alive}/${probes.length}）。この検査は信用できません。`);
    process.exit(1);
  }
}

const { tools, violations } = findViolations(source, serverText);
if (violations.length > 0) {
  console.error("\n🚨 MCP のツール目録に問題があります。");
  // 🚨 **何で赤くなったかを出す**。「赤い」と「狙ったものを捕まえた」は別なので、
  //    rule を書かないと、別の理由で落ちたのを検出だと読んでしまう。
  for (const v of violations) console.error(`  [${v.rule}] ${v.detail}`);
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
