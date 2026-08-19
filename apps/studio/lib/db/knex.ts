import knex, { type Knex } from "knex";
import { getConnectionString } from "./connection-string";

// 開発時のホットリロードで接続が増え続けるのを防ぐため、
// globalThis に Knex インスタンスをキャッシュしてシングルトン化する。
const globalForDb = globalThis as unknown as {
  knexInstance?: Knex;
};

function createKnexInstance(): Knex {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("DATABASE_URL 環境変数が設定されていません");
  }

  return knex({
    client: "pg",
    connection: connectionString,
    pool: { min: 0, max: 10 },
  });
}

export const db: Knex = globalForDb.knexInstance ?? createKnexInstance();

if (!globalForDb.knexInstance) {
  globalForDb.knexInstance = db;
}
