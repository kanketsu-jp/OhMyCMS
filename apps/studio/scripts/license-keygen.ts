import { constants } from "node:fs";
import { access, chmod, writeFile } from "node:fs/promises";

import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const out = argValue("--out");
  if (!out) {
    console.error("usage: bun run scripts/license-keygen.ts --out <path>");
    process.exit(1);
  }
  if (await exists(out)) {
    console.error("output file already exists");
    process.exit(1);
  }

  const { privateKey, publicKey } = await generateKeyPair("EdDSA", { extractable: true });
  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);

  await writeFile(out, privatePem, { mode: 0o600, flag: "wx" });
  await chmod(out, 0o600);
  process.stdout.write(publicPem);
}

main().catch(() => {
  console.error("license key generation failed");
  process.exit(1);
});
