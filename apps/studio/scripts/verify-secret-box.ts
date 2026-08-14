import { Buffer } from "node:buffer";
import { encryptSecret, decryptSecret } from "../lib/settings/secret-box";
import { isApiError } from "../lib/schema/errors";

let failures = 0;

function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

const originalKey = process.env.OHMYCMS_SECRET_KEY;

try {
  process.env.OHMYCMS_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");
  const plain = "verify-secret-box-value";
  const encrypted = encryptSecret(plain);
  const decrypted = decryptSecret(encrypted);
  check(
    "暗号化と復号",
    decrypted === plain && encrypted.startsWith("v1:") && !encrypted.includes(plain),
    `format=${encrypted.split(":")[0]}`,
  );

  delete process.env.OHMYCMS_SECRET_KEY;
  try {
    encryptSecret(plain);
    check("鍵未設定の拒否", false, "no error");
  } catch (error) {
    check(
      "鍵未設定の拒否",
      isApiError(error) && error.code === "SECRET_KEY_MISSING",
      isApiError(error) ? error.code : "unknown",
    );
  }
} finally {
  if (originalKey === undefined) delete process.env.OHMYCMS_SECRET_KEY;
  else process.env.OHMYCMS_SECRET_KEY = originalKey;
}

console.log(failures === 0 ? "\nすべて通りました" : `\n落ちた項目: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
