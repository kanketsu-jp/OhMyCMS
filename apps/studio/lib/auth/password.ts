import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ApiError, isApiError } from "@/lib/schema/errors";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// ohmycms-studio コンテナ内での実測（2026-08-13 / bun 1.3.14 / arm64・5回平均）:
//   N=2^14 21.4ms / N=2^15 51.5ms / N=2^16 105.8ms / N=2^17 209.3ms
// ログインのたびに走るので 100ms 前後の N=2^16 を採る。
// 測り直す手順は README「最初のログイン」の節に書いてある（アーキテクチャが変わったら測り直す）。
const N = 65536;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;
// 🚨 既定の maxmem(32MB) では N=2^15 以上が MEMORY_LIMIT_EXCEEDED で落ちる（実測）。
//    必要量は 128*N*r = 64MiB なので、余裕を見て 128MiB を明示する。
const MAX_MEM = 128 * 1024 * 1024;

// 1回のハッシュで 64MiB 使う。ログインは未認証で叩けるため、同時実行を絞らないと
// メモリを食い潰される。待ち行列にも上限を置く——上限が無いと、メモリの代わりに
// キューが伸びて落ちるだけになる。
const MAX_CONCURRENT = 4; // 64MiB × 4 = 最大 256MiB
const MAX_WAITING = 32;

let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    if (waiting.length >= MAX_WAITING) {
      // 照合を始める前に返すので、アカウントの存在も成否もここからは分からない。
      throw new ApiError(
        429,
        "TOO_MANY_REQUESTS",
        "混み合っています。しばらくしてからもう一度お試しください",
      );
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  active += 1;
  try {
    return await run();
  } finally {
    // 🚨 ここを外すとスロットが返らず、ログインが永久に固まる。
    active -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}

async function deriveKey(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return withSlot(() => scrypt(password, salt, KEY_LEN, { N: n, r, p, maxmem: MAX_MEM }));
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * 保存形式: `scrypt$N$r$p$salt$hash`（salt / hash は base64url）。
 *
 * パラメータを一緒に保存しているので、あとで N を上げても
 * **古いハッシュはそのまま検証できる**（作り直しが要らない）。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await deriveKey(password, salt, N, R, P);
  return [
    "scrypt",
    String(N),
    String(R),
    String(P),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6) return false;

  const [algorithm, nValue, rValue, pValue, saltValue, hashValue] = parts;
  if (algorithm !== "scrypt") return false;

  const n = parsePositiveInteger(nValue);
  const r = parsePositiveInteger(rValue);
  const p = parsePositiveInteger(pValue);
  if (n === null || r === null || p === null) return false;

  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await deriveKey(password, salt, n, r, p);
  } catch (error) {
    // 🚨 混雑による 429 を握り潰さない。false にすると「パスワードが違った」ことになり、
    //    混んでいるだけの利用者の失敗回数が進んでロックされてしまう。
    if (isApiError(error)) throw error;
    return false;
  }

  // timingSafeEqual は長さが違うと例外を投げるので、先に長さを見る。
  if (actual.length !== expected.length) return false;

  // 🚨 ここは必ず timingSafeEqual。=== で比べると、一致した先頭バイト数が時間に出る。
  return timingSafeEqual(actual, expected);
}
