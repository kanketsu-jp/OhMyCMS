import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

import { DEFAULT_DEVICE_GRANT_TTL_DAYS, activateDevice, type ActivationStore } from "../lib/license/activate";
import { issueLicense } from "../lib/license/issue";
import { issueRevocationList } from "../lib/license/revoke";
import { isLicenseError, type LicenseErrorCode } from "../lib/license/types";
import { verifyDeviceGrant, verifyLicense } from "../lib/license/verify";

const DAY_MS = 24 * 60 * 60 * 1000;

let failures = 0;
let total = 0;

function check(label: string, ok: boolean, detail: string): void {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

async function expectError(label: string, code: LicenseErrorCode, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(label, false, "no error");
  } catch (error) {
    check(label, isLicenseError(error) && error.code === code, isLicenseError(error) ? error.code : "unknown");
  }
}

async function expectNoSpecificError(
  label: string,
  code: LicenseErrorCode,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    check(label, true, `not ${code}`);
  } catch (error) {
    check(label, !(isLicenseError(error) && error.code === code), isLicenseError(error) ? error.code : "unknown");
  }
}

/**
 * 署名を**確実に**書き換える（先頭バイトのビットを全反転する）。
 *
 * 🚨 **末尾の 1 文字を差し替える方式は使わない。**
 *    Ed25519 の署名は 64 バイト = 512 ビットで、base64url にすると 86 文字になる。
 *    このとき **86 文字目が運んでいるのは 2 ビットだけ**（512 - 85 × 6 = 2）。
 *    残りの 4 ビットは詰め物なので、**違う文字にしても同じバイト列へ戻ることがある**。
 *    実測: `"A"` と `"B"` は**どちらも同じバイト**（0x3c）にデコードされた。
 *
 *    つまり「末尾を A ↔ B で入れ替える」方式は、
 *    **改ざんしたつもりで 1 ビットも改ざんしていない**場合がある。
 *    実測: 無改造で 20 回まわして **6 回**、署名が変わらず検査が素通りした（2026-08-15）。
 *    しかも 1 回だけ走らせると 3/4 の確率で緑になるので、**壊れていることに気づけない**。
 *
 *    🚨 教訓: **壊す操作は、壊れたことを確かめてから使う。**
 *    文字列の見た目を変えることと、中身を変えることは別。
 */
function tamperSignature(key: string): string {
  const parts = key.split(".");
  const signature = Buffer.from(parts[parts.length - 1] ?? "", "base64url");
  if (signature.length === 0) throw new Error("署名が空です（改ざんの前提が崩れています）");
  signature[0] ^= 0xff;
  parts[parts.length - 1] = signature.toString("base64url");
  return parts.join(".");
}

class MemoryActivationStore implements ActivationStore {
  private readonly devices = new Map<string, Map<string, Date>>();

  async withLock<T>(_licenseId: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async hasDevice(licenseId: string, deviceId: string): Promise<boolean> {
    return this.devices.get(licenseId)?.has(deviceId) ?? false;
  }

  async countDevices(licenseId: string): Promise<number> {
    return this.devices.get(licenseId)?.size ?? 0;
  }

  async addDevice(licenseId: string, deviceId: string, at: Date): Promise<void> {
    const devices = this.devices.get(licenseId) ?? new Map<string, Date>();
    devices.set(deviceId, at);
    this.devices.set(licenseId, devices);
  }

  async touchDevice(licenseId: string, deviceId: string, at: Date): Promise<void> {
    this.devices.get(licenseId)?.set(deviceId, at);
  }
}

async function withGeneratedKeys(fn: () => Promise<void>): Promise<void> {
  const originalSigningKey = process.env.OHMYCMS_LICENSE_SIGNING_KEY;
  const originalPublicKey = process.env.OHMYCMS_LICENSE_PUBLIC_KEY;
  try {
    const { privateKey, publicKey } = await generateKeyPair("EdDSA", { extractable: true });
    process.env.OHMYCMS_LICENSE_SIGNING_KEY = await exportPKCS8(privateKey);
    process.env.OHMYCMS_LICENSE_PUBLIC_KEY = await exportSPKI(publicKey);
    await fn();
  } finally {
    if (originalSigningKey === undefined) delete process.env.OHMYCMS_LICENSE_SIGNING_KEY;
    else process.env.OHMYCMS_LICENSE_SIGNING_KEY = originalSigningKey;
    if (originalPublicKey === undefined) delete process.env.OHMYCMS_LICENSE_PUBLIC_KEY;
    else process.env.OHMYCMS_LICENSE_PUBLIC_KEY = originalPublicKey;
  }
}

async function main(): Promise<void> {
  await withGeneratedKeys(async () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    const later = new Date(now.getTime() + 2 * DAY_MS);
    const valid = await issueLicense({
      licenseId: "lic-valid",
      plan: "native",
      deviceLimit: 2,
      entitlements: ["files", "api"],
      ttlDays: DEFAULT_DEVICE_GRANT_TTL_DAYS,
      now,
      keyId: "key-valid",
    });

    const validClaims = await verifyLicense(valid.key, { now });
    check(
      "対照0 正しいキー",
      validClaims.plan === "native" && validClaims.dev === 2,
      `plan=${validClaims.plan} dev=${validClaims.dev}`,
    );

    await expectError("① 署名改ざん", "LICENSE_BAD_SIGNATURE", () =>
      verifyLicense(tamperSignature(valid.key), { now }),
    );

    const expired = await issueLicense({
      licenseId: "lic-expired",
      plan: "cloud",
      deviceLimit: 1,
      ttlDays: 1,
      now,
      keyId: "key-expired",
    });
    await expectError("② 期限切れ", "LICENSE_EXPIRED", () => verifyLicense(expired.key, { now: later }));

    const revokedList = (
      await issueRevocationList([{ type: "license", id: valid.claims.sub, at: Math.floor(now.getTime() / 1000) }], {
        now,
      })
    ).list;
    await expectError("③ 失効済み", "LICENSE_REVOKED", () => verifyLicense(valid.key, { now, revocations: revokedList }));

    const limitStore = new MemoryActivationStore();
    await activateDevice({ licenseKey: valid.key, deviceId: "device-a", store: limitStore, now });
    await activateDevice({ licenseKey: valid.key, deviceId: "device-b", store: limitStore, now });
    await expectError("④ 上限 +1 台目", "LICENSE_DEVICE_LIMIT", () =>
      activateDevice({ licenseKey: valid.key, deviceId: "device-c", store: limitStore, now }),
    );

    const grantStore = new MemoryActivationStore();
    const grant = await activateDevice({ licenseKey: valid.key, deviceId: "device-a", store: grantStore, now });
    await expectError("⑤ 別端末の許可証", "LICENSE_DEVICE_MISMATCH", () =>
      verifyDeviceGrant(grant.grant, "device-b", { now }),
    );

    const staleList = (
      await issueRevocationList([], { now: new Date(now.getTime() - 2 * DAY_MS), validForDays: 1 })
    ).list;
    await expectError("⑥ 古い失効リスト", "LICENSE_REVOCATION_STALE", () =>
      verifyLicense(valid.key, { now, revocations: staleList }),
    );
    await expectError("⑥b 失効リスト必須", "LICENSE_REVOCATION_STALE", () =>
      verifyLicense(valid.key, { now, requireRevocations: true }),
    );

    await expectError("⑦ 接頭辞違い", "LICENSE_MALFORMED", () =>
      verifyLicense(valid.key.replace(/^OMC1\./, "OMC9."), { now }),
    );

    const exactStore = new MemoryActivationStore();
    await activateDevice({ licenseKey: valid.key, deviceId: "exact-a", store: exactStore, now });
    await activateDevice({ licenseKey: valid.key, deviceId: "exact-b", store: exactStore, now });
    check("対照1 上限ちょうど", await exactStore.countDevices(valid.claims.sub) === 2, "devices=2");

    const unrelatedList = (
      await issueRevocationList([{ type: "license", id: "other-license", at: Math.floor(now.getTime() / 1000) }], {
        now,
      })
    ).list;
    const unrelatedClaims = await verifyLicense(valid.key, { now, revocations: unrelatedList });
    check("対照2 別 sub の失効", unrelatedClaims.sub === valid.claims.sub, `sub=${unrelatedClaims.sub}`);

    const unexpiredClaims = await verifyLicense(expired.key, { now });
    check("対照3 now を戻す", unexpiredClaims.sub === expired.claims.sub, `sub=${unexpiredClaims.sub}`);

    await activateDevice({ licenseKey: valid.key, deviceId: "device-a", store: limitStore, now });
    check("対照4 登録済み端末の再発行", await limitStore.countDevices(valid.claims.sub) === 2, "devices=2");

    const correctGrantClaims = await verifyDeviceGrant(grant.grant, "device-a", { now });
    check("対照5 正しい端末 ID", correctGrantClaims.dvc === "device-a", `dvc=${correctGrantClaims.dvc}`);

    await expectNoSpecificError("計器 ① 正常入力", "LICENSE_BAD_SIGNATURE", () => verifyLicense(valid.key, { now }));
    await expectNoSpecificError("計器 ② 正常入力", "LICENSE_EXPIRED", () => verifyLicense(valid.key, { now }));
    await expectNoSpecificError("計器 ③ 正常入力", "LICENSE_REVOKED", () =>
      verifyLicense(valid.key, { now, revocations: unrelatedList }),
    );
    await expectNoSpecificError("計器 ④ 正常入力", "LICENSE_DEVICE_LIMIT", () =>
      activateDevice({ licenseKey: valid.key, deviceId: "device-a", store: limitStore, now }),
    );
    await expectNoSpecificError("計器 ⑤ 正常入力", "LICENSE_DEVICE_MISMATCH", () =>
      verifyDeviceGrant(grant.grant, "device-a", { now }),
    );
    await expectNoSpecificError("計器 ⑥ 正常入力", "LICENSE_REVOCATION_STALE", () =>
      verifyLicense(valid.key, { now, revocations: unrelatedList }),
    );
    await expectNoSpecificError("計器 ⑥b 正常入力", "LICENSE_REVOCATION_STALE", () =>
      verifyLicense(valid.key, { now }),
    );
    await expectNoSpecificError("計器 ⑦ 正常入力", "LICENSE_MALFORMED", () => verifyLicense(valid.key, { now }));
  });
}

main()
  .then(() => {
    console.log(`PASS ${total - failures} / FAIL ${failures}`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error) => {
    check("受入ハーネス", false, isLicenseError(error) ? error.code : "unknown");
    console.log(`PASS ${total - failures} / FAIL ${failures}`);
    process.exit(1);
  });
