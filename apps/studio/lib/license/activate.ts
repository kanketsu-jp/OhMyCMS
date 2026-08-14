import { AsyncLocalStorage } from "node:async_hooks";

import type { Knex } from "knex";
import { SignJWT } from "jose";

import { signingKey } from "./keys";
import {
  LICENSE_ALG,
  DEVICE_GRANT_PREFIX,
  LicenseError,
  type DeviceGrantClaims,
  type RevocationList,
} from "./types";
import { verifyLicense } from "./verify";

const DAY_SECONDS = 24 * 60 * 60;

export const DEFAULT_DEVICE_GRANT_TTL_DAYS = 30;

export type ActivationStore = {
  /** 同じライセンス行に対する登録を直列化する。Knex 実装では SELECT ... FOR UPDATE。 */
  withLock<T>(licenseId: string, fn: () => Promise<T>): Promise<T>;
  hasDevice(licenseId: string, deviceId: string): Promise<boolean>;
  countDevices(licenseId: string): Promise<number>;
  addDevice(licenseId: string, deviceId: string, at: Date): Promise<void>;
  touchDevice(licenseId: string, deviceId: string, at: Date): Promise<void>;
};

export type ActivateInput = {
  licenseKey: string;
  deviceId: string;
  store: ActivationStore;
  ttlDays?: number;
  now?: Date;
  revocations?: RevocationList | null;
  requireRevocations?: boolean;
};

function secondsFromDate(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function assertDeviceId(deviceId: string): void {
  if (deviceId.length === 0 || deviceId.length > 200) {
    throw new LicenseError("LICENSE_MALFORMED");
  }
}

/**
 * 🚨 端末 ID は呼び出し側が決める不透明な文字列で、一意性は保証されない。
 * 同じ文字列を 2 台が名乗っても、この仕組みは検知できない（台帳の一意制約は
 * `(license_id, device_id)` なので、2 台が 1 台として数えられる）。
 * したがって端末数の上限は「正直な呼び出し側」に対してしか効かない。
 * 一意性が要る日が来たら、それは指紋の生成規則を決める＝ネイティブ側の仕事で、ここでは先取りしない。
 */
export async function activateDevice(input: ActivateInput): Promise<{ grant: string; claims: DeviceGrantClaims }> {
  const now = input.now ?? new Date();
  const claims = await verifyLicense(input.licenseKey, {
    now,
    revocations: input.revocations,
    requireRevocations: input.requireRevocations,
  });
  assertDeviceId(input.deviceId);

  await input.store.withLock(claims.sub, async () => {
    if (await input.store.hasDevice(claims.sub, input.deviceId)) {
      await input.store.touchDevice(claims.sub, input.deviceId, now);
      return;
    }
    if ((await input.store.countDevices(claims.sub)) >= claims.dev) {
      throw new LicenseError("LICENSE_DEVICE_LIMIT");
    }
    await input.store.addDevice(claims.sub, input.deviceId, now);
  });

  const ttlDays = input.ttlDays ?? DEFAULT_DEVICE_GRANT_TTL_DAYS;
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    throw new LicenseError("LICENSE_MALFORMED");
  }

  const issuedAt = secondsFromDate(now);
  const grantClaims: DeviceGrantClaims = {
    ...claims,
    dvc: input.deviceId,
    iat: issuedAt,
    exp: issuedAt + Math.floor(ttlDays * DAY_SECONDS),
  };
  const jws = await new SignJWT({
    plan: grantClaims.plan,
    dev: grantClaims.dev,
    ent: grantClaims.ent,
    dvc: grantClaims.dvc,
  })
    .setProtectedHeader({ alg: LICENSE_ALG })
    .setIssuer(grantClaims.iss)
    .setSubject(grantClaims.sub)
    .setJti(grantClaims.jti)
    .setIssuedAt(grantClaims.iat)
    .setExpirationTime(grantClaims.exp)
    .sign(await signingKey());

  return { grant: `${DEVICE_GRANT_PREFIX}.${jws}`, claims: grantClaims };
}

type KnexLike = Knex | Knex.Transaction;

/** Knex 実装。トランザクションか db を受け取る。 */
export function knexActivationStore(conn: KnexLike): ActivationStore {
  const storage = new AsyncLocalStorage<KnexLike>();
  const current = (): KnexLike => storage.getStore() ?? conn;
  const isTransaction = (value: KnexLike): value is Knex.Transaction =>
    (value as { isTransaction?: boolean }).isTransaction === true;

  return {
    async withLock<T>(licenseId: string, fn: () => Promise<T>): Promise<T> {
      const active = current();
      if (isTransaction(active)) {
        await active("ohmycms_licenses").where({ id: licenseId }).forUpdate().first();
        return fn();
      }
      return active.transaction(async (trx) =>
        storage.run(trx, async () => {
          await trx("ohmycms_licenses").where({ id: licenseId }).forUpdate().first();
          return fn();
        }),
      );
    },
    async hasDevice(licenseId: string, deviceId: string): Promise<boolean> {
      const row = await current()("ohmycms_license_devices")
        .where({ license_id: licenseId, device_id: deviceId })
        .first("device_id");
      return row !== undefined;
    },
    async countDevices(licenseId: string): Promise<number> {
      const row = await current()("ohmycms_license_devices").where({ license_id: licenseId }).count<{ count: string }>("* as count").first();
      return Number(row?.count ?? 0);
    },
    async addDevice(licenseId: string, deviceId: string, at: Date): Promise<void> {
      await current()("ohmycms_license_devices").insert({
        license_id: licenseId,
        device_id: deviceId,
        activated_at: at,
        last_seen_at: at,
      });
    },
    async touchDevice(licenseId: string, deviceId: string, at: Date): Promise<void> {
      await current()("ohmycms_license_devices")
        .where({ license_id: licenseId, device_id: deviceId })
        .update({ last_seen_at: at });
    },
  };
}
