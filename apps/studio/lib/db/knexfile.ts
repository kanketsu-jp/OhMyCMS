import dotenv from "dotenv";
import path from "node:path";

// Knex CLI 単体実行時は Next.js の .env.local 自動ロードが効かないため、
// 明示的に .env.local を読み込む（読み込み専用・ファイルは変更しない）。
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

import type { Knex } from "knex";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL 環境変数が設定されていません（.env.local を確認してください）",
  );
}

const config: Knex.Config = {
  client: "pg",
  connection: connectionString,
  pool: { min: 0, max: 10 },
  migrations: {
    directory: path.resolve(__dirname, "migrations"),
    extension: "ts",
  },
};

export default config;
