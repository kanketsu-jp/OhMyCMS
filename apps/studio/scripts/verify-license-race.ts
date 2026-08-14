/**
 * 端末数の上限が「同時に来た要求」に対して守れているかを、**実 DB** で測る。
 *
 * 🚨 なぜ `verify-license.ts` と別に要るか:
 *
 *   `verify-license.ts` の台帳はメモリ実装で、**逐次にしか動かない**。
 *   つまり「同時に来たらどうなるか」を**原理的に測れない**。
 *   逐次で緑になることと、同時で守れることは別（`knowledge/decisions/verify-the-verifier.md`）。
 *
 * 🚨 何が起きうるか:
 *
 *   上限 2 のときに 3 台目と 4 台目が同時に来ると、**どちらも「いま 2 台」を読む**。
 *   「数えてから入れる」実装だと両方が上限判定を通り、**上限を超えて登録される**。
 *   実測（2026-08-15・下記）: `forUpdate()` を外すと **上限 2 に対して 8 台すべて成功**した。
 *   つまりこの検査が無ければ、排他が消えても誰も気づけない。
 *
 * 前提: `bun run migrate` 済みであること（`ohmycms_licenses` ほか 3 表）。
 * 使い方: `bun run scripts/verify-license-race.ts`
 * 終了コード: 上限を 1 台でも超えたら 1。
 */
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

import { db } from "../lib/db/knex";
import { activateDevice, knexActivationStore } from "../lib/license/activate";
import { issueLicense } from "../lib/license/issue";
import { isLicenseError } from "../lib/license/types";

const DEVICE_LIMIT = 2;
const CONCURRENT = 8;

// 🚨 鍵はこの場で作る。外部の鍵に依存すると、鍵の設定漏れが検査の失敗に化ける。
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
process.env.OHMYCMS_LICENSE_SIGNING_KEY = await exportPKCS8(privateKey);
process.env.OHMYCMS_LICENSE_PUBLIC_KEY = await exportSPKI(publicKey);

const licenseId = `race-${Date.now()}`;
const { key } = await issueLicense({ licenseId, plan: "perpetual", deviceLimit: DEVICE_LIMIT });

await db("ohmycms_licenses").insert({
  id: licenseId,
  plan: "perpetual",
  device_limit: DEVICE_LIMIT,
  entitlements: JSON.stringify([]),
  key_id: "race",
  issued_at: new Date(),
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
});

const results = await Promise.all(
  Array.from({ length: CONCURRENT }, (_, index) =>
    db
      .transaction((trx) =>
        activateDevice({
          licenseKey: key,
          deviceId: `device-${index}`,
          store: knexActivationStore(trx),
        }),
      )
      .then(() => "ok" as const)
      .catch((error) =>
        isLicenseError(error) ? error.code : `OTHER:${(error as Error).message.slice(0, 80)}`,
      ),
  ),
);

const succeeded = results.filter((r) => r === "ok").length;
const limited = results.filter((r) => r === "LICENSE_DEVICE_LIMIT").length;
const unexpected = results.filter((r) => r !== "ok" && r !== "LICENSE_DEVICE_LIMIT");

// 🚨 「戻り値が何件成功したか」ではなく、**台帳に何行入ったか**を見る。
//    戻り値だけ見ると、書き込みに失敗しても成功と数えてしまう。
const stored = Number(
  (await db("ohmycms_license_devices").where({ license_id: licenseId }).count({ c: "*" }))[0]!.c,
);

console.log(`同時 ${CONCURRENT} 件 / 上限 ${DEVICE_LIMIT}`);
console.log(`  成功                 = ${succeeded}`);
console.log(`  LICENSE_DEVICE_LIMIT = ${limited}`);
console.log(`  想定外               = ${unexpected.length}${unexpected.length ? ` ${JSON.stringify(unexpected)}` : ""}`);
console.log(`  台帳の実件数          = ${stored}`);

const pass = succeeded === DEVICE_LIMIT && stored === DEVICE_LIMIT && unexpected.length === 0;
console.log(
  pass
    ? "PASS  上限を超えなかった"
    : `FAIL  🚨 上限を超えた（成功=${succeeded} 台帳=${stored} 上限=${DEVICE_LIMIT}）`,
);

await db("ohmycms_license_devices").where({ license_id: licenseId }).del();
await db("ohmycms_licenses").where({ id: licenseId }).del();
await db.destroy();

process.exit(pass ? 0 : 1);
