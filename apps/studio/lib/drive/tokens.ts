import { db } from "@/lib/db/knex";
import { decryptSecret, encryptSecret } from "@/lib/settings/secret-box";
import { ApiError } from "@/lib/schema/errors";
import { refreshAccessToken } from "./oauth";

/**
 * 利用者ごとのドライブ接続。
 *
 * 🚨 **リフレッシュトークンをこのファイルの外へ出さない。**
 *
 * **守り手その1: 型 `DriveConnection`（`connected` と `accountEmail` の2項目だけ）。**
 *   画面へ返る唯一の形がこれで、トークンの入る欄が無い。
 * **守り手その2: `getAccessTokenFor` が返すのは access token（`Promise<string>`）だけ。**
 *   refresh は関数の中の `let refreshToken` にしか現れず、外へ出る文が無い。
 * **守り手その3: 呼び出し口が 2 箇所しか無い**——`app/api/drive/files/route.ts:21` と
 *   `lib/drive/import.ts:86`。どちらも**その場の const** で、応答へは載せていない
 *   （2026-08-15 に呼び出し元を全部たどって確認）。
 *   外に出す口を作ると、いつか誰かがログやレスポンスに載せる。
 *   外から使えるのは「繋がっているか」と「アクセストークン（短命）」だけにしてある。
 *
 * 🚨 保存は必ず `lib/settings/secret-box.ts`（AES-256-GCM・`OHMYCMS_SECRET_KEY`）を通す。
 *   新しい暗号化を作らない。鍵が無いときは secret-box が保存を拒む（その挙動をそのまま使う）。
 */

type TokenRow = {
  user_id: string;
  refresh_token: string;
  scope: string;
  account_email: string | null;
  created_at: string;
  updated_at: string;
};

export type DriveConnection = {
  connected: boolean;
  /** 繋いだ Google アカウント（表示用）。🚨 秘密ではない。 */
  accountEmail: string | null;
};

/** 画面に出してよい範囲。🚨 トークンそのものは含めない。 */
export async function connectionStatus(userId: string): Promise<DriveConnection> {
  const row = await db<TokenRow>("ohmycms_drive_tokens")
    .where({ user_id: userId })
    .select("account_email")
    .first();
  return { connected: Boolean(row), accountEmail: row?.account_email ?? null };
}

export async function saveConnection(
  userId: string,
  input: { refreshToken: string; scope: string; accountEmail: string | null },
): Promise<void> {
  // 🚨 暗号化してから入れる。平文が DB に入る経路をここ以外に作らない。
  const encrypted = encryptSecret(input.refreshToken);
  const now = new Date().toISOString();
  await db<TokenRow>("ohmycms_drive_tokens")
    .insert({
      user_id: userId,
      refresh_token: encrypted,
      scope: input.scope,
      account_email: input.accountEmail,
      created_at: now,
      updated_at: now,
    })
    // 繋ぎ直したときは上書きする（古いトークンを残さない）。
    .onConflict("user_id")
    .merge(["refresh_token", "scope", "account_email", "updated_at"]);
}

export async function disconnect(userId: string): Promise<void> {
  await db("ohmycms_drive_tokens").where({ user_id: userId }).delete();
}

/**
 * その利用者としてドライブを読むための、**短命の**アクセストークンを作る。
 *
 * 🚨 これが「リフレッシュトークンを使う唯一の入口」。復号した値はこの関数のスコープから出ない。
 * 🚨 アクセストークンは**保存しない**。1時間で切れる値を DB に置いても、置き場所が増えるだけ。
 */
export async function getAccessTokenFor(userId: string, clientId: string): Promise<string> {
  const row = await db<TokenRow>("ohmycms_drive_tokens").where({ user_id: userId }).first();
  if (!row) {
    throw new ApiError(400, "DRIVE_NOT_CONNECTED", "ドライブに接続していません");
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(row.refresh_token);
  } catch {
    // 🚨 鍵が変わった・値が壊れた。**中身を報告に載せない**。繋ぎ直してもらう。
    throw new ApiError(
      400,
      "DRIVE_TOKEN_UNREADABLE",
      "ドライブの接続情報を読めませんでした。接続し直してください",
    );
  }

  const token = await refreshAccessToken({ clientId, refreshToken });

  // Google 側で取り消されていれば refreshAccessToken が失敗する。ここまで来たら生きている。
  return token.accessToken;
}
