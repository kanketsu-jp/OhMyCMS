/**
 * MCP サーバを**本物の MCP クライアント（stdio）で**叩いて確かめる（F5 の受入基準 1〜4・6）。
 *
 *   bun --filter @ohmycms/sdk build && bun --filter @ohmycms/mcp build
 *   OHMYCMS_URL=http://localhost:3999 node scripts/verify.mjs
 *
 * 肯定形（できること）と否定形（できないこと）を必ずセットで出す。
 * サーバ側で ALLOW_DEV_LOGIN=true が要る（トークンを発行するため）。
 * トークンは一切表示しない。最後に「応答に混ざっていないか」も検査する。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ALL_ADMIN_CAPABILITIES, createClient } from "@ohmycms/sdk";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const baseUrl = process.env.OHMYCMS_URL ?? "http://localhost:3102";
const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, "..", "dist", "index.js");

const stamp = Date.now();
const allowed = `mcp_allowed_${stamp}`;
const forbidden = `mcp_forbidden_${stamp}`;

let failures = 0;
/** ツールの応答をすべて貯めて、最後にトークンが混ざっていないか調べる */
const transcript = [];

function pass(label, detail) {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label, detail) {
  failures += 1;
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function call(client, tool, args = {}) {
  const result = await client.callTool({ name: tool, arguments: args });
  transcript.push(JSON.stringify(result));
  return result;
}

/** 成功を期待する */
async function expectOk(client, label, tool, args = {}) {
  const result = await call(client, tool, args);
  if (result.isError) {
    fail(label, `失敗した: ${result.structuredContent?.error?.code} ${result.structuredContent?.error?.message}`);
    return null;
  }
  pass(label);
  return result.structuredContent;
}

/** 拒否を期待する。status と code を実測して照合する */
async function expectDenied(client, label, tool, args, expectedStatus) {
  const result = await call(client, tool, args);
  const error = result.structuredContent?.error;
  if (!result.isError || !error) {
    fail(label, "拒否されなかった（通ってしまった）");
    return;
  }
  if (expectedStatus !== undefined && error.status !== expectedStatus) {
    fail(label, `status=${error.status}（${expectedStatus} を期待） code=${error.code}`);
    return;
  }
  pass(label, `status=${error.status} code=${error.code} message=「${error.message}」`);
}

async function connect(token) {
  const client = new Client({ name: "verify", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: { ...process.env, OHMYCMS_URL: baseUrl, OHMYCMS_TOKEN: token },
    stderr: "pipe",
  });
  await client.connect(transport);
  return { client, transport };
}

async function main() {
  console.log(`接続先: ${baseUrl}\n`);

  console.log("【0】検証用のトークンとデータを用意する（REST 経由。MCP ではない）");
  const anon = createClient({ baseUrl });
  // 🚨 email に stamp を入れない。dev-login は email ごとに directus_users へ insert するので、
  //   毎回違う email にすると走らせるたび利用者が 1 人増える（実測 2026-08-17: dev の利用者 308 人）。
  //   固定なら upsertDevUser が既存行を再利用する（insert しない）。コレクション名の stamp は残す。
  const login = await anon.auth.devLogin("mcp-verify@example.test", { admin: true });
  if (!login.sessionToken) throw new Error("dev-login が使えません（ALLOW_DEV_LOGIN を確認）");
  const session = createClient({ baseUrl, sessionToken: login.sessionToken });

  const adminAgent = await session.agents.create({
    name: `mcp-admin-${stamp}`,
    expires_in_days: 1,
    capabilities: {
      admin: [...ALL_ADMIN_CAPABILITIES],
      collections: {
        [allowed]: ["read", "create", "update", "delete"],
        [forbidden]: ["read", "create", "update", "delete"],
      },
    },
  });
  // 一般トークン: allowed だけ触れる。admin capability は無い
  const limitedAgent = await session.agents.create({
    name: `mcp-limited-${stamp}`,
    expires_in_days: 1,
    capabilities: { collections: { [allowed]: ["read", "create"] } },
  });
  pass("管理者トークン発行", `admin capability あり（値は出さない）`);
  pass("一般トークン発行", `${allowed} だけ / admin capability なし`);

  // 検証用のコレクションを 2 つ用意し、それぞれに 1 件入れておく
  const rest = createClient({ baseUrl, token: adminAgent.token });
  for (const name of [allowed, forbidden]) {
    await rest.collections.create({
      collection: name,
      fields: [
        { field: "id", type: "uuid", schema: { is_primary_key: true } },
        { field: "title", type: "string" },
      ],
    });
    await rest.items.create(name, { title: `${name} の中身` });
  }
  pass("検証用コレクションを2つ作成", `${allowed} / ${forbidden}`);

  /* ---------------- 受入基準 1: ツール一覧 ---------------- */
  console.log("\n【1】MCP サーバが起動し、ツール一覧が返る（受入基準 1）");
  const adminConn = await connect(adminAgent.token);
  const tools = await adminConn.client.listTools();
  pass(`ツール ${tools.tools.length} 個`, tools.tools.map((t) => t.name).join(", "));
  const withOutputSchema = tools.tools.filter((t) => t.outputSchema).length;
  if (withOutputSchema === tools.tools.length) {
    pass("全ツールに outputSchema がある", `${withOutputSchema}/${tools.tools.length}`);
  } else {
    fail("outputSchema が無いツールがある", `${withOutputSchema}/${tools.tools.length}`);
  }

  await expectOk(adminConn.client, "ohmycms_health", "ohmycms_health");

  /* ---------------- 受入基準 2 / 3: 一般トークンの肯定形と否定形 ---------------- */
  console.log("\n【2】一般トークン — できること（受入基準 2・肯定形）");
  const limitedConn = await connect(limitedAgent.token);

  const got = await expectOk(limitedConn.client, `${allowed} のアイテムを取得できる`, "ohmycms_items_query", {
    collection: allowed,
    include_count: true,
  });
  if (got) {
    console.log(`      data=${JSON.stringify(got.data)} total_count=${got.total_count}`);
  }
  await expectOk(limitedConn.client, `${allowed} にアイテムを登録できる`, "ohmycms_item_create", {
    collection: allowed,
    data: { title: "一般トークンから登録" },
  });

  console.log("\n【3】一般トークン — できないこと（受入基準 3・否定形。2 とセットで見る）");
  await expectDenied(
    limitedConn.client,
    `${forbidden} は capability に無いので読めない`,
    "ohmycms_items_query",
    { collection: forbidden },
    403,
  );
  await expectDenied(
    limitedConn.client,
    `${allowed} でも update は capability に無いのでできない`,
    "ohmycms_item_update",
    { collection: allowed, id: "00000000-0000-0000-0000-000000000000", data: { title: "x" } },
    403,
  );
  await expectDenied(
    limitedConn.client,
    "存在しないコレクションは 404",
    "ohmycms_items_query",
    { collection: `no_such_${stamp}` },
    404,
  );

  /* ---------------- 受入基準 4: 設定編集は管理者トークンのときだけ ---------------- */
  console.log("\n【4】設定編集ツール（受入基準 4。一般で失敗 → 管理者で成功、の両方を出す）");
  await expectDenied(
    limitedConn.client,
    "一般トークン: コレクション作成 → 拒否",
    "ohmycms_collection_create",
    { collection: `mcp_denied_${stamp}` },
    403,
  );
  await expectDenied(
    limitedConn.client,
    "一般トークン: ポリシー作成 → 拒否",
    "ohmycms_policy_create",
    { name: `mcp-denied-${stamp}` },
    403,
  );
  await expectDenied(
    limitedConn.client,
    "一般トークン: 権限追加 → 拒否",
    "ohmycms_permission_create",
    { policy: "00000000-0000-0000-0000-000000000000", collection: allowed, action: "read" },
    403,
  );
  await expectDenied(
    limitedConn.client,
    "一般トークン: ユーザー一覧 → 拒否",
    "ohmycms_users_list",
    {},
    403,
  );

  await expectOk(adminConn.client, "管理者トークン: コレクション作成 → 成功", "ohmycms_collection_create", {
    collection: `mcp_admin_ok_${stamp}`,
    fields: [{ field: "title", type: "string" }],
  });
  const policy = await expectOk(adminConn.client, "管理者トークン: ポリシー作成 → 成功", "ohmycms_policy_create", {
    name: `mcp-admin-ok-${stamp}`,
    description: "MCP 受入検証で作成",
  });
  if (policy?.row?.id) {
    await expectOk(adminConn.client, "管理者トークン: 権限追加 → 成功", "ohmycms_permission_create", {
      policy: policy.row.id,
      collection: allowed,
      action: "read",
      fields: "*",
    });
  }
  await expectOk(adminConn.client, "管理者トークン: ユーザー一覧 → 成功", "ohmycms_users_list");

  /* ---------------- permissions_describe ---------------- */
  console.log("\n【5】ohmycms_permissions_describe（「今のトークンで何ができるか」）");
  const describeLimited = await expectOk(
    limitedConn.client,
    "一般トークンでの自己申告",
    "ohmycms_permissions_describe",
  );
  if (describeLimited) {
    console.log(`      actor=${JSON.stringify(describeLimited.actor)}`);
    console.log(`      capabilities=${JSON.stringify(describeLimited.capabilities)}`);
    for (const p of describeLimited.probes ?? []) {
      console.log(`      ${p.allowed ? "○" : "×"} ${p.what}${p.code ? ` (${p.code})` : ""}${p.detail && p.allowed ? ` → ${p.detail}` : ""}`);
    }
  }
  const describeAdmin = await expectOk(
    adminConn.client,
    "管理者トークンでの自己申告",
    "ohmycms_permissions_describe",
  );
  if (describeAdmin) {
    const ok = (describeAdmin.probes ?? []).filter((p) => p.allowed).length;
    const ng = (describeAdmin.probes ?? []).filter((p) => !p.allowed).length;
    console.log(`      許可 ${ok} 件 / 拒否 ${ng} 件`);
  }

  /* ---------------- 受入基準 6: トークンが漏れていない ---------------- */
  console.log("\n【6】トークンが応答に漏れていない（受入基準 6）");
  const all = transcript.join("\n");
  for (const [label, value] of [
    ["管理者トークン", adminAgent.token],
    ["一般トークン", limitedAgent.token],
    ["セッショントークン", login.sessionToken],
  ]) {
    if (all.includes(value)) fail(`${label}が MCP の応答に含まれている`);
    else pass(`${label}は応答に含まれない`, `検査した応答 ${transcript.length} 件`);
  }

  /* ---------------- 後片付け ---------------- */
  console.log("\n【7】後片付け");
  await adminConn.client.close();
  await limitedConn.client.close();
  for (const name of [allowed, forbidden, `mcp_admin_ok_${stamp}`]) {
    await rest.collections.delete(name).catch(() => {});
  }
  if (policy?.row?.id) await session.policies.delete(policy.row.id).catch(() => {});
  await session.agents.delete(adminAgent.agent.id).catch(() => {});
  await session.agents.delete(limitedAgent.agent.id).catch(() => {});
  pass("コレクション・ポリシー・トークンを削除");

  console.log(`\n${failures === 0 ? "全項目 PASS" : `${failures} 件 FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\n想定外のエラー:", error);
  process.exit(1);
});
