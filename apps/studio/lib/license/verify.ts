import { jwtVerify } from "jose";

import { verificationKey } from "./keys";
import { findRevocation } from "./revoke";
import {
  DEVICE_GRANT_PREFIX,
  LICENSE_ISSUER,
  LICENSE_PREFIX,
  LicenseError,
  REVOCATION_LIST_PREFIX,
  type DeviceGrantClaims,
  type LicenseClaims,
  type LicensePlan,
  type RevocationEntry,
  type RevocationList,
} from "./types";

export type VerifyOptions = {
  now?: Date;
  revocations?: RevocationList | null;
  requireRevocations?: boolean;
};

function splitPrefixedToken(value: string, prefix: string): string {
  const expectedPrefix = `${prefix}.`;
  if (!value.startsWith(expectedPrefix)) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  const jws = value.slice(expectedPrefix.length);
  if (jws.split(".").length !== 3) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  return jws;
}

function mapJoseError(error: unknown): never {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
    throw new LicenseError("LICENSE_BAD_SIGNATURE");
  }
  if (code === "ERR_JWT_EXPIRED") {
    throw new LicenseError("LICENSE_EXPIRED");
  }
  if (code === "ERR_JWS_INVALID" || code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  throw new LicenseError("LICENSE_MALFORMED");
}

function isLicensePlan(value: unknown): value is LicensePlan {
  return value === "cloud" || value === "native" || value === "perpetual";
}

function assertString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  return value;
}

function assertNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  return value;
}

function assertEntitlements(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  return value;
}

function claimsFromPayload(payload: Record<string, unknown>): LicenseClaims {
  const claims: LicenseClaims = {
    iss: assertString(payload.iss),
    sub: assertString(payload.sub),
    jti: assertString(payload.jti),
    iat: assertNumber(payload.iat),
    exp: assertNumber(payload.exp),
    plan: payload.plan as LicensePlan,
    dev: assertNumber(payload.dev),
    ent: assertEntitlements(payload.ent),
  };

  if (claims.iss !== LICENSE_ISSUER) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  if (!Number.isInteger(claims.dev) || claims.dev < 1 || !isLicensePlan(claims.plan)) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  return claims;
}

function deviceGrantClaimsFromPayload(payload: Record<string, unknown>): DeviceGrantClaims {
  return { ...claimsFromPayload(payload), dvc: assertString(payload.dvc) };
}

function revocationEntryFromPayload(value: unknown): RevocationEntry {
  if (!value || typeof value !== "object") {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  const entry = value as Record<string, unknown>;
  const type = entry.type;
  if (type !== "license" && type !== "key" && type !== "device") {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  return { type, id: assertString(entry.id), at: assertNumber(entry.at) };
}

function revocationListFromPayload(payload: Record<string, unknown>): RevocationList {
  const entries = payload.entries;
  if (!Array.isArray(entries)) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  const list: RevocationList = {
    iss: assertString(payload.iss),
    iat: assertNumber(payload.iat),
    nextUpdate: assertNumber(payload.nextUpdate),
    entries: entries.map(revocationEntryFromPayload),
  };
  if (list.iss !== LICENSE_ISSUER) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
  return list;
}

async function verifyJws(jws: string, now: Date): Promise<Record<string, unknown>> {
  try {
    const { payload } = await jwtVerify(jws, await verificationKey(), {
      issuer: LICENSE_ISSUER,
      currentDate: now,
      clockTolerance: 0,
    });
    return payload as Record<string, unknown>;
  } catch (error) {
    mapJoseError(error);
  }
}

function assertNotExpired(claims: LicenseClaims, now: Date): void {
  if (claims.exp <= Math.floor(now.getTime() / 1000)) {
    throw new LicenseError("LICENSE_EXPIRED");
  }
}

function checkRevocations(
  claims: { sub: string; jti: string; dvc?: string },
  options: VerifyOptions,
  now: Date,
): void {
  const list = options.revocations;
  if (list === undefined || list === null) {
    if (options.requireRevocations === true) {
      throw new LicenseError("LICENSE_REVOCATION_STALE");
    }
    return;
  }

  if (list.nextUpdate <= Math.floor(now.getTime() / 1000)) {
    throw new LicenseError("LICENSE_REVOCATION_STALE");
  }
  if (findRevocation(list, claims)) {
    throw new LicenseError("LICENSE_REVOKED");
  }
}

export async function verifyLicense(key: string, options?: VerifyOptions): Promise<LicenseClaims> {
  const now = options?.now ?? new Date();
  const payload = await verifyJws(splitPrefixedToken(key, LICENSE_PREFIX), now);
  const claims = claimsFromPayload(payload);
  assertNotExpired(claims, now);
  checkRevocations(claims, options ?? {}, now);
  return claims;
}

export async function verifyDeviceGrant(
  grant: string,
  deviceId: string,
  options?: VerifyOptions,
): Promise<DeviceGrantClaims> {
  const now = options?.now ?? new Date();
  const payload = await verifyJws(splitPrefixedToken(grant, DEVICE_GRANT_PREFIX), now);
  const claims = deviceGrantClaimsFromPayload(payload);
  assertNotExpired(claims, now);
  checkRevocations(claims, options ?? {}, now);
  if (claims.dvc !== deviceId) {
    throw new LicenseError("LICENSE_DEVICE_MISMATCH");
  }
  return claims;
}

export async function verifyRevocationList(signed: string, options?: { now?: Date }): Promise<RevocationList> {
  const payload = await verifyJws(splitPrefixedToken(signed, REVOCATION_LIST_PREFIX), options?.now ?? new Date());
  return revocationListFromPayload(payload);
}
