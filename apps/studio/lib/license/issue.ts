import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import { signingKey } from "./keys";
import {
  LICENSE_ALG,
  LICENSE_ISSUER,
  LICENSE_PREFIX,
  LicenseError,
  type LicenseClaims,
  type LicensePlan,
} from "./types";

const DAY_SECONDS = 24 * 60 * 60;

export const DEFAULT_LICENSE_TTL_DAYS: Record<LicensePlan, number> = {
  cloud: 400,
  native: 400,
  perpetual: 1826,
};

export type IssueLicenseInput = {
  licenseId: string;
  plan: LicensePlan;
  deviceLimit: number;
  entitlements?: string[];
  ttlDays?: number;
  now?: Date;
  keyId?: string;
};

function isLicensePlan(value: unknown): value is LicensePlan {
  return value === "cloud" || value === "native" || value === "perpetual";
}

function secondsFromDate(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function validateEntitlements(entitlements: string[]): void {
  if (!Array.isArray(entitlements) || entitlements.some((value) => typeof value !== "string")) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
}

// 買い切り（`perpetual`）にも期限を入れているが、利用者から見た体験は変わらない。
// 期限が来たら無償・自動で再発行する。権利は台帳（`ohmycms_licenses`）が持っていて、
// このキーはその引換券でしかない。
// 🚨 永久に有効なキーにすると、流出したキーを止める手段が失効リストだけになる。
// 失効リストは届かない端末には効かないので、それだけに頼る形にはしない。
export async function issueLicense(input: IssueLicenseInput): Promise<{ key: string; claims: LicenseClaims }> {
  if (!input.licenseId || !isLicensePlan(input.plan)) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  if (!Number.isInteger(input.deviceLimit) || input.deviceLimit < 1) {
    throw new LicenseError("LICENSE_MALFORMED");
  }

  const ttlDays = input.ttlDays ?? DEFAULT_LICENSE_TTL_DAYS[input.plan];
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    throw new LicenseError("LICENSE_MALFORMED");
  }

  const entitlements = input.entitlements ?? [];
  validateEntitlements(entitlements);

  const now = input.now ?? new Date();
  const iat = secondsFromDate(now);
  const exp = iat + Math.floor(ttlDays * DAY_SECONDS);
  const jti = input.keyId ?? randomUUID();
  const claims: LicenseClaims = {
    iss: LICENSE_ISSUER,
    sub: input.licenseId,
    jti,
    iat,
    exp,
    plan: input.plan,
    dev: input.deviceLimit,
    ent: entitlements,
  };

  const jws = await new SignJWT({ plan: claims.plan, dev: claims.dev, ent: claims.ent })
    .setProtectedHeader({ alg: LICENSE_ALG })
    .setIssuer(claims.iss)
    .setSubject(claims.sub)
    .setJti(claims.jti)
    .setIssuedAt(claims.iat)
    .setExpirationTime(claims.exp)
    .sign(await signingKey());

  return { key: `${LICENSE_PREFIX}.${jws}`, claims };
}
