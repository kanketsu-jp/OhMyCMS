/**
 * `/api/health` が返す鍵と、MCP の `HEALTH_OUTPUT` が宣言している鍵の一致を見る。
 *
 * 由来（2026-08-15・実害あり）: `/api/health` が `fd53fdd` で `version` を返すようになったのに
 * `packages/mcp/src/schemas.ts` を直さなかったため、**`ohmycms_health` が約1日壊れていた**
 * （`-32602 Structured content does not match the tool's output schema`）。
 * 出力スキーマは `additionalProperties: false` として効くので、**鍵が1つ増えるだけで**落ちる。
 *
 * 🚨 **この検査が見るのは health 1 本だけ。** 出力スキーマは全部で 14 本あり、
 *    残りは対応する API を静的に辿れない（ツール定義に叩き先の URL が書かれていない。
 *    実測: `grep -c "api/" packages/mcp/src/catalog.ts` → 1）。
 *    **「MCP のスキーマは検査されている」と読まないこと。** 全ツールを見るのは
 *    受入ハーネスの 10 番（`acceptance/checks/10-mcp-verify.mjs`）で、あちらは実プロトコルで 22 本叩く。
 *
 * 🚨 **読めない形が出たら、黙って通さずに落とす。**
 *    `Response.json(<変数>)` のように静的に鍵を取れない書き方になったら、
 *    「解析できなかった」と言って exit 1 にする。**「見ていない緑」を作らない。**
 */

import { readFileSync } from "node:fs";


import { join } from "node:path";

/**
 * 🚨 **「読めない」と「無い」を同じ文言にしない**（規律11）。
 *    対象のファイルが移動・改名されたら、この検査は**何も見ていない**状態になる。
 *    そのとき素の ENOENT で死ぬと、読んだ人には「検査が壊れた」としか分からず、
 *    **「いま health のスキーマは誰も見ていない」**という一番大事なことが伝わらない。
 */
function readOrExplain(path, why) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    console.error(`🚨 ${path} を読めませんでした（${why}）。`);
    console.error("   **この検査は現在ブラインドです**——鍵の不一致があっても検出できません。");
    console.error("   ファイルを移動・改名したなら、このスクリプトの定数も一緒に直してください。");
    console.error(`   （元のエラー: ${error?.code ?? error?.message ?? error}）`);
    process.exit(1);
  }
}

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const HEALTH_ROUTE = join(REPO_ROOT, "apps/studio/app/api/health/route.ts");
const VERSION_SERVICE = join(REPO_ROOT, "apps/studio/lib/version/service.ts");
const MCP_SCHEMAS = join(REPO_ROOT, "packages/mcp/src/schemas.ts");

/** `{ a: ..., b: ... }` の**最上位の鍵**だけを取る。入れ子は数えない。 */
function topLevelKeys(objectSource) {
  const keys = [];
  let depth = 0;
  let inString = null;
  for (let i = 0; i < objectSource.length; i += 1) {
    const c = objectSource[i];
    if (inString) {
      if (c === "\\") i += 1;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue; }
    if (c === "{" || c === "(" || c === "[") { depth += 1; continue; }
    if (c === "}" || c === ")" || c === "]") { depth -= 1; continue; }
    if (depth !== 1) continue;
    // 深さ1の `name:` を鍵とみなす
    const rest = objectSource.slice(i);
    const m = rest.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (m) { keys.push(m[1]); i += m[0].length - 1; }
  }
  return keys;
}

/** `開き括弧の位置` から対応する閉じ括弧までを返す。見つからなければ null。 */
function balanced(source, startIndex, open = "{", close = "}") {
  let depth = 0;
  for (let i = startIndex; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return null;
}

const problems = [];
const notes = [];

// ── 1) /api/health が返す鍵 ────────────────────────────────────────────
const routeSource = readOrExplain(HEALTH_ROUTE, "/api/health の実装");
const responses = [];
for (const m of routeSource.matchAll(/Response\.json\(\s*/g)) {
  const at = m.index + m[0].length;
  if (routeSource[at] !== "{") {
    problems.push(
      `解析できません: ${HEALTH_ROUTE} の Response.json( の直後が オブジェクトリテラルではありません` +
        `（変数や関数呼び出しに変わると、この検査は鍵を読めません）`,
    );
    continue;
  }
  const body = balanced(routeSource, at);
  if (!body) { problems.push("解析できません: Response.json( の括弧が閉じていません"); continue; }
  responses.push(body);
}
if (responses.length === 0) {
  problems.push(`解析できません: ${HEALTH_ROUTE} に Response.json({...}) が 1 つもありません`);
}
const healthKeys = new Set(responses.flatMap((body) => topLevelKeys(body)));

// version は getBuildVersion() の戻り値。中の鍵も辿る。
let versionKeys = new Set();
if (responses.some((body) => /version\s*:\s*getBuildVersion\(\)/.test(body))) {
  const service = readOrExplain(VERSION_SERVICE, "getBuildVersion の実装");
  const fn = service.indexOf("export function getBuildVersion(");
  const ret = fn >= 0 ? service.indexOf("return {", fn) : -1;
  const body = ret >= 0 ? balanced(service, service.indexOf("{", ret)) : null;
  if (!body) {
    problems.push("解析できません: getBuildVersion() の return { … } を読めませんでした");
  } else {
    versionKeys = new Set(topLevelKeys(body));
  }
} else if (healthKeys.has("version")) {
  notes.push("version の中身は getBuildVersion() 由来ではないので、中の鍵は見ていません");
}

// ── 2) HEALTH_OUTPUT が宣言している鍵 ─────────────────────────────────
const schemaSource = readOrExplain(MCP_SCHEMAS, "MCP の出力スキーマ");
const declAt = schemaSource.indexOf("export const HEALTH_OUTPUT = {");
if (declAt < 0) problems.push(`解析できません: ${MCP_SCHEMAS} に HEALTH_OUTPUT がありません`);
const declBody = declAt >= 0 ? balanced(schemaSource, schemaSource.indexOf("{", declAt)) : null;
if (declAt >= 0 && !declBody) problems.push("解析できません: HEALTH_OUTPUT の括弧が閉じていません");
const schemaKeys = new Set(declBody ? topLevelKeys(declBody) : []);

// version: z.object({ … }) の中
let schemaVersionKeys = new Set();
if (declBody) {
  const vAt = declBody.indexOf("version: z");
  // 🚨 `z.object(` を1つの文字列として探さない。実際のソースは
  //    `version: z\n    .object({` と改行で割れている（これで一度読めずに落ちた）。
  const objAt = vAt >= 0 ? declBody.indexOf(".object(", vAt) : -1;
  const inner = objAt >= 0 ? balanced(declBody, declBody.indexOf("{", objAt)) : null;
  if (vAt >= 0 && !inner) problems.push("解析できません: HEALTH_OUTPUT.version の z.object({…}) を読めませんでした");
  if (inner) schemaVersionKeys = new Set(topLevelKeys(inner));
}

// ── 3) 突き合わせ ─────────────────────────────────────────────────────
const missing = [...healthKeys].filter((k) => !schemaKeys.has(k));
const missingVersion = [...versionKeys].filter((k) => !schemaVersionKeys.has(k));

// ── 4) 自己検査（囮）。**緑が「見た結果」であることを毎回証明する** ──────
//    在るはずの鍵をわざと外して、検出できることをその場で確かめる。
const decoyKeys = new Set([...schemaKeys].filter((k) => k !== "status"));
const decoyDetected = [...healthKeys].filter((k) => !decoyKeys.has(k)).includes("status");

console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
console.log(`  ${decoyDetected ? "✅" : "🚨"} 囮: HEALTH_OUTPUT から status を外す → ${decoyDetected ? "検出 1 件" : "検出できず"}`);
console.log("");
console.log("■ 判定（🚨 見ているのは health 1 本だけ。出力スキーマは全部で 14 本ある）");
console.log(`  /api/health が返す鍵: ${[...healthKeys].join(", ") || "(なし)"}`);
console.log(`  HEALTH_OUTPUT の鍵  : ${[...schemaKeys].join(", ") || "(なし)"}`);
console.log(`  version の中（API）  : ${[...versionKeys].join(", ") || (problems.length > 0 ? "(🚨 読めませんでした。無いという意味ではありません)" : "(なし)")}`);
console.log(`  version の中（宣言） : ${[...schemaVersionKeys].join(", ") || (problems.length > 0 ? "(🚨 読めませんでした。無いという意味ではありません)" : "(なし)")}`);
for (const note of notes) console.log(`  ⚠ ${note}`);

if (!decoyDetected) {
  console.error("\n🚨 自己検査に失敗しました。**この検査の結果は信用できません**（緑でも意味を持ちません）。");
  process.exit(1);
}
if (problems.length > 0) {
  console.error("\n🚨 " + problems.length + " 件、解析できませんでした（「違反なし」ではありません）:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
if (missing.length > 0 || missingVersion.length > 0) {
  console.error("\n🚨 /api/health が返すのに HEALTH_OUTPUT に無い鍵があります。");
  console.error("   このまま出すと ohmycms_health が -32602 で丸ごと失敗します。");
  for (const k of missing) console.error(`  - ${k}（packages/mcp/src/schemas.ts の HEALTH_OUTPUT へ足す）`);
  for (const k of missingVersion) console.error(`  - version.${k}（HEALTH_OUTPUT.version の z.object へ足す）`);
  process.exit(1);
}
console.log("\n問題なし（health の鍵は宣言に含まれています）。");
