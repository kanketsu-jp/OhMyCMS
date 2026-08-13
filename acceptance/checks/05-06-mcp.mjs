/**
 * 受入基準5: MCP 経由で同じデータに触れ、**権限が同じように効く**
 * 受入基準6: 管理者トークンで繋ぐと**設定も編集できる**
 *
 * 🚨 このチェックの肝は、基準8 と同じで「否定形が自明に成立しないこと」。
 *   「権限の無いコレクションが読めない」は、そのコレクションが空なら常に真になる。
 *   なので順番を必ず守る:
 *     1) 管理者トークンで 2 つコレクションを作り、**両方に行を入れる**（＝データは実在する）
 *     2) 一般トークンで**許可された方は読める**ことを確認（＝そのトークンは生きている）
 *     3) そのうえで**許可されていない方が読めない**ことを確認
 *
 * 6 も同じ作法で、一般トークンで拒否 → 管理者トークンで成功、の対で見る。
 *
 * 5 には**リレーション経由の抜け道**（F2-1 で塞いだもの）の回帰テストも入れている。
 * ここでも対照実験を先に置く: `parent: null` は「権限で塞いだ」とは限らず
 * 「リレーションが解決できていないだけ」かもしれないので、
 * **管理者トークンなら親の列まで取れる**ことを確かめてから否定形を見る。
 *
 * dist はコミットしていない（ビルド成果物）ので、**判定の前に必ずビルドする**。
 * 「dist があるか」で判定すると clone 直後と CI で必ず SKIP になる。
 *
 * 後片付け: 作るものはすべて acc_mcp_ 接頭辞。最後に消す。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { Session } from "../lib/http.mjs";
import { McpStdioClient } from "../lib/mcp.mjs";
import { REPO_ROOT, run } from "../lib/proc.mjs";
import { STATUS, assertion, result, statusFromAssertions } from "../lib/result.mjs";

const PREFIX = "acc_mcp_";
/** リレーション経由で漏れてはいけない値。出てきたら一発で分かる文字列にする。 */
const SECRET = "ACC-MCP-RELATION-SECRET";
const SERVER_ENTRY = join(REPO_ROOT, "packages/mcp/dist/index.js");
const BUILD_COMMAND = ["--filter", "./packages/*", "build"];

/** 一度ビルドしたら使い回す（5 と 6 で 2 回走らせない） */
let buildPromise = null;

/**
 * packages をビルドする。**dist の有無で実装の有無を判定しない。**
 * dist は .gitignore に入っているので、clone 直後は必ず存在しない。
 */
function ensureBuilt() {
  if (!buildPromise) {
    buildPromise = (async () => {
      if (!existsSync(join(REPO_ROOT, "packages/mcp/package.json"))) {
        return { ok: false, reason: "packages/mcp がありません（未実装）", skip: true };
      }
      const built = await run("pnpm", BUILD_COMMAND, { timeoutMs: 300_000 });
      if (built.code !== 0) {
        return {
          ok: false,
          reason: `packages のビルドに失敗しました (exit ${built.code})`,
          detail: (built.stderr || built.stdout).slice(-800),
        };
      }
      if (!existsSync(SERVER_ENTRY)) {
        return { ok: false, reason: `ビルドは通りましたが ${SERVER_ENTRY} がありません` };
      }
      return { ok: true };
    })();
  }
  return buildPromise;
}

function blocked(id, title, reason, details, repro, started) {
  return result({
    id,
    title,
    status: STATUS.BLOCKED,
    reason,
    details,
    repro,
    ms: Date.now() - started,
  });
}

function skipped(id, title, reason, details, started) {
  return result({ id, title, status: STATUS.SKIP, reason, details, ms: Date.now() - started });
}

/**
 * 検証用のトークンとデータを REST で用意する（MCP ではない）。
 * MCP は「同じデータに触れるか」を見るものなので、下ごしらえは REST で行う。
 */
async function setup(baseUrl, stamp, { sabotage = false } = {}) {
  const allowed = `${PREFIX}allowed_${stamp}`;
  const forbidden = `${PREFIX}forbidden_${stamp}`;

  const admin = new Session(baseUrl, "admin");
  const login = await admin.postJson("/api/auth/dev-login?admin=true", {
    email: `acc-mcp-${stamp}@example.com`,
  });
  if (login.status !== 200) {
    return { ok: false, reason: `dev-login が使えません (HTTP ${login.status})` };
  }

  // 管理トークン: 管理操作 + 2 つのコレクションの行を扱える
  const adminToken = await admin.postJson("/api/auth/agents", {
    name: `acc-mcp-admin-${stamp}`,
    expires_in_days: 1,
    capabilities: {
      admin: ["schema:read", "schema:write", "settings:read", "settings:write"],
      collections: {
        [allowed]: ["read", "create", "update", "delete"],
        [forbidden]: ["read", "create", "update", "delete"],
      },
    },
  });
  // 一般トークン: allowed の read/create だけ。管理 capability は無い
  //
  // 🚨 --red 5,6 のときだけ、この「一般トークン」に管理トークンと同じ権限を与える。
  //   権限が効いていない世界を作って、**このチェックが本当に FAIL になるか**を見るため
  //   （否定形が自明に通っていたら、壊しても PASS のままになる）。
  const limitedToken = await admin.postJson("/api/auth/agents", {
    name: `acc-mcp-limited-${stamp}`,
    expires_in_days: 1,
    capabilities: sabotage
      ? {
          admin: ["schema:read", "schema:write", "settings:read", "settings:write"],
          collections: {
            [allowed]: ["read", "create", "update", "delete"],
            [forbidden]: ["read", "create", "update", "delete"],
          },
        }
      : { collections: { [allowed]: ["read", "create"] } },
  });

  if (adminToken.status !== 200 || limitedToken.status !== 200) {
    return {
      ok: false,
      reason:
        `エージェントトークンを発行できません ` +
        `(admin=${adminToken.status} limited=${limitedToken.status})`,
    };
  }

  // 🚨 否定形を自明にしないため、**両方のコレクションに行を入れる**
  const asAdmin = (path, body, method = "POST") =>
    admin.request(path, {
      method,
      headers: {
        authorization: `Bearer ${adminToken.json.token}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  // forbidden は「権限が無いコレクション」であると同時に、
  // **allowed からリレーションで辿れる親**でもある（F2-1 の回帰テスト用）。
  const forbiddenCreated = await asAdmin("/api/collections", {
    collection: forbidden,
    fields: [
      { field: "id", type: "uuid", schema: { is_primary_key: true } },
      { field: "title", type: "string" },
      { field: "secret", type: "string" },
    ],
  });
  if (forbiddenCreated.status !== 200) {
    return { ok: false, reason: `${forbidden} を作れません (HTTP ${forbiddenCreated.status})` };
  }
  const parentSeeded = await asAdmin(`/api/items/${forbidden}`, {
    title: `${forbidden} の中身`,
    secret: SECRET,
  });
  if (parentSeeded.status !== 201) {
    return { ok: false, reason: `${forbidden} に行を入れられません (HTTP ${parentSeeded.status})` };
  }
  const parentId = parentSeeded.json?.data?.id;

  const allowedCreated = await asAdmin("/api/collections", {
    collection: allowed,
    fields: [
      { field: "id", type: "uuid", schema: { is_primary_key: true } },
      { field: "title", type: "string" },
      { field: "parent", type: "uuid" },
    ],
  });
  if (allowedCreated.status !== 200) {
    return { ok: false, reason: `${allowed} を作れません (HTTP ${allowedCreated.status})` };
  }
  const relation = await asAdmin("/api/relations", {
    many_collection: allowed,
    many_field: "parent",
    many_primary: "id",
    one_collection: forbidden,
    one_primary: "id",
  });
  if (relation.status !== 200) {
    return { ok: false, reason: `リレーションを作れません (HTTP ${relation.status})` };
  }
  const childSeeded = await asAdmin(`/api/items/${allowed}`, {
    title: `${allowed} の中身`,
    parent: parentId,
  });
  if (childSeeded.status !== 201) {
    return { ok: false, reason: `${allowed} に行を入れられません (HTTP ${childSeeded.status})` };
  }

  return {
    ok: true,
    admin,
    allowed,
    forbidden,
    parentId,
    adminToken: adminToken.json.token,
    adminAgentId: adminToken.json.data.id,
    limitedToken: limitedToken.json.token,
    limitedAgentId: limitedToken.json.data.id,
  };
}

/**
 * 作ったものを消す。
 * 🚨 `extra` を忘れない。--red のときは「拒否されるはずのコレクション作成」が**成功してしまう**ので、
 *   そこで出来たコレクションが残る（2026-08-13 に実際に残した）。
 */
async function teardown(env, extra = []) {
  const asAdmin = (path, method) =>
    env.admin.request(path, {
      method,
      headers: { authorization: `Bearer ${env.adminToken}` },
    });
  for (const collection of [env.allowed, env.forbidden, ...extra]) {
    await asAdmin(`/api/collections/${collection}`, "DELETE").catch(() => {});
  }
  for (const id of [env.adminAgentId, env.limitedAgentId]) {
    await env.admin.delete(`/api/auth/agents/${id}`).catch(() => {});
  }
}

async function connect(token, baseUrl) {
  const client = new McpStdioClient(process.execPath, [SERVER_ENTRY], {
    OHMYCMS_URL: baseUrl,
    OHMYCMS_TOKEN: token,
  });
  await client.start();
  return client;
}

/** ツール呼び出しの結果から、API が返したエラーコードを取り出す */
function errorOf(callResult) {
  return callResult.structured?.error ?? null;
}

/* ------------------------------------------------------------------ *
 * 受入基準5
 * ------------------------------------------------------------------ */

export async function check5(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const repro = ["pnpm acceptance --only 5"];

  const build = await ensureBuilt();
  if (!build.ok) {
    return build.skip
      ? skipped(5, "MCP 経由で触れ、権限が同じように効く", build.reason, [], started)
      : blocked(5, "MCP 経由で触れ、権限が同じように効く", build.reason,
          [build.detail ?? ""].filter(Boolean),
          ["pnpm --filter ./packages/* build"], started);
  }

  const stamp = Date.now();
  const sabotage = context.red?.includes(5) ?? false;
  const env = await setup(baseUrl, stamp, { sabotage });
  if (!env.ok) {
    return blocked(
      5,
      "MCP 経由で触れ、権限が同じように効く",
      env.reason,
      [
        "MCP の検証にはエージェントトークンが2種類（管理・一般）要ります。",
        "トークンの発行には人間のセッションが必要で、セッションは dev-login でしか作れません",
        "（本番ビルドでは dev-login が消えます）。",
      ],
      ["pnpm acceptance:up   # dev モードの studio を 3999 で起動する"],
      started,
    );
  }

  const assertions = [];
  const details = [];
  let limited = null;
  let admin = null;

  try {
    limited = await connect(env.limitedToken, baseUrl);
    admin = await connect(env.adminToken, baseUrl);

    // ── ツール一覧が返ること（ここが返らないと以降が意味を持たない） ──
    const tools = await limited.listTools();
    const names = (tools.tools ?? []).map((t) => t.name);
    assertions.push(
      assertion("positive", "ツール一覧が返る", names.length > 0, `${names.length} 個`, "1 個以上"),
    );
    assertions.push(
      assertion(
        "positive",
        "items を引くツールがある",
        names.includes("ohmycms_items_query"),
        names.includes("ohmycms_items_query") ? "ある" : "ない",
        "ohmycms_items_query がある",
      ),
    );

    // ── 肯定形: 権限のあるデータは MCP から見える ──
    const readOk = await limited.callTool("ohmycms_items_query", {
      collection: env.allowed,
      include_count: true,
    });
    const rows = readOk.structured?.data ?? [];
    assertions.push(
      assertion(
        "positive",
        `一般トークンで ${env.allowed} が読める`,
        !readOk.isError && rows.length > 0,
        readOk.isError ? `拒否 ${errorOf(readOk)?.code}` : `${rows.length} 件`,
        "1 件以上",
      ),
    );

    const writeOk = await limited.callTool("ohmycms_item_create", {
      collection: env.allowed,
      data: { title: "MCP から登録" },
    });
    assertions.push(
      assertion(
        "positive",
        `一般トークンで ${env.allowed} に登録できる`,
        !writeOk.isError,
        writeOk.isError ? `拒否 ${errorOf(writeOk)?.code}` : "登録できた",
        "登録できる",
      ),
    );

    // ── 否定形: 権限の無いデータは拒否される（行は実在している） ──
    const readNg = await limited.callTool("ohmycms_items_query", { collection: env.forbidden });
    const ngError = errorOf(readNg);
    assertions.push(
      assertion(
        "negative",
        `一般トークンで ${env.forbidden} は読めない（行は実在する）`,
        readNg.isError && (ngError?.status === 403 || ngError?.status === 404),
        readNg.isError ? `${ngError?.status} ${ngError?.code}` : "読めてしまった",
        "403 か 404",
      ),
    );

    const updateNg = await limited.callTool("ohmycms_item_update", {
      collection: env.allowed,
      id: "00000000-0000-0000-0000-000000000000",
      data: { title: "x" },
    });
    const updateError = errorOf(updateNg);
    assertions.push(
      assertion(
        "negative",
        "capability に無いアクション（update）はできない",
        updateNg.isError && (updateError?.status === 403 || updateError?.status === 404),
        updateNg.isError ? `${updateError?.status} ${updateError?.code}` : "更新できてしまった",
        "403 か 404",
      ),
    );

    // ── リレーション経由の抜け道が塞がっているか（F2-1 の回帰テスト） ──
    //
    // 🚨 ここも「否定形が自明に成立しない」ようにする。
    //   `parent: null` が返るのは「権限で塞いだ」からとは限らず、
    //   **リレーションがそもそも解決できていない**だけかもしれない。
    //   そこで先に管理者トークンで同じクエリを投げ、
    //   **リレーションを辿れば secret が実際に取れる**ことを確かめてから否定形を見る。
    //   （2026-08-13 に実際にこの落とし穴を踏みかけた。対照実験が無いと誤読する）
    const adminRelation = await admin.callTool("ohmycms_items_query", {
      collection: env.allowed,
      fields: ["id", "parent.*"],
    });
    const adminSawSecret = JSON.stringify(adminRelation.structured ?? {}).includes(SECRET);
    assertions.push(
      assertion(
        "positive",
        "対照: 管理者トークンならリレーションを辿って親の列まで取れる",
        !adminRelation.isError && adminSawSecret,
        adminSawSecret ? "親の列まで取れた" : `取れず (${errorOf(adminRelation)?.code ?? "secret なし"})`,
        "親の列まで取れる",
      ),
    );

    const relationLeak = await limited.callTool("ohmycms_items_query", {
      collection: env.allowed,
      fields: ["id", "parent.*"],
    });
    const limitedSawSecret = JSON.stringify(relationLeak.structured ?? {}).includes(SECRET);
    assertions.push(
      assertion(
        "negative",
        "一般トークンは fields のドット記法で親（権限の無いコレクション）を読めない",
        !limitedSawSecret,
        limitedSawSecret ? "**親の secret が漏れた**" : "漏れていない",
        "漏れない",
      ),
    );

    const namedLeak = await limited.callTool("ohmycms_items_query", {
      collection: env.allowed,
      fields: ["id", "parent.secret"],
    });
    assertions.push(
      assertion(
        "negative",
        "親の列を名指し（parent.secret）しても読めない",
        !JSON.stringify(namedLeak.structured ?? {}).includes(SECRET),
        JSON.stringify(namedLeak.structured ?? {}).includes(SECRET) ? "**漏れた**" : "漏れていない",
        "漏れない",
      ),
    );

    // filter で親の列を条件にすると、当たり外れから値を復元できてしまう（総当たり）。
    // 403 で拒否されるのが正しい。
    const filterProbe = await limited.callTool("ohmycms_items_query", {
      collection: env.allowed,
      filter: { parent: { secret: { _contains: SECRET } } },
    });
    assertions.push(
      assertion(
        "negative",
        "filter で親の列を条件にすると拒否される（当たり外れから値を当てられないように）",
        filterProbe.isError && errorOf(filterProbe)?.status === 403,
        filterProbe.isError ? `${errorOf(filterProbe)?.status} ${errorOf(filterProbe)?.code}` : "通ってしまった",
        "403",
      ),
    );

    // ── stdout がプロトコル専用に保たれているか ──
    assertions.push(
      assertion(
        "negative",
        "stdout に JSON-RPC 以外が混ざっていない",
        limited.stray.length === 0,
        limited.stray.length === 0 ? "混ざっていない" : `${limited.stray.length} 行混ざった`,
        "0 行",
      ),
    );

    // ── トークンが応答にもログにも出ていないか ──
    const leaked =
      readOk.text.includes(env.limitedToken) ||
      readNg.text.includes(env.limitedToken) ||
      limited.stderr.includes(env.limitedToken);
    assertions.push(
      assertion(
        "negative",
        "トークンが MCP の応答・ログに出ていない",
        !leaked,
        leaked ? "出ている" : "出ていない",
        "出ていない",
      ),
    );

    if (sabotage) {
      details.push(
        "⚠ --red 5 が指定されているため、一般トークンに管理トークンと同じ権限を与えています" +
          "（FAIL になるのが正しい結果です）。",
      );
    }
    details.push(
      `肯定形: ${env.allowed} → ${rows.length} 件読めた / 登録もできた`,
      readNg.isError
        ? `否定形: ${env.forbidden} → ${ngError?.status} ${ngError?.code}（行は実在するのに拒否された）`
        : `否定形: ${env.forbidden} → 拒否されず ${(readNg.structured?.data ?? []).length} 件読めてしまった`,
    );
  } finally {
    if (limited) await limited.stop();
    if (admin) await admin.stop();
    await teardown(env);
  }

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 5,
    title: "MCP 経由で触れ、権限が同じように効く",
    status: verdict.status,
    positive: "許可されたコレクションは読める・書ける",
    negative: "許可されていないコレクションは 403 / リレーション経由でも漏れない",
    details: [...details, ...verdict.details],
    repro,
    assertions,
    ms: Date.now() - started,
  });
}

/* ------------------------------------------------------------------ *
 * 受入基準6
 * ------------------------------------------------------------------ */

export async function check6(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const repro = ["pnpm acceptance --only 6"];

  const build = await ensureBuilt();
  if (!build.ok) {
    return build.skip
      ? skipped(6, "管理者トークンなら MCP から設定も編集できる", build.reason, [], started)
      : blocked(6, "管理者トークンなら MCP から設定も編集できる", build.reason,
          [build.detail ?? ""].filter(Boolean),
          ["pnpm --filter ./packages/* build"], started);
  }

  const stamp = Date.now() + 1;
  const sabotage = context.red?.includes(6) ?? false;
  const env = await setup(baseUrl, stamp, { sabotage });
  if (!env.ok) {
    return blocked(
      6,
      "管理者トークンなら MCP から設定も編集できる",
      env.reason,
      ["トークンの発行に dev-login のセッションが要ります（本番ビルドでは作れません）。"],
      ["pnpm acceptance:up"],
      started,
    );
  }

  const assertions = [];
  const details = [];
  let limited = null;
  let admin = null;
  let createdPolicyId = null;

  try {
    limited = await connect(env.limitedToken, baseUrl);
    admin = await connect(env.adminToken, baseUrl);

    // ── 否定形を先に: 一般トークンでは設定を編集できない ──
    const denials = [
      ["ohmycms_policy_create", { name: `acc-mcp-denied-${stamp}` }, "ポリシー作成"],
      ["ohmycms_collection_create", { collection: `${PREFIX}denied_${stamp}` }, "コレクション作成"],
      ["ohmycms_users_list", {}, "ユーザー一覧"],
    ];
    for (const [tool, args, label] of denials) {
      const denied = await limited.callTool(tool, args);
      const error = errorOf(denied);
      assertions.push(
        assertion(
          "negative",
          `一般トークンでは ${label} ができない`,
          denied.isError && error?.status === 403,
          denied.isError ? `${error?.status} ${error?.code}` : "できてしまった",
          "403",
        ),
      );
    }

    // ── 肯定形: 管理者トークンなら同じことができる ──
    const policy = await admin.callTool("ohmycms_policy_create", {
      name: `acc-mcp-admin-${stamp}`,
      description: "受入ハーネスが作成",
    });
    createdPolicyId = policy.structured?.row?.id ?? null;
    assertions.push(
      assertion(
        "positive",
        "管理者トークンならポリシーを作れる",
        !policy.isError && Boolean(createdPolicyId),
        policy.isError ? `拒否 ${errorOf(policy)?.code}` : `id=${createdPolicyId}`,
        "作成できる",
      ),
    );

    if (createdPolicyId) {
      const permission = await admin.callTool("ohmycms_permission_create", {
        policy: createdPolicyId,
        collection: env.allowed,
        action: "read",
        fields: "*",
      });
      assertions.push(
        assertion(
          "positive",
          "管理者トークンなら権限を追加できる",
          !permission.isError,
          permission.isError ? `拒否 ${errorOf(permission)?.code}` : "追加できた",
          "追加できる",
        ),
      );
    }

    const collection = await admin.callTool("ohmycms_collection_create", {
      collection: `${PREFIX}admin_ok_${stamp}`,
      fields: [{ field: "title", type: "string" }],
    });
    assertions.push(
      assertion(
        "positive",
        "管理者トークンならコレクションを作れる",
        !collection.isError,
        collection.isError ? `拒否 ${errorOf(collection)?.code}` : "作成できた",
        "作成できる",
      ),
    );
    if (!collection.isError) {
      await env.admin
        .request(`/api/collections/${PREFIX}admin_ok_${stamp}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${env.adminToken}` },
        })
        .catch(() => {});
    }

    const users = await admin.callTool("ohmycms_users_list");
    assertions.push(
      assertion(
        "positive",
        "管理者トークンならユーザー一覧が取れる",
        !users.isError,
        users.isError ? `拒否 ${errorOf(users)?.code}` : `${users.structured?.count} 件`,
        "取れる",
      ),
    );

    if (sabotage) {
      details.push(
        "⚠ --red 6 が指定されているため、一般トークンに管理 capability を与えています" +
          "（FAIL になるのが正しい結果です）。",
      );
    }
    details.push(
      "同じツールを 2 つのトークンで叩き分けています（ツールの登録は同じ。成否は API が決める）。",
    );
  } finally {
    if (limited) await limited.stop();
    if (admin) await admin.stop();
    if (createdPolicyId) {
      await env.admin.delete(`/api/policies/${createdPolicyId}`).catch(() => {});
    }
    // --red のときは「拒否されるはず」のコレクション作成が通ってしまうので、それも消す
    await teardown(env, [`${PREFIX}denied_${stamp}`, `${PREFIX}admin_ok_${stamp}`]);
  }

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 6,
    title: "管理者トークンなら MCP から設定も編集できる",
    status: verdict.status,
    positive: "管理者トークンで設定を編集できる",
    negative: "一般トークンでは 403",
    details: [...details, ...verdict.details],
    repro,
    assertions,
    ms: Date.now() - started,
  });
}
