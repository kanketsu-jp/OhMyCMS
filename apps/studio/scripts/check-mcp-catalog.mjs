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
 * ## 🚨 この検査が見ていない形（**見逃す入力を自分で作って通した**・2026-08-16）
 * ```
 * ❌ 名前を変数で組み立てて登録する   server.registerTool(n, {})
 *    → 🚨 **見逃します**（実測）。落とすには構文解析が要る
 * ❌ 文字列リテラルの中の registerTool("ohmycms_…")（同上）
 * ```
 * 塞いだ形（**どれも見逃していたものを、作って確かめてから塞いだ**）:
 *   単一引用符で登録 / `src` の下の階層に置く / 目録の鍵を引用符で書く /
 *   目録の文言をテンプレートリテラルで書く
 * 🟢 対照(+) 素直な登録は拾う（＝検出器が動いていることを毎回確認）
 * 🚨 実演の道具: `scratchpad/miss-probe.mjs`（共有ツリーは 1 バイトも触りません）
 *
 * 🚨 抽出は**行またぎの文字列連結に対応**していること。
 *    `grep -oE 'description: "[^"]*"'` のような素朴な形は **22 本中 7 本しか拾えず**、
 *    それでも「完全一致」と出る（2026-08-15 実測。私自身がこの穴に落ちた）。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_SRC = join(HERE, "..", "..", "..", "packages", "mcp", "src");
const SOURCE = join(MCP_SRC, "catalog.ts");
// 🚨 **独立した数え先**。目録と同じ書き方の思い込みを共有しないため、
//    「実際に登録されているツール名」は登録側から採る（下の理由を読むこと）。
//
// 🚨 **1 ファイルに決め打ちしない。** 以前は `server.ts` だけを読んでいた。
//    今日 22 件すべてがそこに在ったので**壊れてはいなかった**が、
//    **別のファイルに 1 つ足されたら、丸ごと見えないまま緑**になる
//    （＝「入口が1つ抜けている」形。2026-08-15、二重送信の検査から HTTP の PUT が
//    丸ごと抜けていた件と同じ）。**src の .ts を全部読む。**
// 🚨 **再帰する。** `readdirSync` は下の階層を見ないので、
//    `src/sub/extra.ts` に登録を書かれると**丸ごと見えないまま緑**になる
//    （2026-08-16、見逃す入力を自分で作って確認）。
function collectTs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTs(p));
    else if (entry.name.endsWith(".ts") && p !== SOURCE) out.push(p);
  }
  return out;
}
const SERVER_FILES = collectTs(MCP_SRC);
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
  const re = /^[ \t]+["']?(ohmycms_[a-z_]+)["']?:\s*\{([\s\S]*?)^[ \t]+\},/gm;
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
 * コメントを落とす。**登録を数える前に必ず通す。**
 *
 * 🚨 通さないと、**コメントに書いた使用例を実際の登録として数える**（2026-08-16 実測。
 *    `// server.registerTool("ohmycms_zz")` / JSDoc の例 / 文字列リテラル、**3 通りとも拾った**）。
 *    ＝ 正しく書いてあるものを「登録が目録に無い」と言う**過検出**になる。
 *    今日この形で 3 人が別々に落ちている（規約の説明文を実装として計上・JSDoc の使用例を
 *    使用として計上・弱い語での棚卸し）。
 *
 * 🚨 **URL を壊さない。** 行コメントは「空白の直後の `//`」だけを落とす
 *    （`https://…` は `:` の直後なので当たらない）。
 *
 * 🚨 **塞げていないもの（宣言）**: **文字列リテラルの中**の `registerTool("ohmycms_…")`。
 *    落とすには構文解析が要る。**「たぶん書かない」であって、構造上の保証ではない。**
 *    囮5 でこの経路を明示的に測っており、**拾ってしまうことを承知で残している。**
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")   // ブロック（JSDoc を含む）
    .replace(/(^|\s)\/\/[^\n]*/g, "$1"); // 行コメント（URL の // は前が `:` なので当たらない）
}

/**
 * 目録と登録のずれを返す。**ファイルを読まない**ので、囮の文字列をそのまま渡せる。
 * 🚨 判定を関数にしてあるのは、**毎回その場で「検出できること」を確かめる**ため
 *    （この家の check-shortcuts / check-user-label-leak と同じ作法。10/23 本が採用している）。
 */
function findViolations(sourceText, serverText) {
  const found = parseCatalog(sourceText);
  const declaredCount = (sourceText.match(/^[ \t]+["']?ohmycms_[a-z_]+["']?:/gm) ?? []).length;
  const out = [];
  if (found.length === 0 || found.length !== declaredCount) {
    out.push({ rule: "抽出できていない", detail: `宣言 ${declaredCount} 件 / 抽出 ${found.length} 件` });
    return { tools: found, violations: out };
  }
  for (const t of found.filter((x) => !x.title || !x.description)) {
    out.push({ rule: "文言を取れない", detail: t.name });
  }
  const names = [...stripComments(serverText).matchAll(/registerTool\(\s*["'](ohmycms_[a-z_]+)["']/g)].map((m) => m[1]);
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

/**
 * 🚨 読めなかったときに、**自分の言葉で**落とす。
 *    素の `readFileSync` は例外の生スタックを出すだけで、読んだ人には
 *    **「検査が壊れた」のか「対象が無い」のか分からない**（2026-08-15 実測）。
 *    どちらも exit は非 0 なので、**終了コードでは区別できない**。
 */
function readOrStop(path, what) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    console.error(`🚨 ${what}を読めませんでした: ${path}`);
    console.error(`   ${error.code === "ENOENT" ? "ファイルがありません（移動・改名された可能性）" : String(error.message)}`);
    console.error("   → **この検査は「違反なし」ではなく「測れていません」です。**");
    process.exit(1);
  }
}

const source = readOrStop(SOURCE, "MCP の目録");

// 🚨 **どのファイルを読んだかを出す。** 「登録 0 件」が「登録が無い」なのか
//    「読む先を間違えた」なのかを、読んだ人が割れるようにするため。
if (SERVER_FILES.length === 0) {
  console.error(`🚨 ${MCP_SRC} に .ts がありません。**測れていません**`);
  process.exit(1);
}
const serverText = SERVER_FILES.map((f) => readOrStop(f, `MCP の登録（${f.split("/").pop()}）`)).join("\n");

// 🚨 自己検査: 囮を仕込んで、**この実行で**検出できることを確かめる。
//    「違反 0 件」が「異常が無い」なのか「見ていない」なのかを、毎回その場で割るため。
//
// 🚨 `--write` はこの自己検査を**飛ばす**。飛ばすこと自体は正しい（写しを作り直すだけで
//    「検査した」わけではないので）が、**飛ばしたことが出力に出ていなかった**（2026-08-15 実測）。
//    ログだけを見た人には、緑で終わった実行が「検査を通った」ように読める。
//    → **例外を消すのではなく、例外が見える形にする**（司令塔 2026-08-15）。
if (WRITE) {
  console.log("⚠️  --write のため、自己検査（囮3本）と写しとの照合を**飛ばしました**。");
  console.log("    この実行は**何も検証していません**。検査は node scripts/check-mcp-catalog.mjs（引数なし）です。");
}
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
    // 🚨 **ここから下は「検出されてはいけない」側。**
    //    2026-08-16 まで、囮は 3 本とも「検出されること」だけだった。
    //    **逆方向が無いと、過検出は永久に捕まらない**（司令塔 2026-08-16）。
    //    実際、この 2 つは**塞ぐ前は拾っていた**（＝正しく書いてあるものを違反と言っていた）。
    // 🚨 期待は「**この名前が出ないこと**」であって「違反 0 件」ではない。
    //    0 件を要求すると、**本物の違反が 1 つ在るだけで囮のほうが落ち**、
    //    「自己検査に失敗」が本当の違反を覆い隠す（2026-08-16 実測）。
    //    ＝ 赤くなったことと、狙ったものを捕まえたことは別。
    ["囮4: コメントに書いた使用例（拾ってはいけない）", source,
      serverText + '\n// server.registerTool("ohmycms_zz_incomment", …) と書く\n', "ohmycms_zz_incomment"],
    ["囮5: JSDoc の使用例（拾ってはいけない）", source,
      serverText + '\n/**\n * 例: server.registerTool("ohmycms_zz_injsdoc", {})\n */\n', "ohmycms_zz_injsdoc"],
  ];
  let alive = 0;
  console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
  for (const [name, src, srv, wantRule] of probes) {
    // `ohmycms_` で始まる wantRule は「**その名前が出ないこと**」が期待（過検出の囮）。
    if (wantRule.startsWith("ohmycms_")) {
      const violations = findViolations(src, srv).violations;
      const leaked = violations.filter((v) => v.detail.includes(wantRule));
      const quiet = leaked.length === 0;
      console.log(`  ${quiet ? "✅" : "🚨"} ${name}  → ${quiet ? "拾わない（過検出なし）" : `**拾ってしまう**: ${leaked.map((v) => v.detail).join(" / ")}`}`);
      if (quiet) alive++;
      continue;
    }
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

const current = readOrStop(COPY, "Studio 側の写し");
if (current === rendered) {
  console.log(`ツール ${tools.length} 本 — 正（packages/mcp/src/catalog.ts）と写しが一致`);
  // 🚨 **数だけを出さない。拾った実物を 2 本添える。**（司令塔 2026-08-16）
  //    「22 本一致」は、**中身が空でも成立します**。実際、素朴な抽出は 22 本中 7 本しか
  //    文言を拾えていないのに「完全一致」と出しました（2026-08-15・このファイルの冒頭に記録）。
  //    読んだ人が「抽出が正気か」をその場で確かめられるように、生の値を出す。
  //    規律は覚えている間しか効かないが、出力なら覚えていなくても効く。
  const withText = tools.filter((t) => t.title && t.description).length;
  console.log(`  文言まで拾えたもの: ${withText} / ${tools.length}` +
    (withText === tools.length ? "" : "  🚨 **拾えていないものがあります**"));
  for (const t of tools.slice(0, 2)) {
    console.log(`  例 ${t.name}`);
    console.log(`     title: ${JSON.stringify(String(t.title).slice(0, 60))}`);
    console.log(`     desc : ${JSON.stringify(String(t.description).slice(0, 60))}`);
  }
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
