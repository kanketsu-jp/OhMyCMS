import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../lib/db/knex";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const sourcePath = path.join(repoRoot, "knowledge/decisions/permanent-fixtures-are-not-junk.md");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readFixtureNames(): Promise<string[]> {
  const markdown = await readFile(sourcePath, "utf8");
  const heading = /^## いま常設にしているもの\s*$/m.exec(markdown);
  if (!heading) return [];

  const afterHeading = markdown.slice(heading.index + heading[0].length);
  const nextHeading = /^##\s+/m.exec(afterHeading);
  const section = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading;
  const names: string[] = [];

  for (const line of section.split(/\r?\n/)) {
    const match = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (match) names.push(match[1]);
  }

  return names;
}

async function tableNamesInPublic(names: string[]): Promise<Set<string>> {
  const rows = await db("information_schema.tables")
    .select<{ table_name: string }[]>("table_name")
    .where({ table_schema: "public", table_type: "BASE TABLE" })
    .whereIn("table_name", names);

  return new Set(rows.map((row) => row.table_name));
}

async function main(): Promise<number> {
  console.log(`常設 fixture の SoT: ${sourcePath}`);

  let fixtures: string[];
  try {
    fixtures = await readFixtureNames();
  } catch (error) {
    console.error(`決定文書の表を読めませんでした: ${errorMessage(error)}`);
    console.log("解析した fixture 数: 0");
    console.log("結果: 決定文書の表を読めませんでした (exit 2)");
    return 2;
  }

  console.log(`解析した fixture 数: ${fixtures.length}`);
  if (fixtures.length === 0) {
    console.error("決定文書の表を読めませんでした: fixture が 0 件です");
    console.log("結果: 決定文書の表を読めませんでした (exit 2)");
    return 2;
  }

  let found: Set<string>;
  try {
    found = await tableNamesInPublic(fixtures);
  } catch (error) {
    console.error(`DB に接続できない、または table list を読めませんでした: ${errorMessage(error)}`);
    console.log("結果: DB に接続できない、または table list を読めませんでした (exit 2)");
    return 2;
  } finally {
    await db.destroy().catch(() => undefined);
  }

  const missing = fixtures.filter((name) => !found.has(name));
  for (const name of fixtures) {
    if (found.has(name)) {
      console.log(`✅ ${name} は DB にあります`);
    } else {
      console.log(`❌ ${name} が DB にありません（決定文書の表に載っています）`);
    }
  }

  if (missing.length > 0) {
    console.error(`常設 fixture が ${missing.length} 件ありません: ${missing.join(", ")}`);
    console.log(`結果: DB に接続できましたが、常設 fixture が不足しています (exit 1)`);
    return 1;
  }

  console.log(`常設 fixture を ${fixtures.length} 件確認しました`);
  console.log("結果: DB に接続でき、常設 fixture はすべて存在しました (exit 0)");
  return 0;
}

process.exit(await main());
