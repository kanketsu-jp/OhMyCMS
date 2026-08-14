export const LICENSE_ISSUER = "ohmycms";
export const LICENSE_ALG = "EdDSA";

export const LICENSE_PREFIX = "OMC1";
export const DEVICE_GRANT_PREFIX = "OMC1D";
export const REVOCATION_LIST_PREFIX = "OMC1R";

export type LicensePlan = "cloud" | "native" | "perpetual";

export type LicenseClaims = {
  iss: string;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  plan: LicensePlan;
  dev: number;
  ent: string[];
};

export type DeviceGrantClaims = LicenseClaims & { dvc: string };

export type RevocationTarget = "license" | "key" | "device";
export type RevocationEntry = { type: RevocationTarget; id: string; at: number };
export type RevocationList = {
  iss: string;
  iat: number;
  nextUpdate: number;
  entries: RevocationEntry[];
};

export const LICENSE_ERROR_CODES = [
  "LICENSE_MALFORMED",
  "LICENSE_BAD_SIGNATURE",
  "LICENSE_EXPIRED",
  "LICENSE_REVOKED",
  "LICENSE_DEVICE_LIMIT",
  "LICENSE_DEVICE_MISMATCH",
  "LICENSE_REVOCATION_STALE",
  "LICENSE_SIGNING_KEY_MISSING",
  "LICENSE_PUBLIC_KEY_MISSING",
] as const;
export type LicenseErrorCode = (typeof LICENSE_ERROR_CODES)[number];

export class LicenseError extends Error {
  readonly code: LicenseErrorCode;

  constructor(code: LicenseErrorCode) {
    super(code);
    this.name = "LicenseError";
    this.code = code;
  }
}

export function isLicenseError(e: unknown): e is LicenseError {
  if (e instanceof LicenseError) return true;
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" && LICENSE_ERROR_CODES.includes(code as LicenseErrorCode);
}
