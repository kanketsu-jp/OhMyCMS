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

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { stripComments } from "./strip-comments.mjs";


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

// 🚨 **採取した HEAD と作業ツリーの状態を出す**（司令塔 2026-08-15）。
//    共有ツリーでは HEAD も件数も数分で動く（実測: 同じ夜に 9df2aca → cb3a5ba）。
//    出力だけを渡された人が「いつのツリーの話か」を知る手段を持てるようにする。
// 🚨 見ていない範囲: 数えるのは **この 3 ファイルの未コミット変更だけ**。
//    ツリー全体が綺麗かどうかは言っていない。
{
  const rel = ["apps/studio/app/api/health/route.ts", "apps/studio/lib/version/service.ts", "packages/mcp/src/schemas.ts"];
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", ...rel],
    { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter(Boolean).length;
  console.log(`採取: HEAD ${head} / この検査が見る 3 ファイルの未コミット変更 ${dirty} 件`);
  console.log(`  見る範囲: ${rel.join(" / ")}`);
}

/** `{ a: ..., b: ... }` の**最上位の鍵**だけを取る。入れ子は数えない。 */
/** 深さ1に spread があったか。**読めないものを 0 件として通さないため**に持ち帰る。 */
export const spreadSeen = { any: false };

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
    // 🚨 **spread は静的に中身を読めない。** `...{ version: …, zzLeak: … }` と書くだけで
    //    この検査を迂回できた（2026-08-15 実測: exit 0 のまま通っていた）。
    if (c === "." && objectSource.slice(i, i + 3) === "...") { spreadSeen.any = true; i += 2; continue; }
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
// 🚨 **囮と本番で同じ経路を通す。** 最初は囮の側だけコメントを潰していて、
//    **囮が production と違う道を試している**状態だった（＝対照が別のものを比べていた）。
/**
 * `Response.json({…})` の本体を、そのソースから全部取り出す。
 * 🚨 **囮も本番もこの関数を通す。** 囮の中に同じ処理を**書き写すと、
 *    本番を壊しても囮は ✅ のまま**になる（司令塔 2026-08-15）。
 *    実際、最初の版では逆方向の囮だけが解析を書き写していた。
 */
function readResponseBodies(source, label, sink) {
  const out = [];
  for (const m of source.matchAll(/Response\.json\(\s*/g)) {
    const at = m.index + m[0].length;
    if (source[at] !== "{") {
      sink?.push(
        `解析できません: ${label} の Response.json( の直後が オブジェクトリテラルではありません` +
          `（変数や関数呼び出しに変わると、この検査は鍵を読めません）`,
      );
      continue;
    }
    const body = balanced(source, at);
    if (!body) { sink?.push("解析できません: Response.json( の括弧が閉じていません"); continue; }
    out.push(body);
  }
  return out;
}

const routeSource = stripComments(readOrExplain(HEALTH_ROUTE, "/api/health の実装"));
const responses = readResponseBodies(routeSource, HEALTH_ROUTE, problems);
if (responses.length === 0) {
  problems.push(`解析できません: ${HEALTH_ROUTE} に Response.json({...}) が 1 つもありません`);
}
const healthKeys = new Set(responses.flatMap((body) => topLevelKeys(body)));
if (spreadSeen.any) {
  problems.push(
    "解析できません: Response.json({…}) に spread（...）があります。" +
      "中身を静的に読めないので、鍵が増えていても検出できません（べた書きにしてください）",
  );
}

// version は getBuildVersion() の戻り値。中の鍵も辿る。
let versionKeys = new Set();
if (responses.some((body) => /version\s*:\s*getBuildVersion\(\)/.test(body))) {
  const service = stripComments(readOrExplain(VERSION_SERVICE, "getBuildVersion の実装"));
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
const schemaSource = stripComments(readOrExplain(MCP_SCHEMAS, "MCP の出力スキーマ"));
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

// 🚨 **逆方向の囮**（司令塔 2026-08-15）。
//    「検出されること」だけを並べると、**過検出は永久に捕まりません**。
//    ここでは **コメントの中に書いた Response.json** を仕込み、
//    **鍵として拾わないこと**を確かめる（拾ったら、コメントを実装として数えている）。
//    🚨 **本番と同じ `readResponseBodies` / `topLevelKeys` を呼ぶ**（書き写さない）。
const rawRoute = readOrExplain(HEALTH_ROUTE, "/api/health の実装");
const negativeSource = `/* 使用例:\n *   return Response.json({ zzCommentOnlyDecoy: 1 });\n */\n${rawRoute}`;
const negativeKeys = new Set(
  readResponseBodies(stripComments(negativeSource), "囮", null).flatMap((b) => topLevelKeys(b)),
);
// 🟢 潰さなければ拾うこと（囮が空振りでない証拠）も、同じ関数で確かめる。
const negativeRawKeys = new Set(
  readResponseBodies(negativeSource, "囮(生)", null).flatMap((b) => topLevelKeys(b)),
);
const negativeClean = !negativeKeys.has("zzCommentOnlyDecoy");
// 🟢 対照(+): 同じ経路で、**実コードの鍵はちゃんと拾えている**こと。
//    これが無いと「何も拾えていないから囮も拾わない」を成功と読んでしまう。
const negativeStillSees = negativeKeys.size > 0 && negativeRawKeys.has("zzCommentOnlyDecoy");

console.log("■ 自己検査（囮を仕込んで、検出できる／できないことをその場で確かめる）");
console.log(`  ${decoyDetected ? "✅" : "🚨"} 囮(+): HEALTH_OUTPUT から status を外す → ${decoyDetected ? "検出 1 件" : "検出できず"}`);
console.log(`  ${negativeClean && negativeStillSees ? "✅" : "🚨"} 囮(-): **コメントの中**の Response.json({ zzCommentOnlyDecoy }) → ` +
  `${negativeClean ? "拾わない" : "🚨 拾ってしまう"}` +
  `（実コードの鍵は ${negativeKeys.size} 件見えている／🟢 潰さなければ ${negativeRawKeys.has("zzCommentOnlyDecoy") ? "拾う＝空振りではない" : "🚨 拾わない＝囮が効いていない"}）`);
console.log("");
console.log("■ 判定（🚨 見ているのは health 1 本だけ。出力スキーマは全部で 14 本ある）");
console.log(`  /api/health が返す鍵: ${[...healthKeys].join(", ") || "(なし)"}`);
console.log(`  HEALTH_OUTPUT の鍵  : ${[...schemaKeys].join(", ") || "(なし)"}`);
console.log(`  version の中（API）  : ${[...versionKeys].join(", ") || (problems.length > 0 ? "(🚨 読めませんでした。無いという意味ではありません)" : "(なし)")}`);
console.log(`  version の中（宣言） : ${[...schemaVersionKeys].join(", ") || (problems.length > 0 ? "(🚨 読めませんでした。無いという意味ではありません)" : "(なし)")}`);
for (const note of notes) console.log(`  ⚠ ${note}`);

if (!negativeClean || !negativeStillSees) {
  console.error("\n🚨 逆方向の自己検査に失敗しました（コメントを実装として数えている、または何も拾えていない）。");
  process.exit(1);
}
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
