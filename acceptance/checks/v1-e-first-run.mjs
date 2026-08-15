/**
 * V1-E: **初回起動**（新規インストールで初期設定を終えられる）  担当 onboard(w4A:p2A)
 *
 * 🚨 **なぜ機械で見るしかないか。**
 * 2026-08-15、`7b923d9` がフォームからだけ `tenant_name` を外し、API 側の必須検証を残した。
 * 結果 **「はじめる」も「あとで」も 400** になり、**新規インストールでは初期設定を一度も終えられない**
 * 状態が **約10時間** 続いた。誰も踏まなかった理由が本題:
 *
 *   :3101 / :3102 / :3103 は どれも `onboarding_completed_at` が入っている
 *     → `/onboarding` は 307 で `/admin` へ飛ぶ
 *     → **共有環境では、誰もこの画面に到達できない**
 *   Storybook の story は **API に届かない**（送信は必ず失敗するので成功経路が測れない）
 *
 * ＝ **人が踏めない経路**。だから毎回、**初回状態の使い捨てインスタンスを立てて**測る。
 * 手順の全文と落とし穴は `docs/verify/first-run-environment.md`。
 *
 * 測るもの（肯定形と否定形を必ずセットで）:
 *   🟢 初回状態で `/onboarding` が **200**（＝画面に到達できる）
 *   🟢 「あとで」（詳細を送らない）で **200**
 *   🟢 「はじめる」（詳細を送る・`tenant_name` は送らない）で **200**
 *   🟢 `directus_sessions.auth_method = 'onboarding'` が **1 件**（この経路でしか入らない）
 *   🔴 完了後は同じ POST が **409**（＝初回だけ、が守られている）
 *   🔴 完了後は `/onboarding` が **200 ではない**（307 で `/admin` へ飛ぶ）
 *
 * 🚨 **対照**: `auth_method` は完了後のログインで `setup` も入る。
 *   **片方だけ増えた**ことまで見て、初めて「配線ではなく経路が動いた」と言える。
 *
 * 🚨 **共有（:3101 / :3102 / :3103 / :5436）には一切触らない。**
 *   使い捨ての Postgres(:5437) と worktree(:3110) を立て、**finally で必ず落とす**。
 *
 * ## 🚨 この検査が**見ていない範囲**（司令塔 2026-08-15「守り手の穴も1行添える」）
 *
 *   ❌ **画面（DOM）は見ていない。** 見ているのは **HTTP の応答と DB の値**だけ。
 *      ボタンの文言・段の数・幅・読み上げ名が壊れても、ここは緑のまま
 *   ❌ **ロゴのアップロードは通していない**（成功経路は 2026-08-15 に手で1回通しただけ）
 *   ❌ **完了画面のリンク先を押していない**（同上。押して 200 を見たのは手作業の1回だけ）
 *   ❌ **400 のときの文言**（`failed_input` / `failed_conflict`）が出るかは見ていない
 *   ❌ **開発ビルドでしか測っていない**。本番ビルド（Docker）では一度も走っていない
 *   ❌ **同時に2本走らせられない**（:3110 / :5437 / コンテナ名が固定）。
 *      並列が要るなら引数化が必要
 *
 * ＝ **緑は「初期設定を API として終えられる」までを言います。**
 * **「初回体験が壊れていない」までは言いません。**
 *
 * ## 🚨 実測した壊し方（司令塔 2026-08-15「2 通りは下限。守る失敗の種類の数だけ要る」）
 *
 *   🔥 **壊し方1: `validate()` へオブジェクトリテラルを戻す**（2026-08-15 の実事故と同じ形）
 *      → **exit=1**。「あとで」400 ／「はじめる」400 を名指しした
 *   🔥 **壊し方2: `ONBOARDING_INPUT_KEYS` を空にする**（＝送っても何も保存されない）
 *      → **exit=1**。`[肯定形] 送った項目が保存されている: 期待 OhMyCMS / 実測 (null)`
 *      🚨 **こちらは API が 200 を返す**。**「成功したのに何も保存されない」形**で、
 *         **静的検査（check-onboarding-contract）は exit=0 で素通り**した（実測）。
 *         **この検査が要る理由が、この 1 件に出ている。**
 *
 * 🚨 **壊し方2 で効いたのは「送った項目が保存されている」の 1 行だけ**です。
 *    HTTP の 200 だけを見ていたら、**両方とも緑**でした。
 *    **状態を返す API では、応答コードと保存結果を必ず両方見ること。**
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { run, dockerAvailable } from "../lib/proc.mjs";
import { assertion, result, statusFromAssertions, STATUS } from "../lib/result.mjs";

const ID = 14;
const TITLE = "V1-E 初回起動（新規インストールで初期設定を終えられる）";

const PORT = 3110; // knowledge/decisions/port-allocation.md:56「worktree の開発サーバ 1 本目」
const DB_PORT = 5437; // 共有の 5436 とは別
const CONTAINER = "ohmycms-acc-first-run";
/**
 * 🚨 **この検査は破壊的な UPDATE / DELETE を実行する。**
 * 守っているものを1行で言えるようにする（司令塔 2026-08-15「注意書きは守りではない」）:
 *
 * **守り: `docker run` が返した ID にしか話しかけない。**
 * 名前（`CONTAINER`）は**表示のためだけ**に使う。ID は**この実行で作ったコンテナにしか存在しない**ので、
 * 既にある共有 DB（`ohmycms-db` / :5436）へは**構造的に届かない**。
 *
 * 🚨 **以前は「名前が違うから安全」だった**——それは注意書きであって守りではない。
 * 定数を1つ書き換えれば、共有設定へ `update ohmycms_settings set setup_password = null` が飛ぶ。
 * **2026-08-15 に人間が手で同じことをして、堀池さんのログインを壊している。**
 * ⚠️ **この守りの RED は未発火**（形で塞いだだけで、破られた実例はまだ無い）。
 */
let createdId = null;
const REPO = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const WORKTREE = `${REPO}-acc-first-run`;
const SETUP_PASSWORD = "pass132"; // OHMYCMS_SETUP_PASSWORD 未設定時の既定
const NEW_PASSWORD = "acc-first-run-9182";
/**
 * 測る対象の版。既定は HEAD。
 * 🚨 **RED を測るためだけに在る。** 退行を入れたコミットを指して、
 *    **この検査が本当に赤くなること**を確かめる（緑しか見ていない検査は「何も言っていない」）。
 *    通常運用では指定しない。
 */
const REF = process.env.OHMYCMS_FIRST_RUN_REF || "HEAD";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function portBusy(port) {
  const r = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  return r.stdout.trim().length > 0;
}

async function psql(sql) {
  // 🚨 ID が無いなら**何もしない**。名前で代用しない（それが以前の穴だった）。
  if (!createdId) {
    throw new Error(
      "この実行で作ったコンテナの ID がありません。**共有 DB へ話しかけないため、ここで止めます**。" +
        `（SQL: ${sql.slice(0, 60)}…）`,
    );
  }
  const r = await run("docker", ["exec", createdId, "psql", "-U", "cms", "-d", "cms", "-At", "-c", sql]);
  return r.code === 0 ? r.stdout.trim() : `ERR:${r.code}:${r.stderr.trim().slice(0, 200)}`;
}

async function post(path, body, cookie) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "manual",
  });
  // Set-Cookie から名前=値 だけを取り出す（値そのものはどこにも出さない）
  const raw = res.headers.getSetCookie?.() ?? [];
  const jar = raw.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, jar };
}

async function teardown(details) {
  const pid = await run("bash", ["-lc", `lsof -nP -iTCP:${PORT} -sTCP:LISTEN | awk 'NR==2{print $2}'`]);
  const target = pid.stdout.trim();
  if (target) await run("kill", ["-TERM", target]);
  await sleep(2000);
  // 片付けも ID で。作っていないなら何も消さない（他人のコンテナを消さないため）。
  const rm = createdId
    ? await run("docker", ["rm", "-f", createdId])
    : { code: 0, stdout: "", stderr: "(この実行では作っていないので、何も消していません)" };
  const wt = await run("git", ["-C", REPO, "worktree", "remove", "--force", WORKTREE]);
  // 🚨 「落とした」を 000 だけで言わない。共有が無事であることも並べる。
  const gone = !(await portBusy(PORT));
  details.push(
    `片付け: container rm exit=${rm.code} / worktree remove exit=${wt.code} / ` +
      `:${PORT} は${gone ? "落ちている" : "🚨 まだ掴まれている"}`,
  );
}

export async function check(context) {
  const startedAt = Date.now();
  const details = [];
  // 🚨 何を測ったか。worktree を作る直前に確定させ、**PASS の行にも出す**（下の positive を参照）。
  let measuredRef = `既定 HEAD`;
  const repro = [
    "手順の全文と落とし穴: docs/verify/first-run-environment.md",
    `node acceptance/run.mjs --v1 --only ${ID}`,
    `RED を測る: OHMYCMS_FIRST_RUN_REF=<退行を入れたコミット> node acceptance/run.mjs --v1 --only ${ID}`,
  ];

  const docker = await dockerAvailable();
  if (!docker.ok) {
    return result({
      id: ID, title: TITLE, status: STATUS.BLOCKED,
      reason: "Docker が使えないので、初回状態のインスタンスを立てられません（PASS にはしません）",
      repro,
    });
  }
  if (await portBusy(PORT)) {
    return result({
      id: ID, title: TITLE, status: STATUS.BLOCKED,
      reason: `:${PORT} が使用中です。他の worktree の開発サーバが掴んでいる可能性があります（PASS にはしません）`,
      repro,
    });
  }
  if (await portBusy(DB_PORT)) {
    return result({
      id: ID, title: TITLE, status: STATUS.BLOCKED,
      reason: `:${DB_PORT} が使用中です（PASS にはしません）`,
      repro,
    });
  }
  if (existsSync(WORKTREE)) {
    return result({
      id: ID, title: TITLE, status: STATUS.BLOCKED,
      reason: `${WORKTREE} が残っています。前回の片付けが終わっていない可能性があります（PASS にはしません）`,
      repro,
    });
  }

  const assertions = [];
  try {
    // ── 立てる ──
    const up = await run("docker", [
      "run", "-d", "--name", CONTAINER,
      "-e", "POSTGRES_USER=cms", "-e", "POSTGRES_PASSWORD=cms", "-e", "POSTGRES_DB=cms",
      "-p", `${DB_PORT}:5432`, "postgres:17",
    ]);
    createdId = up.stdout.trim().split("\n").pop() ?? null;
    if (up.code !== 0 || !createdId) {
      return result({
        id: ID, title: TITLE, status: STATUS.BLOCKED,
        reason: `使い捨て Postgres を起動できませんでした（exit ${up.code}）`,
        details: [up.stderr.slice(-400)], repro,
      });
    }
    for (let i = 0; i < 60; i++) {
      const ready = await run("docker", ["exec", createdId, "pg_isready", "-U", "cms"]);
      if (ready.code === 0) break;
      await sleep(1000);
    }

    // 🚨 **何を測ったかを、必ず報告に出す。**
    //    `REF` の既定は `|| "HEAD"` なので、**環境変数名を打ち間違えると黙って HEAD を測る**。
    //    実測（2026-08-16）: `OHMYCMS_FIRSTRUN_REF=deadbeef`（`_` の位置違い）→ REF は **HEAD**。
    //      🟢 対照 `OHMYCMS_FIRST_RUN_REF=7b923d9` → REF は **7b923d9**
    //    ＝ 🚨 **RED を測ったつもりで HEAD を測り、PASS を見て「退行を捕まえられない」と読む。**
    //       この検査を信じてよいかの根拠が、そこで壊れる。
    //    そこで **解決後の sha と、既定に落ちたかどうか**を毎回 details へ出す。
    const refSha = await run("git", ["-C", REPO, "rev-parse", "--short", REF]);
    measuredRef = process.env.OHMYCMS_FIRST_RUN_REF
      ? `指定 ${REF}${refSha.code === 0 ? `=${refSha.stdout.trim()}` : ""}`
      : `既定 HEAD${refSha.code === 0 ? `=${refSha.stdout.trim()}` : ""}`;
    details.push(
      `測る対象: ${measuredRef}` +
        (process.env.OHMYCMS_FIRST_RUN_REF ? "" : "（RED を測るなら OHMYCMS_FIRST_RUN_REF を設定）"),
    );

    const wt = await run("git", ["-C", REPO, "worktree", "add", WORKTREE, REF, "--detach"]);
    if (wt.code !== 0) {
      await teardown(details);
      return result({
        id: ID, title: TITLE, status: STATUS.BLOCKED,
        reason: `worktree を作れませんでした（exit ${wt.code}）`,
        details: [...details, wt.stderr.slice(-400)], repro,
      });
    }
    writeFileSync(
      join(WORKTREE, "apps/studio/.env.local"),
      `DATABASE_URL=postgres://cms:cms@localhost:${DB_PORT}/cms\nALLOW_DEV_LOGIN=1\n`,
    );

    const install = await run("bun", ["install", "--frozen-lockfile"], { cwd: WORKTREE });
    const migrate = await run("bun", ["run", "migrate"], { cwd: join(WORKTREE, "apps/studio") });
    if (install.code !== 0 || migrate.code !== 0) {
      await teardown(details);
      return result({
        id: ID, title: TITLE, status: STATUS.BLOCKED,
        reason: `依存かスキーマの用意に失敗（install exit=${install.code} / migrate exit=${migrate.code}）`,
        details, repro,
      });
    }

    run("bash", ["-lc",
      `cd ${JSON.stringify(join(WORKTREE, "apps/studio"))} && ` +
      `nohup bun x next dev --port ${PORT} > /dev/null 2>&1 < /dev/null &`,
    ]);
    let reachable = false;
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`http://localhost:${PORT}/login`, { redirect: "manual" }).catch(() => null);
      if (res?.status === 200) { reachable = true; break; }
      await sleep(2000);
    }
    if (!reachable) {
      await teardown(details);
      return result({
        id: ID, title: TITLE, status: STATUS.BLOCKED,
        reason: `開発サーバが :${PORT} で 200 を返しませんでした（**測れていない**のであって、初期設定が壊れているのではありません）`,
        details, repro,
      });
    }

    // 🚨 本当に初回状態か（ここを飛ばすと、共有環境と同じものを測ることになる）
    const completedRows = await psql(
      "select count(*) from ohmycms_settings where onboarding_completed_at is not null;",
    );
    if (completedRows !== "0") {
      await teardown(details);
      return result({
        id: ID, title: TITLE, status: STATUS.BLOCKED,
        reason: `初回状態ではありません（完了フラグが入った行 = ${completedRows}）。この状態で測っても意味がありません`,
        details, repro,
      });
    }
    details.push(`初回状態の確認: 完了フラグが入った行 = ${completedRows}`);

    // ── 🟢 肯定形 ──
    const onboardingBefore = await fetch(`http://localhost:${PORT}/onboarding`, { redirect: "manual" });
    assertions.push(assertion(
      "positive", "初回状態で /onboarding に到達できる",
      onboardingBefore.status === 200 || onboardingBefore.status === 307,
      onboardingBefore.status, "200 か 307（未認証なら /login へ）",
    ));

    // 「あとで」= 詳細を送らない
    const s1 = await post("/api/auth/setup", { password: SETUP_PASSWORD });
    const later = await post(
      "/api/onboarding",
      { new_password: NEW_PASSWORD, default_locale: "ja" },
      s1.jar,
    );
    assertions.push(assertion(
      "positive", "「あとで」（詳細を送らない）で初期設定を終えられる",
      later.status === 200, later.status, 200,
    ));

    const method1 = await psql(
      "select coalesce(auth_method,'(null)') from directus_sessions order by 1;",
    );
    assertions.push(assertion(
      "positive", "auth_method に onboarding が記録される（この経路でしか入らない）",
      method1.split("\n").includes("onboarding"), method1.replace(/\n/g, ","), "onboarding を含む",
    ));

    // ── 🔴 否定形: 二度目は通らない ──
    const again = await post(
      "/api/onboarding",
      { new_password: NEW_PASSWORD, default_locale: "ja" },
      s1.jar,
    );
    assertions.push(assertion(
      "negative", "完了後にもう一度送っても通らない（409）",
      again.status === 409, again.status, 409,
    ));

    const onboardingAfter = await fetch(`http://localhost:${PORT}/onboarding`, { redirect: "manual" });
    assertions.push(assertion(
      "negative", "完了後は /onboarding が 200 にならない（画面が残らない）",
      onboardingAfter.status !== 200, onboardingAfter.status, "200 以外",
    ));

    // ── 「はじめる」（詳細を送る）も通ることを、初回へ戻して測る ──
    // 🚨 「あとで」だけ測ると 2026-08-15 の穴を見逃す（あのとき 400 の理由が両者で違った）
    await psql("update ohmycms_settings set onboarding_completed_at=null, setup_password=null;");
    await psql("delete from directus_users where email='local-admin@localhost';");
    const s2 = await post("/api/auth/setup", { password: SETUP_PASSWORD });
    const start = await post(
      "/api/onboarding",
      { new_password: NEW_PASSWORD, default_locale: "ja", project_name: "OhMyCMS", project_logo: "" },
      s2.jar,
    );
    assertions.push(assertion(
      "positive", "「はじめる」（詳細を送る・tenant_name は送らない）で初期設定を終えられる",
      start.status === 200, start.status, 200,
    ));

    const saved = await psql("select coalesce(project_name,'(null)') from ohmycms_settings;");
    assertions.push(assertion(
      "positive", "送った項目が保存されている",
      saved === "OhMyCMS", saved, "OhMyCMS",
    ));

    details.push(`所要: ${Math.round((Date.now() - startedAt) / 1000)} 秒（立ち上げ・測定・片付けを含む）`);
  } catch (error) {
    details.push(`例外: ${error?.stack ?? error}`);
    await teardown(details);
    return result({ id: ID, title: TITLE, status: STATUS.FAIL, details, repro, assertions });
  }

  await teardown(details);

  const verdict = statusFromAssertions(assertions);
  return result({
    id: ID,
    title: TITLE,
    status: verdict.status,
    // 🚨 **何を測ったか（`measuredRef`）を、PASS のときにも見える列へ出す。**
    //    `details` は **FAIL / BLOCKED のときしか表示されない**（実測 2026-08-16）。
    //    ところが「REF を打ち間違えて HEAD を測ってしまった」は **PASS で終わる**ので、
    //    details に書いても**いちばん要る場面で見えない**。だからここに置く。
    positive: `[${measuredRef}] 初回 /onboarding 到達・「あとで」「はじめる」とも 200・auth_method=onboarding`,
    negative: `二度目は 409 ／ 完了後の /onboarding は 200 にならない`,
    details: [...details, ...verdict.details],
    repro,
    assertions,
    ms: Date.now() - startedAt,
  });
}
