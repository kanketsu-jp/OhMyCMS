/**
 * **OTP の検証用に、既知のコードを持つ行を植える。**
 *
 * 🚨 なぜ植えるのか（私の当初案が不可能だったので）:
 *   最初は「DB からコードを読む」つもりだったが、**入っているのは scrypt のハッシュだけ**で
 *   6桁は戻せない（戻せたら設計が失敗している）。auth の提案で**手段を分けた**:
 *
 *   🟢「コードを受け取って入れる」→ **受信箱から読む**（MailHog 等）。**発行→送信→照合**の
 *      全体が検証対象なので、受信箱を見るのが唯一の本物の確認。**まだ立てていない（unverified）**。
 *   🔴 期限切れ / 使用済み / 他人のコード / 試行超過 → **既知のコードをハッシュ化して行を植える**。
 *      送信を必要としない。**照合ロジック（期限・試行回数・使い捨て・ハッシュ比較）は全部通る**ので
 *      迂回にならない。ブートストラップと同じ線（身元の用意はしてよい／判定は触らない）。
 *
 * 🚨 ハッシュは**製品と同じ形式**で作る（`apps/studio/lib/auth/password.ts`）:
 *   `scrypt$N$r$p$salt$hash`（salt/hash は base64url・N=65536 r=8 p=1 keylen=64）。
 *   ここがずれると「照合が通らない」のが**製品のせいか植え方のせいか区別できなくなる**。
 *   → だから**まず正しいコードで通ることを対照として確かめる**（それが無いと否定形は何も証明しない）。
 */

import { randomBytes, scryptSync } from "node:crypto";

import { lit, queryScalar } from "./bootstrap.mjs";

const N = 65536;
const R = 8;
const P = 1;
const KEY_LEN = 64;

/** 製品と同じ保存形式のハッシュを作る。 */
export function hashCode(code) {
  const salt = randomBytes(16);
  const derived = scryptSync(code, salt, KEY_LEN, { N, r: R, p: P, maxmem: 512 * 1024 * 1024 });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * ログインコードの行を1つ植える。
 *
 * @param {object} options
 * @param {string} options.email
 * @param {string} options.code       既知の6桁
 * @param {number} [options.expiresInMs]  既定 10 分（期限切れを作るなら負の値）
 * @param {number} [options.attempts]     試行回数の初期値
 * @param {boolean} [options.consumed]    使用済みにするか
 */
export async function plantLoginCode({
  email,
  code,
  expiresInMs = 10 * 60 * 1000,
  attempts = 0,
  consumed = false,
}) {
  const seconds = Math.round(expiresInMs / 1000);
  const inserted = await queryScalar(
    `insert into ohmycms_login_codes (id, email, code_hash, expires_at, attempts, consumed_at, created_at)
     values (gen_random_uuid(), ${lit(email)}, ${lit(hashCode(code))},
             now() + interval '${seconds} seconds', ${Number(attempts)},
             ${consumed ? "now()" : "null"}, now())
     returning id;`,
  );
  return inserted;
}

/** この検証で作った行を消す。 */
export async function cleanupLoginCodes(emailPrefix) {
  if (!/^[A-Za-z0-9._-]+$/.test(emailPrefix)) return;
  await queryScalar(`delete from ohmycms_login_codes where email like ${lit(`${emailPrefix}%`)};`);
}
