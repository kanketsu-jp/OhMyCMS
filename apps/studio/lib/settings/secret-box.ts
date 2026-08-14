import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/schema/errors";

/**
 * 秘密を DB に置くための最小の箱。
 *
 * なぜ暗号化するか: アクセスキーや外部 API のシークレットは、送信時に平文へ戻す必要がある。
 * ハッシュでは運用できないため、DB へ保存するなら復号可能な暗号化が要る。
 *
 * 鍵は env のままにする。これは秘密を減らす仕組みではなく、秘密の置き場を
 * OHMYCMS_SECRET_KEY の 1 本へ集約するための仕組みである。
 *
 * knowledge/decisions/secrets-storage-by-recoverability.md の条件のうち、今回は
 * 「書き込み専用 API」と「env 鍵での暗号化」を満たす。一方で、明示指示により
 * 別テーブル分離は満たさず、既存の ohmycms_settings に同居させる。
 */

const FORMAT_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function secretKey(): Buffer {
  const raw = process.env.OHMYCMS_SECRET_KEY?.trim();
  if (!raw) {
    throw new ApiError(
      400,
      "SECRET_KEY_MISSING",
      "OHMYCMS_SECRET_KEY が設定されていないため、秘密の項目を保存できません",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.byteLength !== KEY_BYTES) {
    throw new ApiError(
      400,
      "SECRET_KEY_MISSING",
      "OHMYCMS_SECRET_KEY は base64 で 32byte になる値を指定してください",
    );
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, secretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, ivBase64, tagBase64, ciphertextBase64, extra] = stored.split(":");
  if (
    version !== FORMAT_VERSION ||
    !ivBase64 ||
    !tagBase64 ||
    !ciphertextBase64 ||
    extra !== undefined
  ) {
    throw new Error("Invalid encrypted secret format.");
  }
  const decipher = createDecipheriv(ALGORITHM, secretKey(), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
