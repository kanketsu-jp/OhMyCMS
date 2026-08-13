import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { setupPassword } from "./setup";

/**
 * セットアップで入った人に渡す「オンボーディングしか通らない印」。
 *
 * 🚨 **プロセス内の Map で持ってはいけない。**
 * 最初そう作って壊れた（2026-08-13 実測）: `POST /api/auth/setup` が発行した印を、
 * **`/onboarding` のページ側が知らない**。Route Handler と Server Component は
 * 別々のモジュールインスタンスとして読み込まれるため、**同じはずの Map が別物**になる。
 * 症状は「パスワードは通るのに、オンボーディングへ行くと `/login` へ戻される」（無限ループ）。
 *   API  : Cookie を受け付ける（400 = 本文の検証まで進む）
 *   ページ: 同じ Cookie で **307 → /login**
 *
 * なので**状態を持たない署名付きの印**にする。どこで検証しても同じ結果になり、
 * プロセス再起動でも消えず、複数レプリカでも共有できる（前の実装の制約が全部消える）。
 *
 * 鍵材料に**セットアップパスワードそのもの**を使うのは、
 * **パスワードを変えたら古い印が自動的に無効になる**のが正しい挙動だから。
 * 新しい環境変数を増やさずに済む利点もある。
 *
 * 🚨 **個別の失効はしない（できない）。** そのかわり、オンボーディングが完了すると
 * `/onboarding`（→ /admin へ）も `POST /api/onboarding`（409）も `POST /api/auth/setup`（404）も
 * **すべて閉じる**。印が残っていても通る先が無い、というのがここの防御。
 */

const TTL_MS = 30 * 60 * 1000;

function signingKey(): Buffer {
  return createHash("sha256").update(`ohmycms:setup-session:${setupPassword()}`).digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function issueSetupSession(): { token: string; maxAge: number } {
  const payload = String(Date.now() + TTL_MS);
  return { token: `${payload}.${sign(payload)}`, maxAge: Math.floor(TTL_MS / 1000) };
}

export function isValidSetupSession(token: string | null): boolean {
  if (!token) return false;

  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expires = Number(payload);
  if (!Number.isSafeInteger(expires) || Date.now() >= expires) return false;

  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  // timingSafeEqual は長さが違うと例外を投げるので、先に長さを見る。
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// 🚨 個別の失効関数は置かない。署名方式では**サーバ側で1枚だけ無効にはできない**ので、
//    `revokeSetupSession()` のような関数を置くと「捨てた」と誤解させる。
//    実際の防御は「初期設定が済んだら入口が全部閉じる」側にある。
//    呼び出し側は `deleteCookieHeader()` でブラウザの Cookie を消すだけでよい。
