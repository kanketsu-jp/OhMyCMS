import { createHash, timingSafeEqual } from "node:crypto";
import { verifyPassword } from "@/lib/auth/password";
import { deriveBase64Url } from "@/lib/config/derive";
import { storedSetupPasswordHash } from "@/lib/settings/service";

export const DEFAULT_SETUP_PASSWORD = "pass132";

const MAX_FAILED_SETUP_ATTEMPTS = 10;
const SETUP_LOCK_MS = 15 * 60 * 1000;

// 🚨 制約: プロセス再起動で消える。複数レプリカでは共有されない。MVPは単一コンテナなので許容する。
// 🚨 パスワード1つが全ての鍵になったので、前より重要。消さないこと。
let setupFailedAttempts = 0;
let setupLockedUntil: number | null = null;

export function setupPassword(): string {
  return (
    process.env.OHMYCMS_SETUP_PASSWORD?.trim() ||
    deriveBase64Url("setup-password", 20) ||
    DEFAULT_SETUP_PASSWORD
  );
}

function verifyAgainstEnvironment(input: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(setupPassword()).digest();
  return timingSafeEqual(a, b);
}

/**
 * DBにハッシュがある → scryptで照合（パスワードが変更済み。以後は環境変数を見ない）。
 * DBにハッシュが無い → 環境変数と照合（SHA-256 + timingSafeEqual。初期状態のみ）。
 * 🚨 DBにハッシュがあるときに環境変数の値を通してはいけない
 *    （通すと「変えたのに古い値でも入れる」＝変更が失効しない）。
 */
export async function verifySetupPassword(input: string): Promise<boolean> {
  const stored = await storedSetupPasswordHash();
  if (stored) {
    return verifyPassword(input, stored);
  }
  return verifyAgainstEnvironment(input);
}

/** DBに保存済み（＝変更済み）なら常に false。未保存のときだけ既定値と一致するかを見る。 */
export async function isDefaultSetupPassword(): Promise<boolean> {
  const stored = await storedSetupPasswordHash();
  if (stored) return false;
  return verifyAgainstEnvironment(DEFAULT_SETUP_PASSWORD);
}

export function isSetupLocked(): boolean {
  if (setupLockedUntil === null) return false;
  if (Date.now() >= setupLockedUntil) {
    setupLockedUntil = null;
    setupFailedAttempts = 0;
    return false;
  }
  return true;
}

export function recordSetupFailure(): void {
  setupFailedAttempts += 1;
  if (setupFailedAttempts >= MAX_FAILED_SETUP_ATTEMPTS) {
    setupLockedUntil = Date.now() + SETUP_LOCK_MS;
    setupFailedAttempts = 0;
  }
}

export function resetSetupFailures(): void {
  setupFailedAttempts = 0;
  setupLockedUntil = null;
}
