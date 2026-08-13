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
 * 🚨 CLI は `~/.config/ohmycms/config.json` に認証情報を保存する。
 *    XDG_CONFIG_HOME を一時ディレクトリへ向けて、**利用者の設定を絶対に触らない**。
 *
 * ── 前提（2026-08-13 の CLI 変更を反映。ここを踏まないと肯定形が全部 403 になる）──
 *  1. `login --dev-login` は **人としてログインし、セッションを預かる**。
 *     トークンは発行しない。capabilities の絞り込みが無いので、`--admin` を付けた
 *     ユーザーなら items も管理操作もそのまま通る。
 *     （以前はここでエージェントトークンを発行していて、capabilities を指定した瞬間に
 *      items が全部 403 になる罠を踏んでいた。CLI 側で解消済み）
 *  2. `token create` / `token list` は **人間のセッションが必要**（エージェントトークン不可）。
 *     login --dev-login 済みなら、保存されたセッションをそのまま使う。
 *  3. **絞ったエージェントトークン**が要るときは `token create --collection-capability …`。
 *     許可したコレクションだけが読め、それ以外は 403 になる（このチェックの否定形の核心）。
 */

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PREFIX, TABLE_PREFIX } from "../lib/fixture.mjs";
import { Session } from "../lib/http.mjs";
import { establishSession } from "../lib/session.mjs";
import { run, REPO_ROOT } from "../lib/proc.mjs";
import { assertion, result, statusFromAssertions } from "../lib/result.mjs";

const COLLECTION = `${TABLE_PREFIX}cli_notes`;
/** 🚨 否定形を自明にしないための「見えてはいけないが実在する」コレクション。 */
const FORBIDDEN = `${TABLE_PREFIX}cli_secret`;
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
    const build = await run("bun", ["--filter", "@ohmycms/cli", "build"], { timeoutMs: 300_000 });
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
        repro: ["bun --filter @ohmycms/cli build"],
        ms: Date.now() - started,
      });
    }
  }

  // 🚨 利用者の ~/.config/ohmycms/config.json を汚さない。
  const configHome = await mkdtemp(join(tmpdir(), "ohmycms-acc-cli-"));
  const snapshotPath = join(configHome, "schema.json");

  // 下ごしらえ用の人間セッション（CLI とは別に、REST から検証用データを作る）
  // 開発ビルドなら dev-login、本番ビルドなら .env の管理者でパスワードログイン
  const auth = await establishSession(baseUrl, { label: `${PREFIX}cli-admin`, admin: true });
  if (!auth.ok) {
    await rm(configHome, { recursive: true, force: true });
    return result({
      id: 4,
      title: "CLI で同じことができる",
      status: "BLOCKED",
      reason: auth.reason,
      details: ["CLI の検証には人間のセッションが要ります。", ...auth.detail],
      repro: [`bun run acceptance --only 4 --base-url ${baseUrl}`],
      ms: Date.now() - started,
    });
  }
  const admin = auth.session;
  const isDevBuild = auth.method === "dev-login";
  const sessionToken = admin.cookies.get("session") ?? "";
  details.push(`ログイン方式: ${auth.method}`);

  /**
   * CLI を1回叩く。認証は一時 config から解決させる。
   * 🚨 **本番ビルドでは CLI が `login --dev-login` を使えない**（サーバ側に無い）。
   *   代わりに **人間のセッションを環境変数で渡す**（CLI がその経路を持っている）。
   *   これが無いと、本番では CLI の受入を1つも測れない。
   */
  const cli = (args, extraEnv = {}) =>
    run("node", [entry, ...args], {
      timeoutMs: 120_000,
      env: {
        XDG_CONFIG_HOME: configHome,
        OHMYCMS_URL: baseUrl,
        ...(isDevBuild ? {} : { OHMYCMS_SESSION_TOKEN: sessionToken }),
        ...extraEnv,
      },
    });

  try {
    // ══ 肯定形 ══

    const health = await cli(["health"]);
    assertions.push(
      assertion("positive", "ohmycms health が通る", health.code === EXIT.OK, `exit ${health.code}`, "exit 0"),
    );

    // 🚨 --red 4 のときは「管理者ポリシーを持たないユーザー」でログインする。
    //    その場合、以降のスキーマ操作も items も権限が無く落ちる。FAIL になるのが正しい。
    //
    //    🚨 **--admin を外すだけでは RED にならない。** dev-login の ?admin=true は
    //    directus_access に行を足すので、一度でも --admin で入ったユーザーは
    //    以後ずっと管理者のまま（後から --admin を外しても権限は消えない）。
    //    実測: GREEN を1回走らせた後の --red 4 が PASS のままだった。
    //    → RED では**メールアドレスごと変えて、まっさらなユーザー**を使う。
    const loginEmail = sabotage ? `${PREFIX}cli-red@example.com` : `${PREFIX}cli@example.com`;
    const loginArgs = ["login", "--dev-login", loginEmail];
    if (!sabotage) loginArgs.push("--admin");
    if (sabotage) {
      details.push(
        `⚠ --red 4 が指定されているため、管理者ポリシーを持たないユーザー（${loginEmail}）で` +
          "ログインしています。この実行結果は FAIL になるのが正しい。",
      );
    }
    // 🚨 `login --dev-login` は**開発ビルドにしか無い経路**。
    //   本番では代わりに、渡した人間のセッションで動くことを見る（下の whoami で確認する）。
    if (isDevBuild) {
      const login = await cli(loginArgs);
      assertions.push(
        assertion("positive", "ohmycms login --dev-login が通る", login.code === EXIT.OK,
          `exit ${login.code}`, "exit 0"),
      );
    } else {
      details.push(
        "本番ビルドなので login --dev-login は使えない（サーバ側に無い）。" +
          "人間のセッションを OHMYCMS_SESSION_TOKEN で渡して測っている。",
      );
    }

    // 🚨 login --dev-login は**トークンを発行せずセッションを保存する**（2026-08-13 の変更）。
    //    ここを確かめておかないと、「保存されたのは何か」が曖昧なまま以降が進む。
    let savedKind = null;
    let cliUserId = null;
    try {
      const saved = JSON.parse(await readFile(join(configHome, "ohmycms", "config.json"), "utf8"));
      savedKind = saved?.sessionToken ? "human" : saved?.token ? "agent" : null;
    } catch { /* 下の assertion が拾う */ }
    if (isDevBuild) {
      assertions.push(
        assertion("positive", "login --dev-login が人間のセッションを保存する（トークンではない）",
          savedKind === "human", savedKind ?? "何も保存されていない", "human"),
      );
    }

    const whoami = await cli(["whoami", "--json"]);
    try {
      const actor = JSON.parse(whoami.stdout)?.actor;
      cliUserId = actor?.type === "human" ? actor.userId : (actor?.onBehalfOf ?? null);
    } catch { /* 下の assertion が拾う */ }
    assertions.push(
      assertion("positive", "ohmycms whoami がユーザーまで答える",
        whoami.code === EXIT.OK && Boolean(cliUserId),
        cliUserId ? "ユーザーあり" : `取れず (exit ${whoami.code})`, "ユーザーあり"),
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

    const users = await cli(["user", "list", "--json"]);
    assertions.push(
      assertion("positive", "user list が通る（管理者のみ）", users.code === EXIT.OK,
        `exit ${users.code}`, "exit 0"),
    );

    // token 系は人間のセッションが要る。login --dev-login 済みなのでそのまま通るはず。
    const tokens = await cli(["token", "list", "--json"]);
    assertions.push(
      assertion("positive", "token list が通る（保存済みのセッションで。--session-token 不要）",
        tokens.code === EXIT.OK, `exit ${tokens.code}`, "exit 0"),
    );

    const snapshot = await cli(["schema", "snapshot", "--out", snapshotPath]);
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

    // ══ 絞ったトークンの肯定形 → 否定形（①②③。基準5・8 と同じ作法） ══
    //
    // 🚨 「許可されていないコレクションが読めない」は、そのコレクションが無ければ常に真になる。
    //    順番を守る:
    //      ① 見えてはいけない側のコレクションを**実際に作って行を入れる**
    //      ② 絞ったトークンで**許可された側は読める**（＝トークンは生きている）
    //      ③ そのうえで**許可されていない側が読めない**
    const createForbidden = await cli(["collection", "create", FORBIDDEN, "--field", "title:string"]);
    await cli(["item", "create", FORBIDDEN, "--data", JSON.stringify({ title: "見えてはいけない行" })]);
    assertions.push(
      assertion("positive", `否定形の前提: ${FORBIDDEN} が実在して行が入っている`,
        createForbidden.code === EXIT.OK, `exit ${createForbidden.code}`, "exit 0"),
    );

    // 許可を COLLECTION だけに絞ったエージェントトークンを発行する
    const scoped = await cli([
      "token", "create", "--name", `${PREFIX}cli-scoped`, "--json",
      "--collection-capability", `${COLLECTION}:read`,
    ]);
    let scopedToken = null;
    try {
      scopedToken = JSON.parse(scoped.stdout)?.token ?? null;
    } catch { /* 下の assertion が拾う */ }
    assertions.push(
      assertion("positive", "token create --collection-capability で絞ったトークンを発行できる",
        Boolean(scopedToken), scopedToken ? "発行できた" : `発行できず (exit ${scoped.code})`, "発行できた"),
    );

    const scopedEnv = scopedToken ? { OHMYCMS_TOKEN: scopedToken } : {};
    const scopedAllowed = scopedToken ? await cli(["item", "list", COLLECTION, "--json"], scopedEnv) : null;
    assertions.push(
      assertion("positive", `絞ったトークンで ${COLLECTION} は読める`,
        scopedAllowed?.code === EXIT.OK,
        scopedAllowed ? `exit ${scopedAllowed.code}` : "トークンが無く未確認", "exit 0"),
    );

    const scopedForbidden = scopedToken ? await cli(["item", "list", FORBIDDEN], scopedEnv) : null;
    assertions.push(
      assertion("negative", `絞ったトークンで ${FORBIDDEN} は読めない（行は実在する）`,
        scopedForbidden?.code === EXIT.FORBIDDEN,
        scopedForbidden ? `exit ${scopedForbidden.code}` : "トークンが無く未確認",
        `exit ${EXIT.FORBIDDEN}`),
    );

    // ══ そのほかの否定形 ══

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

    const badFlag = await cli(["health", "--jsno"]);
    assertions.push(
      assertion("negative", "打ち間違えたフラグは黙って無視せず exit 2",
        badFlag.code === EXIT.BAD_ARGS, `exit ${badFlag.code}`, `exit ${EXIT.BAD_ARGS}`),
    );

    // 管理 capability の無いトークンで管理操作 → exit 4（403 CAPABILITY_DENIED）
    const limitedDenied = scopedToken
      ? await cli(["collection", "create", `${COLLECTION}_denied`], scopedEnv)
      : null;
    assertions.push(
      assertion("negative", "管理 capability の無いトークンでは collection create が exit 4（403）",
        limitedDenied?.code === EXIT.FORBIDDEN,
        limitedDenied ? `exit ${limitedDenied.code}` : "トークンが無く未確認", `exit ${EXIT.FORBIDDEN}`),
    );

    // token 系はエージェントトークンでは実行できない（人間のセッションが要る）
    const tokenAsAgent = scopedToken ? await cli(["token", "list"], scopedEnv) : null;
    assertions.push(
      assertion("negative", "エージェントトークンでは token list が exit 3（人間のセッションが要る）",
        tokenAsAgent?.code === EXIT.UNAUTHORIZED,
        tokenAsAgent ? `exit ${tokenAsAgent.code}` : "トークンが無く未確認", `exit ${EXIT.UNAUTHORIZED}`),
    );

    const missing = await cli(["item", "get", COLLECTION, "00000000-0000-4000-8000-000000000000"]);
    assertions.push(
      assertion("negative", "存在しない ID では exit 5（404）",
        missing.code === EXIT.NOT_FOUND, `exit ${missing.code}`, `exit ${EXIT.NOT_FOUND}`),
    );

    // 秘密が出ていないか
    assertions.push(
      assertion("negative", "token list に生トークンが出ない",
        !scopedToken || !tokens.stdout.includes(scopedToken),
        scopedToken && tokens.stdout.includes(scopedToken) ? "出ている" : "出ていない", "出ていない"),
    );

    const verdict = statusFromAssertions(assertions);
    return result({
      id: 4,
      title: "CLI で同じことができる",
      status: verdict.status,
      positive: "health/login/collection/field/item/user/token/schema すべて exit 0",
      negative:
        `絞ったトークンで他コレクション ${scopedForbidden?.code ?? "-"} / ` +
        `未到達 ${unreachable.code} / 401 ${badToken.code} / 引数 ${badArgs.code} / 404 ${missing.code}`,
      details: [...details, ...verdict.details],
      repro:
        verdict.status === "PASS"
          ? []
          : [
              "bun --filter @ohmycms/cli build",
              `OHMYCMS_URL=${baseUrl} node packages/cli/dist/index.js health`,
            ],
      assertions,
      ms: Date.now() - started,
    });
  } finally {
    // ── 後片付け ──
    for (const collection of [COLLECTION, FORBIDDEN, `${COLLECTION}_denied`]) {
      await admin.delete(`/api/collections/${collection}`).catch(() => {});
    }
    await rm(configHome, { recursive: true, force: true });
  }
}

export const meta = { id: 4, needsServer: true };
