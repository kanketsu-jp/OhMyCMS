import { importPKCS8, importSPKI } from "jose";

import { LICENSE_ALG, LicenseError } from "./types";

/** 🚨 発行鍵。環境変数のみ。DB に置かない（decisions/secrets-storage-by-recoverability.md 2026-08-15 追記）。 */
export async function signingKey(): Promise<CryptoKey> {
  const pem = process.env.OHMYCMS_LICENSE_SIGNING_KEY;
  if (!pem) throw new LicenseError("LICENSE_SIGNING_KEY_MISSING");
  try {
    return await importPKCS8(pem, LICENSE_ALG);
  } catch {
    throw new LicenseError("LICENSE_SIGNING_KEY_MISSING");
  }
}

export async function verificationKey(): Promise<CryptoKey> {
  const pem = process.env.OHMYCMS_LICENSE_PUBLIC_KEY;
  if (!pem) throw new LicenseError("LICENSE_PUBLIC_KEY_MISSING");
  try {
    return await importSPKI(pem, LICENSE_ALG);
  } catch {
    throw new LicenseError("LICENSE_PUBLIC_KEY_MISSING");
  }
}
