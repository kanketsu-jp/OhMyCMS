/**
 * V1-A: **SAML（SSO）**  担当 saml(w4A:pG)
 *
 * 実測の中身は `acceptance/saml/` のスクリプトが持つ（saml が書いたもの）。
 * 🚨 元は `.temp/2026-08-14/saml/` にあった。**`.temp/` は掃除で消える**ので
 *   `acceptance/saml/` へ移した（送信スクリプトを `.temp/` に置いて失った前例と同じ轍）。
 *   あわせて**対象 URL を `STUDIO` で差し替えられる**ようにした（元は :3102 決め打ち）。
 *   おかげで**受入の対象（:3103・焼き込んだ版）そのもの**で測れる。
 *   dev サーバー（:3102）は他のペインが触るので、そこに依存すると測定が止まる（実際に 500 で止まった）。
 *
 * 測るもの:
 *   🟢 **ログインの往復が通る**（AuthnRequest → Keycloak で認証 → ACS → セッション）
 *   🟢 🚨 **そのセッションが実際に効く**（`/api/auth/me` が 200）
 *      ← Cookie が出たことを合格にしない。**対照**として Cookie 無し / 偽トークンが 401 であることも見る
 *   🔴 署名の改竄 / 署名の削除 / Audience 不一致 / 期限切れ を弾く
 *   🔴 🚨 **リプレイ台帳そのものが弾いている**（`code=SAML_REPLAY`）
 *      ← saml の指摘。「2回目が 401」だけだと**台帳を全部消しても緑のまま**になる。
 *        1回目の成功で node-saml が InResponseTo の台帳を消すので、2回目は
 *        「リプレイだから」ではなく「InResponseTo が無いから」落ちる（SAML_INVALID_RESPONSE）。
 *        **InResponseTo を外した応答**（署名の外の属性なので署名は壊れない）を使うと
 *        ライブラリの検査が止まり、**残る防御はリプレイ台帳だけ**になる。
 *        → **「弾いたか」でなく「何が弾いたか（code）」まで見る。**
 *   🔴 SAML を有効にしても**パスワードの経路が生きている**（締め出しの防止）
 *
 * 🚨 unverified: **実物の IdP（Entra ID / Google Workspace）は未確認**（テナントが要る）。
 *   ここで通ったのは **Keycloak（モック）まで**。「モックで通る」と「実物で通る」は別。
 */

import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { establishSession } from "../lib/session.mjs";
import { assertion, result, statusFromAssertions, STATUS } from "../lib/result.mjs";
import { run, REPO_ROOT } from "../lib/proc.mjs";

const SAML_DIR = join(REPO_ROOT, "acceptance/saml");
const SESSION_FILE = "/tmp/acc-saml-response.txt";

export async function check(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const assertions = [];
  const details = [];

  // 実装があるか（推測せず対象に聞く）
  const metadata = await fetch(`${baseUrl}/api/auth/saml/metadata`, { redirect: "manual" })
    .catch(() => null);
  if (!metadata || metadata.status === 404) {
    return result({
      id: 13, title: "V1-A SAML（SSO）", status: STATUS.SKIP,
      reason: "SAML の入口がまだありません（/api/auth/saml/metadata が 404）",
      details: ["実装が来たら acceptance/saml/ のスクリプトで測ります。"],
      ms: Date.now() - started,
    });
  }

  const env = { ...process.env, STUDIO: baseUrl };

  // ── テスト IdP（Keycloak）を用意する ──
  // 🚨 **Keycloak は `start-dev`（メモリ内 DB）で動いている**ので、
  //   **コンテナが再起動すると realm ごと設定が消える**（実測: 再起動 29 秒後に realm が 404。
  //   その直前まで往復は通っていた・2026-08-14）。
  //   ここで「IdP が壊れている」と BLOCKED にすると、**実際には測れるのに測らない**ことになる。
  //   `setup-keycloak.sh` は冪等なので、**無ければ作り直してから測る**。
  //   → これは製品の検証ではなく**検証環境の用意**。判定ロジックには触れていない。
  const realmAlive = async () => {
    const probe = await fetch("http://localhost:3108/realms/ohmycms", { redirect: "manual" })
      .catch(() => null);
    return Boolean(probe && probe.status < 400);
  };

  // 🚨 **realm の有無だけを見ない。毎回 setup を流す。**
  //   realm はあるのに**この対象（baseUrl）用のクライアントが無い**ことがある。
  //   実測: Keycloak の再起動後、saml が :3102 用に作り直したので realm は 200 だったが、
  //   :3103 のクライアントは無く、IdP が AuthnRequest に **400** を返していた（2026-08-14）。
  //   「realm が生きている」を「測れる」と読んだのが誤り。**測る対象の分が要る。**
  //   setup は冪等なので毎回流してよい（数秒）。
  {
    const setup = await run("bash", [join(SAML_DIR, "setup-keycloak.sh")], {
      env, cwd: REPO_ROOT, timeoutMs: 180_000,
    });
    if (setup.code !== 0 || !(await realmAlive())) {
      return result({
        id: 13, title: "V1-A SAML（SSO）", status: STATUS.BLOCKED,
        reason: "テスト IdP（Keycloak :3108）を用意できません",
        details: [
          ...details,
          "立て直す:",
          "  docker compose -p ohmycms-saml -f acceptance/saml/compose.keycloak.yml up -d",
          `  STUDIO=${baseUrl} bash acceptance/saml/setup-keycloak.sh`,
          "🚨 Keycloak は **`ohmycms-saml`**、MinIO は **`ohmycms-verify`**（2026-08-14 に分離済み）。",
          "   落とすときは **`-p` を明示**すること。取り違えると別の検証環境を消す。",
          (setup.stderr || setup.stdout).slice(-200),
        ],
        ms: Date.now() - started,
      });
    }
  }

  // ── 🚨 IdP の証明書をアプリ側へ入れ直す ──
  //   `setup-keycloak.sh` は descriptor を**取ってくるだけ**で、アプリの設定
  //   （`ohmycms_saml_config`）には入れない。**realm を作り直すと署名証明書が変わる**ので、
  //   古い証明書のままだと**正しい応答が 401 になる**（症状が「署名が違う」に見えるので
  //   原因が分かりにくい。saml の警告・2026-08-14）。
  //   → 毎回 descriptor から取り直して**API 経由で**入れる。
  //     🚨 DB へ直接書かない。設定の反映は製品の判定を通す（ブートストラップの線引きと同じ）。
  {
    const descriptor = await fetch(
      "http://localhost:3108/realms/ohmycms/protocol/saml/descriptor",
    ).then((r) => r.text()).catch(() => "");
    const certificate = descriptor.match(/<ds:X509Certificate>([\s\S]*?)<\/ds:X509Certificate>/)?.[1]
      ?.replace(/\s+/g, "") ?? null;
    const entityId = descriptor.match(/entityID="([^"]+)"/)?.[1] ?? null;

    if (certificate && entityId) {
      const admin = await establishSession(baseUrl, { label: "saml-config", admin: true });
      if (admin.ok) {
        const patched = await admin.session.request("/api/settings/saml", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            enabled: true,
            idp_entity_id: entityId,
            idp_sso_url: "http://localhost:3108/realms/ohmycms/protocol/saml",
            idp_certificates: [certificate],
            sp_entity_id: `${baseUrl}/api/auth/saml/metadata`,
          }),
        });
        details.push(`IdP の証明書を入れ直しました（HTTP ${patched.status}）。`);
      }
    }
  }

  // ── 🟢 ログインの往復 ──
  rmSync(SESSION_FILE, { force: true });
  rmSync(`${SESSION_FILE}.session`, { force: true });
  const roundtrip = await run("python3", [join(SAML_DIR, "roundtrip.py"), SESSION_FILE], {
    env, cwd: REPO_ROOT, timeoutMs: 120_000,
  });
  const roundtripOk = roundtrip.code === 0 && /往復が通りました/.test(roundtrip.stdout);
  assertions.push(
    assertion("positive", "SAML のログインが往復する（実物の Keycloak）", roundtripOk,
      roundtripOk ? "302 → /admin + session" : (roundtrip.stderr || roundtrip.stdout).slice(-160),
      "往復が通る"),
  );

  // ── 🟢 そのセッションが実際に効く（対照つき）──
  //   🚨 Cookie が出たことを合格にしない。**割れている**ことまで見る。
  let sessionToken = null;
  try {
    sessionToken = readFileSync(`${SESSION_FILE}.session`, "utf8").trim();
  } catch {
    /* 往復が失敗していれば無い。下の判定でそのまま落ちる */
  }
  const me = async (cookie) =>
    (await fetch(`${baseUrl}/api/auth/me`, {
      headers: cookie ? { cookie: `session=${cookie}` } : {},
      redirect: "manual",
    }).catch(() => ({ status: 0 }))).status;

  const withSession = sessionToken ? await me(sessionToken) : 0;
  const withoutCookie = await me(null);
  const withFake = await me("deadbeef");
  assertions.push(
    assertion("positive", "SAML で出たセッションが実際に効く（/api/auth/me が 200）",
      withSession === 200, `HTTP ${withSession}`, "200"),
  );
  assertions.push(
    assertion("negative", "対照: Cookie 無し・偽トークンでは通らない",
      withoutCookie === 401 && withFake === 401,
      `無し ${withoutCookie} / 偽 ${withFake}`, "どちらも 401"),
  );

  // ── 🔴 否定形（saml のスクリプト。対照つきで 10 件）──
  const negative = await run("python3", [join(SAML_DIR, "negative-checks.py")], {
    env, cwd: REPO_ROOT, timeoutMs: 180_000,
  });
  const passed = negative.stdout.match(/=====\s*(\d+)\/(\d+)\s*通過\s*=====/);
  const allPassed = negative.code === 0 && passed && passed[1] === passed[2];
  assertions.push(
    assertion("negative", "改竄・署名なし・Audience 不一致・期限切れ・リプレイを弾く",
      Boolean(allPassed), passed ? `${passed[1]}/${passed[2]} 通過` : "スクリプトが完走せず",
      "全件通過"),
  );

  // 🚨 「何が弾いたか」まで見る（これが無いと防御を1つ落としても気づけない）
  assertions.push(
    assertion("negative", "リプレイ台帳そのものが弾いている（code=SAML_REPLAY）",
      /code=SAML_REPLAY/.test(negative.stdout),
      /code=SAML_REPLAY/.test(negative.stdout) ? "SAML_REPLAY" : "別の理由で落ちている",
      "SAML_REPLAY"),
  );

  // ── 🔴 オープンリダイレクト（saml が引き渡し後に見つけた穴の回帰検査）──
  // 🚨 **RelayState は IdP を往復して戻る＝攻撃者が値を決められる**。
  //   戻り先の検査に「/ で始まり // でない」だけを使っていて **3通り抜けていた**:
  //     "/\evil.com" / "/\/evil.com"（特別なスキームでは \ が / として解釈される）
  //     "/..//evil.com"（正規化されて //evil.com になる）
  //   → 「ログインしたら偽サイトに着く」が作れていた（修正 9d6dab8）。
  //   **ACS 側が本丸**（IdP を経由して来るので）。login 側だけ塞いでも足りない。
  //   🚨 対照つき: 正しい戻り先（/admin/collections）は**そのまま通る**ことも見る。
  //     これが無いと「全部 /admin に潰している」だけでも緑になる。
  const redirects = await run("python3", [join(SAML_DIR, "redirect-checks.py")], {
    env, cwd: REPO_ROOT, timeoutMs: 180_000,
  });
  const redirectOk = redirects.code === 0 && /すべて期待どおり/.test(redirects.stdout);
  const redirectCount = (redirects.stdout.match(/✅/g) ?? []).length;
  assertions.push(
    assertion("negative", "戻り先を細工しても外部サイトへ出せない（login と ACS の両方）",
      redirectOk, redirectOk ? `${redirectCount} 件すべて期待どおり`
        : (redirects.stderr || redirects.stdout).slice(-160),
      "全件通過"),
  );

  details.push(
    "🚨 **実物の IdP（Entra ID / Google Workspace）は未確認**（unverified）。",
    "  ここで通ったのは **Keycloak（モック）まで**です。テナントが要ります。",
    "  「モックで通る」と「実物で通る」は別なので、実結合まで PASS を広げないこと。",
    `再現: STUDIO=${baseUrl} python3 acceptance/saml/negative-checks.py`,
  );

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 13, title: "V1-A SAML（SSO）", status: verdict.status,
    positive: "往復＋セッションが効く", negative: "改竄・リプレイを弾く",
    details: [...details, ...verdict.details], assertions, ms: Date.now() - started,
  });
}
