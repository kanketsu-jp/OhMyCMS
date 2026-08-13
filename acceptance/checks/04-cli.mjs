/**
 * 受入基準4: CLI で同じことができる
 *          （コレクション作成・アイテム登録・ユーザー作成・トークン発行）
 *
 * 実装の在り処は **`packages/cli/package.json` の `bin`** で判定する。
 * 🚨 `dist/` で判定しない。dist はビルド成果物で `.gitignore` に入っており、
 *    clone 直後や CI では必ず存在しない。dist を根拠にすると
 *    「CLI は実装されているのに永久に SKIP」という嘘をつく。
 *    dist が無いときはこちらでビルドし、**ビルドに失敗したら SKIP ではなく FAIL**
 *    （＝実装はあるが壊れている、を「未実装」で隠さない）。
 *
 * 肯定形 / 否定形の対:
 *   肯定形 … 一通りの操作が exit 0 で通り、作ったものが list に出る／値が実際に変わる
 *   否定形 … 権限の無いトークン・繋がらない URL・引数誤り・消した ID で exit≠0
 *   どちらか片方だけでは意味がない。**何をしても落ちる CLI** は否定形だけなら通ってしまう。
 *
 * 🚨 CLI は `~/.config/ohmycms/config.json` にトークンを保存する。
 *    XDG_CONFIG_HOME を一時ディレクトリへ向けて、**利用者の設定を絶対に触らない**。
 *
 * ── 実測で分かった前提（ここを踏まないと肯定形が全部 403 になる）──
 *  1. `login --dev-login --admin` が発行するのは **エージェントトークン**で、
 *     capabilities は admin:[schema:read, schema:write, settings:read, settings:write]。
 *     **items の読み書きは capability ではなく「委任元ユーザーの権限」を継承する**ので、
 *     新しいコレクションには権限行が無く 403 PERMISSION_DENIED になる。
 *     → 委任元ユーザーへ items の権限を付けてから叩く（これが実運用の手順でもある）。
 *  2. `token create` / `token list` は **人間のセッションが必要**（エージェントトークン不可）。
 *     セッション cookie の値を `OHMYCMS_SESSION_TOKEN` で渡す。
 */

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Session } from "../lib/http.mjs";
import { run, REPO_ROOT } from "../lib/proc.mjs";
import { assertion, result, statusFromAssertions } from "../lib/result.mjs";

const PREFIX = "acc-";
const COLLECTION = "acc_cli_notes";
const CLI_DIR = join(REPO_ROOT, "packages/cli");

/** B の終了コード設計（仕様どおり）。 */
const EXIT = { OK: 0, BAD_ARGS: 2, UNAUTHORIZED: 3, FORBIDDEN: 4, NOT_FOUND: 5, UNREACHABLE: 6 };

/** 実装されているか。**committed なファイルだけ**を根拠にする。 */
async function cliPackage() {
  const manifestPath = join(CLI_DIR, "package.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const bin = manifest.bin?.ohmycms;
    return bin ? { manifest, bin } : null;
  } catch {
    return null;
  }
}

export async function check(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const assertions = [];
  const details = [];
  const sabotage = context.red?.includes(4) ?? false;

  const pkg = await cliPackage();
  if (!pkg) {
    return result({
      id: 4,
      title: "CLI で同じことができる",
      status: "SKIP",
      reason: "packages/cli 未実装（package.json に bin.ohmycms が無い）",
      details: ["実装されたら、このチェックが自動的に本物へ切り替わります。"],
      ms: Date.now() - started,
    });
  }

  // ── dist が無ければビルドする（dist は .gitignore なので普通は無い） ──
  const entry = join(CLI_DIR, pkg.bin.replace(/^\.\//, ""));
  if (!existsSync(entry)) {
    details.push(`${pkg.bin} が無いのでビルドします（dist はコミットされないため）`);
    const build = await run("pnpm", ["--filter", "@ohmycms/cli", "build"], { timeoutMs: 300_000 });
    if (build.code !== 0 || !existsSync(entry)) {
      // 実装はあるがビルドできない = 壊れている。SKIP で隠さず FAIL にする。
      return result({
        id: 4,
        title: "CLI で同じことができる",
        status: "FAIL",
        positive: "build 失敗",
        details: [
          "packages/cli は存在しますが、ビルドできませんでした。",
          "（実装が無いのではなく壊れているので SKIP にはしません）",
          ...(build.stderr || build.stdout).trim().split("\n").slice(-12).map((l) => `    ${l}`),
        ],
        repro: ["pnpm --filter @ohmycms/cli build"],
        ms: Date.now() - started,
      });
    }
  }

  // 🚨 利用者の ~/.config/ohmycms/config.json を汚さない。
  const configHome = await mkdtemp(join(tmpdir(), "ohmycms-acc-cli-"));
  const snapshotPath = join(configHome, "schema.json");

  // 人間のセッション（token 系コマンドと、権限の下ごしらえに使う）
  const admin = new Session(baseUrl, "admin");
  const adminLogin = await admin.postJson("/api/auth/dev-login?admin=true", {
    email: `${PREFIX}cli-admin@example.com`,
  });
  const sessionToken = admin.cookies.get("session") ?? "";

  if (adminLogin.status !== 200 || !sessionToken) {
    await rm(configHome, { recursive: true, force: true });
    return result({
      id: 4,
      title: "CLI で同じことができる",
      status: "BLOCKED",
      reason: `dev-login が使えません (HTTP ${adminLogin.status})`,
      details: [
        "token create / token list は人間のセッションが必要で、本番ビルドでは dev-login が消えています。",
        "→ acceptance/compose.acceptance.yml の dev モード studio を起動してください。",
      ],
      repro: ["pnpm acceptance --only 4"],
      ms: Date.now() - started,
    });
  }

  /** CLI を1回叩く。トークンは一時 config から解決させる。 */
  const cli = (args, extraEnv = {}) =>
    run("node", [entry, ...args], {
      timeoutMs: 120_000,
      env: {
        XDG_CONFIG_HOME: configHome,
        OHMYCMS_URL: baseUrl,
        ...extraEnv,
      },
    });
  /** 人間のセッションが要るコマンド用。 */
  const cliAsHuman = (args) => cli(args, { OHMYCMS_SESSION_TOKEN: sessionToken });

  let policyId = null;
  try {
    // ══ 肯定形 ══

    const health = await cli(["health"]);
    assertions.push(
      assertion("positive", "ohmycms health が通る", health.code === EXIT.OK, `exit ${health.code}`, "exit 0"),
    );

    const loginArgs = ["login", "--dev-login", `${PREFIX}cli@example.com`, "--name", `${PREFIX}cli`];
    if (!sabotage) loginArgs.push("--admin");
    if (sabotage) {
      details.push(
        "⚠ --red 4 が指定されているため、--admin **を付けずに** ログインしています" +
          "（＝スキーマ操作の capability が無いトークン）。この実行結果は FAIL になるのが正しい。",
      );
    }
    const login = await cli(loginArgs);
    assertions.push(
      assertion("positive", "ohmycms login --dev-login が通る", login.code === EXIT.OK,
        `exit ${login.code}`, "exit 0"),
    );

    // 最初の login で保存された（スキーマ操作ができる）トークンを控えておく。
    // 後で items 用トークンへ差し替えるので、管理系コマンドはこれを明示して叩く。
    let adminToken = null;
    try {
      const saved = JSON.parse(await readFile(join(configHome, "ohmycms", "config.json"), "utf8"));
      adminToken = saved?.token ?? null;
    } catch { /* 下の assertion で分かる */ }
    /** スキーマ・ユーザー一覧など、admin capability が要るコマンド用。 */
    const cliAsAdmin = (args) => (adminToken ? cli(args, { OHMYCMS_TOKEN: adminToken }) : cli(args));

    const whoami = await cli(["whoami", "--json"]);
    let delegatedUserId = null;
    try {
      delegatedUserId = JSON.parse(whoami.stdout)?.actor?.onBehalfOf ?? null;
    } catch { /* 下の assertion が拾う */ }
    assertions.push(
      assertion("positive", "ohmycms whoami が委任元ユーザーまで答える",
        whoami.code === EXIT.OK && Boolean(delegatedUserId),
        delegatedUserId ? "委任元あり" : `取れず (exit ${whoami.code})`, "委任元あり"),
    );

    // コレクション作成 → 一覧に出る
    const createCollection = await cli(["collection", "create", COLLECTION, "--field", "title:string"]);
    assertions.push(
      assertion("positive", "collection create が通る", createCollection.code === EXIT.OK,
        `exit ${createCollection.code}`, "exit 0"),
    );
    const listCollections = await cli(["collection", "list", "--json"]);
    assertions.push(
      assertion("positive", "collection list に作ったコレクションが出る",
        listCollections.code === EXIT.OK && listCollections.stdout.includes(COLLECTION),
        listCollections.stdout.includes(COLLECTION) ? "含まれる" : `含まれない (exit ${listCollections.code})`,
        "含まれる"),
    );

    // フィールド追加 → 一覧に出る
    const addField = await cli(["field", "add", COLLECTION, "body", "--type", "string"]);
    assertions.push(
      assertion("positive", "field add が通る", addField.code === EXIT.OK, `exit ${addField.code}`, "exit 0"),
    );
    const listFields = await cli(["field", "list", COLLECTION, "--json"]);
    assertions.push(
      assertion("positive", "field list に追加したフィールドが出る",
        listFields.code === EXIT.OK && listFields.stdout.includes("body"),
        listFields.stdout.includes("body") ? "含まれる" : `含まれない (exit ${listFields.code})`, "含まれる"),
    );

    // ── items の権限を委任元ユーザーへ付ける ──
    //    エージェントトークンの items 権限は委任元から継承されるので、これが無いと 403。
    //    これは実運用でも同じ手順（管理画面でポリシーを作ってユーザーへ割り当てる）。
    if (delegatedUserId) {
      const policy = await admin.postJson("/api/policies", {
        name: `${PREFIX}cli-items`,
        description: "受入ハーネス: CLI から items を触れるようにする",
        admin_access: false,
      });
      policyId = policy.json?.data?.id ?? null;
      for (const action of ["read", "create", "update", "delete"]) {
        await admin.postJson("/api/permissions", {
          policy: policyId,
          collection: COLLECTION,
          action,
          permissions: {},
          fields: "*",
        });
      }
      await admin.postJson("/api/access", { policy: policyId, user: delegatedUserId });

      // 🚨 ここでトークンを取り直す。理由が2つあり、どちらも実測で確認したもの。
      //
      //  (1) **エージェントトークンは発行時点の権限を固定する。**
      //      権限を付けた「後」に発行したトークンでないと items を触れない。
      //
      //  (2) 🚨 **admin capability を持つトークンは items の権限を失う。**
      //      同じユーザー・同じポリシー・同じコレクションで実測:
      //        capabilities 指定なし              → item create 201
      //        capabilities:{admin:["all"]}       → item create 403
      //        capabilities:{admin:["schema:read"]} → item create 403
      //        （同じユーザーの人間セッションでは 201。ポリシーは効いている）
      //      つまり `login --dev-login --admin`（= --admin-capability all）で取ったトークンでは
      //      スキーマは触れても items は触れない。**capability を足すと権限が減る**という、
      //      CLI のヘルプの説明（「items は capabilities を指定しなくても継承する」）とも
      //      食い違う挙動。司令塔へ報告済み。
      //      → ここでは **--admin を外して**取り直し、items 用のトークンにする。
      //         スキーマ操作は上で admin つきトークンを使って済ませてある。
      const reloginForItems = await cli([
        "login", "--dev-login", `${PREFIX}cli@example.com`, "--name", `${PREFIX}cli-items`,
      ]);
      assertions.push(
        assertion("positive", "権限付与後に login し直して items 用トークンを取れる",
          reloginForItems.code === EXIT.OK, `exit ${reloginForItems.code}`, "exit 0"),
      );
      details.push(
        "note: スキーマ操作用（--admin あり）と items 用（--admin なし）で**トークンを2本**使っています。" +
          "admin capability を持つトークンは items の権限を失うため（実測。詳細はこのファイルのコメント）。" +
          "1本のトークンで両方できるのが本来のはずで、司令塔へ報告済みです。",
      );
    }

    // アイテム作成 → 取得 → 更新 → 一覧
    const createItem = await cli([
      "item", "create", COLLECTION, "--data", JSON.stringify({ title: `${PREFIX}cli-1` }), "--json",
    ]);
    let itemId = null;
    try {
      const parsed = JSON.parse(createItem.stdout);
      itemId = parsed?.data?.id ?? parsed?.id ?? null;
    } catch { /* 下の assertion が拾う */ }
    assertions.push(
      assertion("positive", "item create が通って id が返る",
        createItem.code === EXIT.OK && Boolean(itemId),
        itemId ? "id あり" : `id なし (exit ${createItem.code})`, "id あり"),
    );

    if (itemId) {
      const getItem = await cli(["item", "get", COLLECTION, itemId, "--json"]);
      assertions.push(
        assertion("positive", "item get が通る", getItem.code === EXIT.OK, `exit ${getItem.code}`, "exit 0"),
      );

      const updateItem = await cli([
        "item", "update", COLLECTION, itemId, "--data", JSON.stringify({ title: `${PREFIX}cli-updated` }),
      ]);
      assertions.push(
        assertion("positive", "item update が通る", updateItem.code === EXIT.OK,
          `exit ${updateItem.code}`, "exit 0"),
      );
      const afterUpdate = await cli(["item", "get", COLLECTION, itemId, "--json"]);
      assertions.push(
        assertion("positive", "update した値が実際に反映されている",
          afterUpdate.stdout.includes(`${PREFIX}cli-updated`),
          afterUpdate.stdout.includes(`${PREFIX}cli-updated`) ? "反映されている" : "反映されていない",
          "反映されている"),
      );
    }

    const listItems = await cli([
      "item", "list", COLLECTION, "--count", "--sort", "title", "--limit", "10", "--json",
    ]);
    assertions.push(
      assertion("positive", "item list（--count --sort --limit）が通る",
        listItems.code === EXIT.OK, `exit ${listItems.code}`, "exit 0"),
    );
    const filtered = await cli([
      "item", "list", COLLECTION, "--filter",
      JSON.stringify({ title: { _eq: `${PREFIX}cli-updated` } }), "--json",
    ]);
    assertions.push(
      assertion("positive", "item list --filter が絞り込める",
        filtered.code === EXIT.OK && filtered.stdout.includes(`${PREFIX}cli-updated`),
        filtered.code === EXIT.OK ? "絞り込めた" : `exit ${filtered.code}`, "絞り込めた"),
    );

    const users = await cliAsAdmin(["user", "list", "--json"]);
    assertions.push(
      assertion("positive", "user list が通る（管理者のみ）", users.code === EXIT.OK,
        `exit ${users.code}`, "exit 0"),
    );

    // token 系は人間のセッションが要る
    const tokens = await cliAsHuman(["token", "list", "--json"]);
    assertions.push(
      assertion("positive", "token list が通る（人間のセッションで）", tokens.code === EXIT.OK,
        `exit ${tokens.code}`, "exit 0"),
    );

    const snapshot = await cliAsAdmin(["schema", "snapshot", "--out", snapshotPath]);
    let snapshotOk = false;
    if (existsSync(snapshotPath)) {
      try {
        JSON.parse(await readFile(snapshotPath, "utf8"));
        snapshotOk = true;
      } catch { /* 下で落ちる */ }
    }
    assertions.push(
      assertion("positive", "schema snapshot --out が JSON を書く",
        snapshot.code === EXIT.OK && snapshotOk,
        snapshotOk ? "JSON として読めた" : `exit ${snapshot.code} / ファイル不正`, "JSON として読めた"),
    );

    // ══ 否定形 ══

    const unreachable = await cli(["health"], { OHMYCMS_URL: "http://localhost:1" });
    assertions.push(
      assertion("negative", "繋がらない URL では exit 6",
        unreachable.code === EXIT.UNREACHABLE, `exit ${unreachable.code}`, `exit ${EXIT.UNREACHABLE}`),
    );

    const badToken = await cli(["whoami"], { OHMYCMS_TOKEN: "not-a-real-token" });
    assertions.push(
      assertion("negative", "不正なトークンでは exit 3（401）",
        badToken.code === EXIT.UNAUTHORIZED, `exit ${badToken.code}`, `exit ${EXIT.UNAUTHORIZED}`),
    );

    const badArgs = await cli(["item", "create"]);
    assertions.push(
      assertion("negative", "引数が足りなければ exit 2",
        badArgs.code === EXIT.BAD_ARGS, `exit ${badArgs.code}`, `exit ${EXIT.BAD_ARGS}`),
    );

    // 管理 capability の無いトークンで管理操作 → 4（403）
    // token create --json は {agent, token} を返す（--print-token は login 専用のフラグ）。
    // --admin-capability を渡していないので、このトークンでは管理操作が全部拒否される。
    const limited = await cliAsHuman(["token", "create", "--name", `${PREFIX}cli-limited`, "--json"]);
    let limitedToken = null;
    try {
      limitedToken = JSON.parse(limited.stdout)?.token ?? null;
    } catch { /* 下の assertion が拾う */ }
    assertions.push(
      assertion("negative", "管理 capability の無いトークンでは collection create が exit 4（403）",
        limitedToken
          ? (await cli(["collection", "create", `${COLLECTION}_denied`], { OHMYCMS_TOKEN: limitedToken })).code
              === EXIT.FORBIDDEN
          : false,
        limitedToken ? "403 で拒否" : `トークンを発行できず未確認 (exit ${limited.code})`,
        `exit ${EXIT.FORBIDDEN}`),
    );

    // 人間のセッション無しで token 系を叩く → 拒否される
    const tokenWithoutSession = await cli(["token", "list"]);
    assertions.push(
      assertion("negative", "人間のセッション無しでは token list が拒否される",
        tokenWithoutSession.code !== EXIT.OK, `exit ${tokenWithoutSession.code}`, "exit != 0"),
    );

    const missing = await cli(["item", "get", COLLECTION, "00000000-0000-4000-8000-000000000000"]);
    assertions.push(
      assertion("negative", "存在しない ID では exit 5（404）",
        missing.code === EXIT.NOT_FOUND, `exit ${missing.code}`, `exit ${EXIT.NOT_FOUND}`),
    );

    // 秘密が出ていないか
    assertions.push(
      assertion("negative", "token list に生トークンが出ない",
        !limitedToken || !tokens.stdout.includes(limitedToken),
        limitedToken && tokens.stdout.includes(limitedToken) ? "出ている" : "出ていない", "出ていない"),
    );

    const verdict = statusFromAssertions(assertions);
    return result({
      id: 4,
      title: "CLI で同じことができる",
      status: verdict.status,
      positive: `health/login/collection/field/item/user/token/schema すべて exit 0`,
      negative: `未到達 ${unreachable.code} / 401 ${badToken.code} / 引数 ${badArgs.code} / 404 ${missing.code}`,
      details: [...details, ...verdict.details],
      repro:
        verdict.status === "PASS"
          ? []
          : [
              "pnpm --filter @ohmycms/cli build",
              `OHMYCMS_URL=${baseUrl} node packages/cli/dist/index.js health`,
            ],
      assertions,
      ms: Date.now() - started,
    });
  } finally {
    // ── 後片付け ──
    await admin.delete(`/api/collections/${COLLECTION}`).catch(() => {});
    if (policyId) await admin.delete(`/api/policies/${policyId}`).catch(() => {});
    await rm(configHome, { recursive: true, force: true });
  }
}

export const meta = { id: 4, needsServer: true };
