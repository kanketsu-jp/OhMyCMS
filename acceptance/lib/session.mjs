/**
 * 対象がどのビルドでも**同じ手順でセッションを取る**ための入口。
 *
 * 🚨 開発ビルドと本番ビルドで**ログインの経路が違う**:
 *   開発ビルド … `POST /api/auth/dev-login`（`NODE_ENV!=="production"` かつ `ALLOW_DEV_LOGIN=true`）
 *   本番ビルド … dev-login は **next build のデッドコード削除で物理的に消えている**。
 *                `POST /api/auth/login`（メール + パスワード）しか無い
 *
 * これまでハーネスは dev-login しか知らなかったので、**本番ビルドでは何も測れなかった**。
 * 「開発ビルドで 7 PASS」は**出荷物が動く証明にならない**（司令塔・2026-08-13）。
 *
 * 🚨 **秘密をこのファイルに書かない。** 資格情報は `.env` から読む。
 *   値はログにも判定結果にも**一切出さない**（長さすら出さない）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Session } from "./http.mjs";
import { REPO_ROOT } from "./proc.mjs";

/**
 * リポジトリ直下の `.env` を読む。**値は返すだけで、出力は絶対にしない。**
 * 無ければ空。`process.env` を優先する（CI から渡す場合のため）。
 */
function credentials() {
  const fromFile = {};
  try {
    for (const line of readFileSync(join(REPO_ROOT, ".env"), "utf8").split("\n")) {
      const matched = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!matched) continue;
      fromFile[matched[1]] = matched[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env が無いのは普通のこと（CI など）。process.env を見る */
  }
  const pick = (key) => process.env[key] ?? fromFile[key] ?? null;
  return {
    adminEmail: pick("OHMYCMS_ADMIN_EMAIL"),
    adminPassword: pick("OHMYCMS_ADMIN_PASSWORD"),
    setupPassword: pick("OHMYCMS_SETUP_PASSWORD"),
  };
}

/**
 * ログイン済みの Session を1つ作る。
 *
 * 手順:
 *   1. `dev-login` を試す（開発ビルドならこれで済む。`?admin=true` で管理者ポリシーが付く）
 *   2. 404 なら本番ビルド。`.env` の管理者で `/api/auth/login`
 *
 * @param {string} baseUrl
 * @param {object} [options]
 * @param {string} [options.label]  ログ用の名前
 * @param {string} [options.email]  dev-login で作るユーザー。本番では無視される
 * @param {boolean} [options.admin] dev-login で管理者ポリシーを付けるか（既定 true）
 * @returns {Promise<{ok: true, session: Session, method: "dev-login"|"password", userId: string|null}
 *                  | {ok: false, reason: string, detail: string[]}>}
 */
export async function establishSession(baseUrl, options = {}) {
  const { label = "user", email, admin = true } = options;
  const session = new Session(baseUrl, label);

  // ── 1. 開発ビルドの経路 ──
  const devLogin = await session.postJson(
    `/api/auth/dev-login${admin ? "?admin=true" : ""}`,
    { email: email ?? `acc-${label}@example.com` },
  );
  if (devLogin.status === 200) {
    return {
      ok: true,
      session,
      method: "dev-login",
      userId: devLogin.json?.data?.userId ?? null,
    };
  }

  // ── 2. 本番ビルドの経路 ──
  //    🚨 404 は「dev-login が消えている」＝本番ビルド。それ以外は素直に失敗として扱う。
  if (devLogin.status !== 404) {
    return {
      ok: false,
      reason: `dev-login が想定外の応答です (HTTP ${devLogin.status})`,
      detail: ["開発ビルドのはずが dev-login が使えません。対象の状態を確認してください。"],
    };
  }

  const { adminEmail, adminPassword } = credentials();
  if (!adminEmail || !adminPassword) {
    return {
      ok: false,
      reason: "本番ビルドですが、管理者の資格情報がありません",
      detail: [
        "本番ビルドには dev-login がありません（next build がデッドコードとして削除するため）。",
        "セッションを作るには OHMYCMS_ADMIN_EMAIL と OHMYCMS_ADMIN_PASSWORD が要ります。",
        "🚨 値はハーネスに書かず、リポジトリ直下の .env か環境変数から渡してください。",
      ],
    };
  }

  const passwordLogin = await session.postJson("/api/auth/login", {
    email: adminEmail,
    password: adminPassword,
  });
  if (passwordLogin.status === 200) {
    return {
      ok: true,
      session,
      method: "password",
      userId: passwordLogin.json?.data?.userId ?? null,
    };
  }

  return {
    ok: false,
    // 🚨 パスワードそのものは出さない。**何文字だったかも出さない**
    reason: `本番ビルドのログインに失敗しました (HTTP ${passwordLogin.status})`,
    detail: [
      "OHMYCMS_ADMIN_EMAIL / OHMYCMS_ADMIN_PASSWORD が対象の管理者と一致していません。",
      "対象を焼き直した直後は、DB の管理者と .env がずれていることがあります。",
    ],
  };
}

/**
 * 本番ビルドでは**一般ユーザーを作れない**（dev-login が無く、ユーザー作成 API も無い）。
 * 権限の否定形（A と B を分ける検査）は開発ビルドでしか測れないので、
 * 呼び出し側がそれを判定に書けるようにする。
 */
export function canCreateArbitraryUsers(method) {
  return method === "dev-login";
}
