/**
 * ファイル保管先と `directus_files` のずれを報せるだけの検査。
 *
 * 🚨 門には登録しない。見つかったものを消さず、終了コードも赤にしない。
 * 現在確認できる落ちた跡は、次の2種類に限る:
 *   1. DB に行があるが、保存先の実体が無い
 *   2. local の保存先に実体があるが、DB に対応するキーが無い
 *
 * S3 の「実体だけ」を列挙する API は StorageDriver に無いため、2 は local の
 * 保存先だけを対象にする。S3 の DB 行については head で 1 を確認する。
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

import { db } from "../lib/db/knex";
import { getStorageByName } from "../lib/storage";

type FileRow = {
  id: string;
  storage: string;
  filename_disk: string | null;
  compressed_key: string | null;
};

type Orphan = { id: string; key: string; kind: "original" | "compressed" };

async function listLocalKeys(root: string): Promise<string[]> {
  const keys: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const key = path.relative(root, absolute);
      // bug-reports は directus_files ではなく専用表で管理しているため母集合から除く。
      if (key === "bug-reports" || key.startsWith(`bug-reports${path.sep}`)) continue;
      if (entry.isDirectory()) await walk(absolute);
      else keys.push(key.split(path.sep).join("/"));
    }
  }
  await walk(root);
  return keys;
}

async function main(): Promise<void> {
  const rows = await db<FileRow>("directus_files").select(
    "id",
    "storage",
    "filename_disk",
    "compressed_key",
  );
  const missing: Orphan[] = [];
  const knownLocalKeys = new Set<string>();

  for (const row of rows) {
    const storage = await getStorageByName(row.storage);
    for (const [key, kind] of [
      [row.filename_disk, "original"],
      [row.compressed_key, "compressed"],
    ] as const) {
      if (!key) continue;
      if (row.storage === "local") knownLocalKeys.add(key);
      if (!storage) {
        missing.push({ id: row.id, key, kind });
        continue;
      }
      if (!(await storage.head(key))) missing.push({ id: row.id, key, kind });
    }
  }

  const root = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_ROOT ?? ".storage");
  let localKeys: string[] = [];
  try {
    localKeys = await listLocalKeys(root);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  const storageOnly = localKeys.filter((key) => !knownLocalKeys.has(key));

  console.log(`母集合: directus_files ${rows.length} 行（全 storage の original/compressed キー）`);
  console.log(`母集合: local ${localKeys.length} ファイル（bug-reports/ は除外）`);
  console.log("未確認: S3 バケット内の DB に無い実体（列挙 API が無いため対象外）");
  console.log(`DB に行があるが実体が無い: ${missing.length} 件`);
  for (const item of missing) console.log(`  ${item.id} ${item.kind} ${item.key}`);
  console.log(`local に実体があるが DB に行が無い: ${storageOnly.length} 件`);
  for (const key of storageOnly) console.log(`  ${key}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
