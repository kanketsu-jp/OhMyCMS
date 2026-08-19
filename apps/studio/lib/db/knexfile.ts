import dotenv from "dotenv";
import path from "node:path";
import { getConnectionString } from "./connection-string";

// Knex CLI 単体実行時は Next.js の .env.local 自動ロードが効かないため、
// 明示的に .env.local を読み込む（読み込み専用・ファイルは変更しない）。
//
// ただし Docker では環境変数がプロセスへ直接渡り、.env.local は存在しない
// （秘密をイメージへ焼き込まないため .dockerignore で除外している）。
// すでに DATABASE_URL が渡っているときは dotenv のロード自体を行わない。
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
}

import type { Knex } from "knex";

const connectionString = getConnectionString();
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
