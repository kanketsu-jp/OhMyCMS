import { createHash, timingSafeEqual } from "node:crypto";

export const DEFAULT_SETUP_PASSWORD = "pass132";

const MAX_FAILED_SETUP_ATTEMPTS = 10;
const SETUP_LOCK_MS = 15 * 60 * 1000;

// 🚨 制約: プロセス再起動で消える。複数レプリカでは共有されない。MVPは単一コンテナなので許容する。
let setupFailedAttempts = 0;
let setupLockedUntil: number | null = null;

export function setupPassword(): string {
  return process.env.OHMYCMS_SETUP_PASSWORD?.trim() || DEFAULT_SETUP_PASSWORD;
}

export function isDefaultSetupPassword(): boolean {
  return verifySetupPassword(DEFAULT_SETUP_PASSWORD);
}

export function verifySetupPassword(input: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(setupPassword()).digest();
  return timingSafeEqual(a, b);
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
