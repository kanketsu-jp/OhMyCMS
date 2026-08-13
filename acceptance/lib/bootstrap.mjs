/**
 * **本番ビルドで検証用の利用者を用意する**ための最小のブートストラップ。
 *
 * 🚨 なぜ DB を直接触るのか（線の引き方）:
 *   本番ビルドには **dev-login も、利用者を作る API も無い**。
 *   だが受入基準8 は「**管理者でない利用者が2人**」要る（A と B が別人でないと
 *   「他人の行」を作れない）。そこで **身元の用意だけ** DB で行う。
 *
 *   ✅ DB でやってよいこと … **利用者行**と**セッション行**の作成（＋管理者を1人作るための
 *      ポリシー割当）。これは「その人が存在する」という**前提**を置いているだけで、
 *      **権限の判定ロジックには一切触れていない**
 *   ❌ DB でやってはいけないこと … **検証対象の権限**（policies / permissions / access）を入れること。
 *      それをやると `requireAdmin` などの**判定を通らずに**通してしまい、**偽の合格**になる
 *      → 検証対象の権限は**必ず API 経由**で作る
 *
 *   この線は F0c で司令塔が引いたもの。infra の `.temp/2026-08-13/f0c/f0c-prod-verify.sh` が原典で、
 *   本番ビルド（NODE_ENV=production）に対して実際に測れている。
 *   🚨 `.temp/` に置いたままだと書いた本人がいなくなった時点で失われるので、ここへ移した。
 *
 * セッションの作り方は `apps/studio/lib/auth/sessions.ts` の `issueSession` と同じ形:
 *   **生トークンを Cookie に入れ、DB には sha256 を入れる。**
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Session } from "./http.mjs";
import { run } from "./proc.mjs";

/** DB コンテナ名。compose.yml が container_name を固定している */
const DB_CONTAINER = "ohmycms-db";

/** ブートストラップで作った管理者ポリシーの名前（後片付けの目印） */
export const BOOTSTRAP_POLICY = "acc-bootstrap-admin";

async function psql(sql) {
  const result = await run(
    "docker",
    ["exec", DB_CONTAINER, "psql", "-U", "cms", "-d", "cms", "-tA", "-c", sql],
    { timeoutMs: 30_000 },
  );
  return { ok: result.code === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

/** DB を触れるか。触れないなら、その理由を返す */
export async function bootstrapAvailable() {
  const probe = await psql("select 1;");
  if (probe.ok) return { ok: true };
  return {
    ok: false,
    reason: `DB コンテナ（${DB_CONTAINER}）に psql で入れません`,
    detail: [
      "本番ビルドで利用者を用意するには DB へのブートストラップが要ります。",
      "docker が使えない環境（CI の一部など）では、この項目は判定できません。",
      (probe.err || probe.out).split("\n")[0] ?? "",
    ].filter(Boolean),
  };
}

/**
 * 利用者を1人作り、ログイン済みの Session を返す。
 *
 * @param {string} baseUrl
 * @param {object} options
 * @param {string} options.email  作る利用者のメール（後片付けの目印になる接頭辞をつけること）
 * @param {boolean} [options.admin]  管理者にするか（ポリシー割当まで行う）
 * @returns {Promise<{ok:true, session: Session, userId: string} | {ok:false, reason:string, detail:string[]}>}
 */
export async function bootstrapUser(baseUrl, { email, admin = false }) {
  if (!/^[A-Za-z0-9._@-]+$/.test(email)) {
    return { ok: false, reason: `ブートストラップに使えないメールです: ${email}`, detail: [] };
  }

  const userId = randomUUID();
  // 生トークンは Cookie へ。DB には sha256 を入れる（issueSession と同じ形）
  const rawToken = randomBytes(32).toString("base64url").slice(0, 43);
  const hashed = createHash("sha256").update(rawToken).digest("hex");

  const inserted = await psql(
    `insert into directus_users
       (id, first_name, last_name, email, password, status, role, token,
        last_access, provider, external_identifier, auth_data)
     values
       ('${userId}', null, null, '${email}', null, 'active', null, null,
        now(), 'acceptance', 'acceptance:${email}', null);`,
  );
  if (!inserted.ok) {
    return {
      ok: false,
      reason: "検証用の利用者を作れませんでした",
      detail: [(inserted.err || inserted.out).split("\n")[0] ?? ""],
    };
  }

  if (admin) {
    // 🚨 管理者を1人作るところまでがブートストラップ。
    //   これが無いと管理 API を1つも叩けず、**検証対象の権限を API で作れない**。
    //   判定そのもの（requireAdmin → hasAdminAccess）は API 側で走る。
    let policyId = (await psql(
      `select id from directus_policies where name='${BOOTSTRAP_POLICY}';`,
    )).out;
    if (!policyId) {
      policyId = randomUUID();
      await psql(
        `insert into directus_policies
           (id, name, description, ip_access, app_access, admin_access, enforce_tfa)
         values ('${policyId}','${BOOTSTRAP_POLICY}','受入ハーネスのブートストラップ用',null,true,true,false);`,
      );
    }
    await psql(
      `insert into directus_access (id, role, "user", policy, sort)
       values ('${randomUUID()}', null, '${userId}', '${policyId}', null);`,
    );
  }

  const session = await psql(
    `insert into directus_sessions (token, "user", expires, ip, user_agent, data, origin, next_token)
     values ('${hashed}', '${userId}', now() + interval '1 day', null, 'acceptance', null, '${baseUrl}', null);`,
  );
  if (!session.ok) {
    return {
      ok: false,
      reason: "検証用のセッションを作れませんでした",
      detail: [(session.err || session.out).split("\n")[0] ?? ""],
    };
  }

  const httpSession = new Session(baseUrl, email);
  httpSession.cookies.set("session", rawToken);
  return { ok: true, session: httpSession, userId };
}

/**
 * ブートストラップで作ったものを消す。
 * 🚨 **利用者行は API から消せない**ので、ここで消すしかない。
 *   接頭辞で作っておき、まとめて消す。
 */
export async function cleanupBootstrap(emailPrefix) {
  if (!/^[A-Za-z0-9._-]+$/.test(emailPrefix)) return;
  // セッション → access → 利用者 の順（外部キーの向き）
  await psql(
    `delete from directus_sessions where "user" in
       (select id from directus_users where email like '${emailPrefix}%');`,
  );
  await psql(
    `delete from directus_access where "user" in
       (select id from directus_users where email like '${emailPrefix}%');`,
  );
  await psql(`delete from directus_users where email like '${emailPrefix}%';`);
  await psql(`delete from directus_policies where name='${BOOTSTRAP_POLICY}';`);
}
