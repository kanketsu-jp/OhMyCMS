import { db } from "../lib/db/knex";
import { addRevocation, issueRevocationList, loadRevocations } from "../lib/license/revoke";
import { isLicenseError, type RevocationTarget } from "../lib/license/types";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseType(value: string | null): RevocationTarget {
  if (value === "license" || value === "key" || value === "device") return value;
  throw new Error("LICENSE_MALFORMED");
}

async function main(): Promise<void> {
  if (hasFlag("--list")) {
    const validDaysValue = argValue("--valid-days");
    const validForDays = validDaysValue === null ? undefined : Number(validDaysValue);
    const { signed } = await issueRevocationList(await loadRevocations(db), { validForDays });
    process.stdout.write(`${signed}\n`);
    return;
  }

  const type = parseType(argValue("--type"));
  const id = argValue("--id");
  if (!id) throw new Error("LICENSE_MALFORMED");
  await addRevocation(db, { type, id, reason: argValue("--reason") ?? undefined });
  process.stdout.write("revoked\n");
}

main().catch((error) => {
  if (isLicenseError(error)) console.error(error.code);
  else console.error(error instanceof Error ? error.message : "LICENSE_MALFORMED");
  process.exit(1);
});
