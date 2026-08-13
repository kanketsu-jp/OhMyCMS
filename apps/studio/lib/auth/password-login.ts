import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/knex";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type PasswordLoginResult =
  | { ok: true; userId: string; email: string; role: string | null }
  | { ok: false };

type UserPasswordRow = {
  id: string;
  email: string;
  password: string | null;
  status: string;
  role: string | null;
  failed_login_attempts: number | null;
  locked_until: Date | string | null;
};

let dummyHash: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomUUID());
  return dummyHash;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isLocked(lockedUntil: Date | string | null, now: Date): boolean {
  if (!lockedUntil) return false;
  return new Date(lockedUntil).getTime() > now.getTime();
}

async function verifyDummy(password: string): Promise<void> {
  await verifyPassword(password, await getDummyHash());
}

export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  const user = await db<UserPasswordRow>("directus_users")
    .select(
      "id",
      "email",
      "password",
      "status",
      "role",
      "failed_login_attempts",
      "locked_until",
    )
    .where({ email: normalizedEmail })
    .first();

  // 🚨 入れない理由が何であれ、ここで返る応答は 1 種類でなければならない。
  //    早く返ると「そのアカウントは在るが入れない状態だ」と分かってしまうため、
  //    照合しない経路でもダミーハッシュに対して 1 回だけ計算して時間を揃える。
  //      ・そのメールのユーザーが居ない
  //      ・status が active でない
  //      ・password が NULL（SSO 専用のユーザー）
  //      ・ロック中
  if (
    !user ||
    user.status !== "active" ||
    !user.password ||
    isLocked(user.locked_until, now)
  ) {
    await verifyDummy(password);
    return { ok: false };
  }

  const passwordMatches = await verifyPassword(password, user.password);
  if (!passwordMatches) {
    const failedAttempts = (user.failed_login_attempts ?? 0) + 1;
    const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;
    await db("directus_users")
      .where({ id: user.id })
      .update({
        failed_login_attempts: shouldLock ? 0 : failedAttempts,
        locked_until: shouldLock
          ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000)
          : null,
      });
    return { ok: false };
  }

  await db("directus_users")
    .where({ id: user.id })
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_access: now,
    });

  return { ok: true, userId: user.id, email: user.email, role: user.role };
}
