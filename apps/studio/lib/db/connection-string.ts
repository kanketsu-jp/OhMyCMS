import { deriveHex } from "../config/derive";

export function getConnectionString(): string | null {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const password = deriveHex("db-password");
  if (!password) {
    return null;
  }

  const user = process.env.POSTGRES_USER || "cms";
  const host = process.env.PGHOST || "db";
  const port = process.env.PGPORT || "5432";
  const database = process.env.POSTGRES_DB || "cms";

  return `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}
