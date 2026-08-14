import type { Knex } from "knex";
import { SignJWT } from "jose";

import { signingKey } from "./keys";
import {
  LICENSE_ALG,
  LICENSE_ISSUER,
  REVOCATION_LIST_PREFIX,
  type RevocationEntry,
  type RevocationList,
  type RevocationTarget,
} from "./types";

const DAY_SECONDS = 24 * 60 * 60;

export const DEFAULT_REVOCATION_VALID_DAYS = 7;

function secondsFromDate(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export async function issueRevocationList(
  entries: RevocationEntry[],
  options?: { now?: Date; validForDays?: number },
): Promise<{ signed: string; list: RevocationList }> {
  const now = options?.now ?? new Date();
  const iat = secondsFromDate(now);
  const validForDays = options?.validForDays ?? DEFAULT_REVOCATION_VALID_DAYS;
  const list: RevocationList = {
    iss: LICENSE_ISSUER,
    iat,
    nextUpdate: iat + Math.floor(validForDays * DAY_SECONDS),
    entries,
  };

  const jws = await new SignJWT({ nextUpdate: list.nextUpdate, entries: list.entries })
    .setProtectedHeader({ alg: LICENSE_ALG })
    .setIssuer(list.iss)
    .setIssuedAt(list.iat)
    .sign(await signingKey());

  return { signed: `${REVOCATION_LIST_PREFIX}.${jws}`, list };
}

export function findRevocation(
  list: RevocationList,
  claims: { sub: string; jti: string; dvc?: string },
): RevocationEntry | null {
  return (
    list.entries.find((entry) => {
      if (entry.type === "license") return entry.id === claims.sub;
      if (entry.type === "key") return entry.id === claims.jti;
      if (entry.type === "device") return claims.dvc !== undefined && entry.id === claims.dvc;
      return false;
    }) ?? null
  );
}

export async function loadRevocations(conn: Knex): Promise<RevocationEntry[]> {
  const rows = await conn("ohmycms_license_revocations")
    .select("type", "id", "revoked_at")
    .orderBy("revoked_at", "asc");

  return rows.map((row) => ({
    type: row.type as RevocationTarget,
    id: String(row.id),
    at: secondsFromDate(new Date(row.revoked_at)),
  }));
}

export async function addRevocation(
  conn: Knex,
  entry: { type: RevocationTarget; id: string; reason?: string },
  at?: Date,
): Promise<void> {
  const revokedAt = at ?? new Date();
  await conn("ohmycms_license_revocations")
    .insert({
      type: entry.type,
      id: entry.id,
      revoked_at: revokedAt,
      reason: entry.reason ?? null,
    })
    .onConflict(["type", "id"])
    .merge({ revoked_at: revokedAt, reason: entry.reason ?? null });
}
