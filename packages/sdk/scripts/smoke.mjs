/**
 * 起動中の API に対して SDK を実際に叩く疎通スクリプト（F3 の受入基準 3〜5）。
 *
 *   bun --filter @ohmycms/sdk build
 *   OHMYCMS_URL=http://localhost:3103 node scripts/smoke.mjs   # 受入ハーネスの studio へ
 *
 * 肯定形（権限のあるものは取れる）と否定形（401/403/404 が区別できる）を必ず並べて出す。
 * dev-login を使うので、サーバ側で ALLOW_DEV_LOGIN=true かつ NODE_ENV!=="production" が要る。
 * トークンは一切表示しない（長さだけ出す）。
 */
import { ALL_ADMIN_CAPABILITIES, createClient, isOhMyCmsError } from "../dist/index.js";

const baseUrl = process.env.OHMYCMS_URL ?? "http://localhost:3102";
const stamp = Date.now();
const collection = `sdk_smoke_${stamp}`;

let failures = 0;

function pass(label, detail) {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail) {
  failures += 1;
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
}

/** 例外が起きることを期待する検査。status と code を実測して照合する */
async function expectError(label, expectedStatus, fn) {
  try {
    await fn();
    fail(label, `例外が投げられなかった（${expectedStatus} を期待）`);
  } catch (error) {
    if (!isOhMyCmsError(error)) {
      fail(label, `OhMyCmsError でない: ${String(error)}`);
      return;
    }
    if (error.status !== expectedStatus) {
      fail(label, `status=${error.status}（${expectedStatus} を期待） code=${error.code}`);
      return;
    }
    pass(label, `status=${error.status} code=${error.code} message=「${error.message}」`);
  }
}

async function main() {
  const anon = createClient({ baseUrl });

  console.log(`接続先: ${baseUrl}\n`);

  console.log("【0】health");
  const health = await anon.health();
  console.log(`  ${JSON.stringify(health)}`);
  if (health.status === "ok") pass("health が ok"); else fail("health が ok でない");

  console.log("\n【1】トークンの用意（dev-login → エージェントトークン発行）");
  const adminLogin = await anon.auth.devLogin(`sdk-smoke-admin-${stamp}@example.test`, {
    admin: true,
  });
  const userLogin = await anon.auth.devLogin(`sdk-smoke-user-${stamp}@example.test`);
  if (!adminLogin.sessionToken || !userLogin.sessionToken) {
    throw new Error("dev-login が Set-Cookie を返しませんでした（ALLOW_DEV_LOGIN を確認）");
  }
  pass("管理者セッション取得", `userId=${adminLogin.actor.userId}`);
  pass("一般ユーザーセッション取得", `userId=${userLogin.actor.userId}`);

  const adminSession = createClient({ baseUrl, sessionToken: adminLogin.sessionToken });
  const userSession = createClient({ baseUrl, sessionToken: userLogin.sessionToken });

  // 🚨 capabilities を指定するときは collections も必ず書く。
  // admin だけ書くと items が全部 403 になる（capabilityAllows の既定が collections と admin で逆）。
  const adminAgent = await adminSession.agents.create({
    name: `smoke-admin-${stamp}`,
    expires_in_days: 1,
    capabilities: {
      admin: [...ALL_ADMIN_CAPABILITIES],
      collections: { [collection]: ["read", "create", "update", "delete"] },
    },
  });
  // capabilities を渡さない = 委任元の権限をそのまま継承（管理操作は不可）
  const userAgent = await userSession.agents.create({
    name: `smoke-user-${stamp}`,
    expires_in_days: 1,
  });
  // admin だけ渡したトークン。items が 403 になることの確認に使う
  const adminOnlyAgent = await adminSession.agents.create({
    name: `smoke-admin-only-${stamp}`,
    expires_in_days: 1,
    capabilities: { admin: [...ALL_ADMIN_CAPABILITIES] },
  });
  pass("管理者エージェントトークン発行", `token 長=${adminAgent.token.length} 文字（値は出さない）`);
  pass("一般エージェントトークン発行", `token 長=${userAgent.token.length} 文字（値は出さない）`);
  pass("admin capability だけのトークン発行", "items が 403 になることの確認用");

  const admin = createClient({ baseUrl, token: adminAgent.token });
  const user = createClient({ baseUrl, token: userAgent.token });
  const adminOnly = createClient({ baseUrl, token: adminOnlyAgent.token });
  const bogus = createClient({ baseUrl, token: "definitely-not-a-valid-token" });

  console.log("\n【2】肯定形 — 権限のあるトークンで取れる（受入基準 3・5）");
  const collections = await admin.collections.list();
  pass("collections 一覧", `${collections.length} 件: ${collections.map((c) => c.collection).join(", ") || "(なし)"}`);

  const me = await admin.auth.me();
  pass("auth.me", `type=${me.type}`);

  console.log("\n【3】肯定形 — スキーマ作成〜アイテム登録〜検索");
  await admin.collections.create({
    collection,
    fields: [
      { field: "id", type: "uuid", schema: { is_primary_key: true } },
      { field: "title", type: "string" },
      { field: "views", type: "integer" },
    ],
  });
  pass("collections.create", collection);

  await admin.fields.create(collection, { field: "status", type: "string" });
  const fields = await admin.fields.list(collection);
  pass("fields.create + list", `列: ${fields.map((f) => f.field).join(", ")}`);

  for (const n of [1, 2, 3]) {
    await admin.items.create(collection, {
      title: `smoke-${n}`,
      views: n * 10,
      status: n === 3 ? "draft" : "published",
    });
  }
  pass("items.create x3");

  const listed = await admin.items.list(collection, {
    sort: ["views"],
    meta: ["total_count", "filter_count"],
  });
  pass("items.list + meta", `data=${listed.data.length} 件 meta=${JSON.stringify(listed.meta)}`);

  const filtered = await admin.items.list(collection, {
    filter: { _and: [{ views: { _gte: 20 } }, { status: { _eq: "published" } }] },
    fields: ["title", "views"],
    meta: ["filter_count", "total_count"],
  });
  pass(
    "items.list + filter",
    `${JSON.stringify(filtered.data)} meta=${JSON.stringify(filtered.meta)}`,
  );

  const paged = await admin.items.list(collection, {
    sort: ["views"],
    limit: 1,
    page: 2,
    fields: ["title"],
  });
  pass("items.list + page/limit", JSON.stringify(paged.data));

  const first = listed.data[0];
  const fetched = await admin.items.get(collection, String(first.id));
  pass("items.get", JSON.stringify(fetched));

  const updated = await admin.items.update(collection, String(first.id), { views: 999 });
  pass("items.update", `views=${updated.views}`);

  console.log("\n【4】否定形 — 401 / 403 / 404 が例外として区別できる（受入基準 4）");
  await expectError("401 認証なし", 401, () => createClient({ baseUrl }).collections.list());
  await expectError("401 無効なトークン", 401, () => bogus.collections.list());
  await expectError("403 一般トークンで管理系", 403, () => user.collections.list());
  await expectError("403 一般トークンで items", 403, () => user.items.list(collection));
  await expectError(
    "403 admin capability だけのトークンで items（collections を書かないと全滅する）",
    403,
    () => adminOnly.items.list(collection),
  );
  await expectError("403 Bearer でトークン発行", 403, () =>
    admin.agents.create({ name: "x", expires_in_days: 1 }),
  );
  await expectError("403 システムテーブルへの items", 403, () =>
    admin.items.list("directus_users"),
  );
  await expectError("404 存在しないコレクション", 404, () =>
    admin.items.list("no_such_collection_xyz"),
  );
  await expectError("404 存在しないアイテム", 404, () =>
    admin.items.get(collection, "00000000-0000-0000-0000-000000000000"),
  );
  await expectError("400 未対応の演算子", 400, () =>
    admin.items.list(collection, { filter: { views: { _bogus: 1 } } }),
  );
  await expectError("0 接続できない先", 0, () =>
    createClient({ baseUrl: "http://127.0.0.1:1", timeoutMs: 2000 }).health(),
  );

  console.log("\n【5】後片付け");
  await admin.collections.delete(collection);
  pass("collections.delete", collection);
  await adminSession.agents.delete(adminAgent.agent.id);
  await adminSession.agents.delete(adminOnlyAgent.agent.id);
  await userSession.agents.delete(userAgent.agent.id);
  pass("agents.delete x3");

  console.log(`\n${failures === 0 ? "全項目 PASS" : `${failures} 件 FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  if (isOhMyCmsError(error)) {
    console.error(`\n想定外の OhMyCmsError: status=${error.status} code=${error.code} ${error.message}`);
    console.error(`  ${error.detail.method} ${error.detail.url}`);
  } else {
    console.error("\n想定外のエラー:", error);
  }
  process.exit(1);
});
