import { createHash } from "node:crypto";

function seed(): string | null {
  const value = process.env.OHMYCMS_SEED?.trim();
  return value ? value : null;
}

function deriveBytes(purpose: string): Buffer | null {
  const value = seed();
  if (value === null) {
    return null;
  }

  return createHash("sha256")
    .update(`${value}|ohmycms|${purpose}`, "utf8")
    .digest();
}

export function seedIsPresent(): boolean {
  return seed() !== null;
}

export function deriveHex(purpose: string): string | null {
  return deriveBytes(purpose)?.toString("hex") ?? null;
}

export function deriveBase64(purpose: string): string | null {
  return deriveBytes(purpose)?.toString("base64") ?? null;
}

export function deriveBase64Url(purpose: string, length?: number): string | null {
  const value = deriveBytes(purpose)
    ?.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return value === undefined ? null : length === undefined ? value : value.slice(0, length);
}
