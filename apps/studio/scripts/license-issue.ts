import { randomUUID } from "node:crypto";

import { db } from "../lib/db/knex";
import { issueLicense } from "../lib/license/issue";
import { isLicenseError, type LicensePlan } from "../lib/license/types";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parsePlan(value: string | null): LicensePlan {
  if (value === "cloud" || value === "native" || value === "perpetual") return value;
  throw new Error("LICENSE_MALFORMED");
}

function parseInteger(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("LICENSE_MALFORMED");
  return parsed;
}

function dateFromSeconds(seconds: number): Date {
  return new Date(seconds * 1000);
}

async function main(): Promise<void> {
  const plan = parsePlan(argValue("--plan"));
  const deviceLimit = parseInteger(argValue("--devices"));
  const licenseId = argValue("--license-id") ?? randomUUID();
  const ttlDaysValue = argValue("--ttl-days");
  const ttlDays = ttlDaysValue === null ? undefined : parseInteger(ttlDaysValue);
  const entitlements = (argValue("--ent") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const issued = await issueLicense({ licenseId, plan, deviceLimit, entitlements, ttlDays });
  if (hasFlag("--save")) {
    await db("ohmycms_licenses")
      .insert({
        id: issued.claims.sub,
        plan: issued.claims.plan,
        device_limit: issued.claims.dev,
        entitlements: JSON.stringify(issued.claims.ent),
        key_id: issued.claims.jti,
        issued_at: dateFromSeconds(issued.claims.iat),
        expires_at: dateFromSeconds(issued.claims.exp),
        note: argValue("--note"),
        updated_at: new Date(),
      })
      .onConflict("id")
      .merge({
        plan: issued.claims.plan,
        device_limit: issued.claims.dev,
        entitlements: JSON.stringify(issued.claims.ent),
        key_id: issued.claims.jti,
        issued_at: dateFromSeconds(issued.claims.iat),
        expires_at: dateFromSeconds(issued.claims.exp),
        note: argValue("--note"),
        updated_at: new Date(),
      });
  }

  process.stdout.write(`${issued.key}\n`);
}

main().catch((error) => {
  if (isLicenseError(error)) console.error(error.code);
  else console.error(error instanceof Error ? error.message : "LICENSE_MALFORMED");
  process.exit(1);
});
