import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../lib/db/knex";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const sourcePath = path.join(repoRoot, "knowledge/decisions/permanent-fixtures-are-not-junk.md");

const HEADING_RE = /^## いま常設にしているもの\s*$/m;
const NEXT_HEADING_RE = /^##\s+/m;
const ROW_RE = /^\|\s*`([^`]+)`\s*\|/;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 決定文書の markdown 文字列から「いま常設にしているもの」の表の名前を拾う純粋関数。
 * ファイルシステムに一切触れない（自己検査がメモリ上の写しを食わせられるようにするため）。
 */
export function parseFixtureNames(markdown: string): string[] {
  const heading = HEADING_RE.exec(markdown);
  if (!heading) return [];

  const afterHeading = markdown.slice(heading.index + heading[0].length);
  const nextHeading = NEXT_HEADING_RE.exec(afterHeading);
  const section = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading;
  const names: string[] = [];

  for (const line of section.split(/\r?\n/)) {
    const match = ROW_RE.exec(line);
    if (match) names.push(match[1]);
  }

  return names;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(haystack: string, needle: string): number {
  return needle ? haystack.split(needle).length - 1 : 0;
}

/**
 * 実物の表にある行を、名前をキーに1行まるごと（改行込み）で見つける。無ければ空文字。
 * 🚨 `|` で始まる表の行だけを対象にする（本文中の説明文にも同じ名前がバッククォート付きで
 * 出てくるため、単に「その名前を含む行」で探すと本文側を誤って拾って表の行を取り逃す）。
 */
function findRowLine(markdown: string, name: string): string {
  const match = new RegExp(`^\\|\\s*\`${escapeRegExp(name)}\`\\s*\\|.*\\n`, "m").exec(markdown);
  return match ? match[0] : "";
}

/** 見出しから次の見出しの直前までを丸ごと取り除いた写しを作る（節を消す）。 */
function withSectionRemoved(markdown: string): string {
  const heading = HEADING_RE.exec(markdown);
  if (!heading) return markdown;
  const afterHeading = markdown.slice(heading.index + heading[0].length);
  const nextHeading = NEXT_HEADING_RE.exec(afterHeading);
  const sectionEnd = nextHeading
    ? heading.index + heading[0].length + nextHeading.index
    : markdown.length;
  return markdown.slice(0, heading.index) + markdown.slice(sectionEnd);
}

/** 見出し直後に、表の行として読める囮を1行差し込んだ写しを作る。 */
function withBogusRowInserted(markdown: string): string {
  const heading = HEADING_RE.exec(markdown);
  if (!heading) return markdown;
  const insertAt = heading.index + heading[0].length;
  const bogusRow = "\n| `zz_selftest_not_real` | selftest | selftest |";
  return markdown.slice(0, insertAt) + bogusRow + markdown.slice(insertAt);
}

/**
 * 自己検査。実物の markdown を**メモリ上でだけ**壊して食わせ、パーサが本当に
 * 検出できているかをその場で確かめる。ファイルへの書き込み・一時ファイルは一切使わない。
 * 1つでも失敗したら false を返す（呼び出し側は DB の判定を出さずに終わる）。
 */
function runSelfTest(realMarkdown: string): boolean {
  console.log("■ 自己検査（実物の markdown をメモリ上で壊して、検出できることをその場で確かめる）");
  let ok = true;

  // ケース1: 実物の markdown → 1件以上を解析し、解析した名前を全部出力する
  const realNames = parseFixtureNames(realMarkdown);
  const case1Ok = realNames.length >= 1;
  console.log(
    `  ${case1Ok ? "✅" : "❌"} ケース1: 実物の markdown  → 解析 ${realNames.length} 件: ${realNames.join(", ") || "(なし)"}`,
  );
  if (!case1Ok) ok = false;

  // ケース2: 表の行を1つ取り除く → ちょうど1件減ること。置換件数も出す
  const targetName = realNames[realNames.length - 1] ?? "";
  const targetRow = targetName ? findRowLine(realMarkdown, targetName) : "";
  const removedCount = countOccurrences(realMarkdown, targetRow);
  const markdownRowRemoved = targetRow ? realMarkdown.replaceAll(targetRow, "") : realMarkdown;
  const namesAfterRemoval = parseFixtureNames(markdownRowRemoved);
  const case2Ok = removedCount > 0 && namesAfterRemoval.length === realNames.length - 1;
  console.log(
    `  ${case2Ok ? "✅" : "❌"} ケース2: 行を1つ取り除く（\`${targetName}\`）  置換 ${removedCount} 件 → 解析 ${namesAfterRemoval.length} 件（実物は ${realNames.length} 件）`,
  );
  if (removedCount === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、件数が減って見えても検査になっていない。");
  }
  if (!case2Ok) ok = false;

  // ケース3: 「## いま常設にしているもの」節を丸ごと取り除く → 0件になること
  const markdownSectionRemoved = withSectionRemoved(realMarkdown);
  const sectionRemovedChanged = markdownSectionRemoved !== realMarkdown;
  const namesAfterSectionRemoval = parseFixtureNames(markdownSectionRemoved);
  const case3Ok = sectionRemovedChanged && namesAfterSectionRemoval.length === 0;
  console.log(
    `  ${case3Ok ? "✅" : "❌"} ケース3: 節を丸ごと取り除く  → 解析 ${namesAfterSectionRemoval.length} 件`,
  );
  if (!sectionRemovedChanged) {
    console.error("     ↑ markdown が変化していない。節を取り除けていない。");
  }
  if (!case3Ok) ok = false;

  // ケース4: 囮の行を1つ差し込む → その名前が解析結果に含まれること（ハードコードでないことの証拠）
  const markdownBogusInserted = withBogusRowInserted(realMarkdown);
  const namesAfterBogusInsert = parseFixtureNames(markdownBogusInserted);
  const case4Ok =
    markdownBogusInserted !== realMarkdown && namesAfterBogusInsert.includes("zz_selftest_not_real");
  console.log(
    `  ${case4Ok ? "✅" : "❌"} ケース4: 囮の行 \`zz_selftest_not_real\` を差し込む  → 解析結果に含む: ${namesAfterBogusInsert.includes("zz_selftest_not_real")}`,
  );
  if (!case4Ok) ok = false;

  return ok;
}

/**
 * 表の名前を「実在するもの」の集合へ落とす。
 *
 * 🚨 **`コレクション.フィールド` の形も受け付ける**（2026-08-15 追加・schema）。
 * それまでは `information_schema.tables` しか見ていなかったので、**列を常設にしても
 * 何も守っていなかった**——表が残っていれば列が消えても通る。
 * 実際に起きた形: この開発 DB には **`interface=richtext` のフィールドが 1 本も無く**、
 * 本文エディタに**誰も画面で到達できなかった**（実測: `meta.interface` の実値は
 * `None: 293` / `'file': 1` のみ）。標本を足しても、守るものが無ければ次の掃除で消える。
 */
async function existingNames(names: string[]): Promise<Set<string>> {
  const 表の名 = names.filter((n) => !n.includes("."));
  const 列の名 = names.filter((n) => n.includes("."));
  const found = new Set<string>();

  if (表の名.length > 0) {
    const rows = await db("information_schema.tables")
      .select<{ table_name: string }[]>("table_name")
      .where({ table_schema: "public", table_type: "BASE TABLE" })
      .whereIn("table_name", 表の名);
    for (const row of rows) found.add(row.table_name);
  }

  if (列の名.length > 0) {
    const rows = await db("information_schema.columns")
      .select<{ table_name: string; column_name: string }[]>("table_name", "column_name")
      .where({ table_schema: "public" })
      // 表と列を別々に絞ってから、組み合わせで突き合わせる
      // （`whereIn` を2本かけるだけでは「別の表の同名列」が通ってしまう）。
      .whereIn("table_name", 列の名.map((n) => n.split(".")[0]))
      .whereIn("column_name", 列の名.map((n) => n.split(".").slice(1).join(".")));
    const 実在 = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const name of 列の名) if (実在.has(name)) found.add(name);
  }

  return found;
}

async function main(): Promise<number> {
  console.log(`常設 fixture の SoT: ${sourcePath}`);

  let markdown: string;
  try {
    markdown = await readFile(sourcePath, "utf8");
  } catch (error) {
    console.error(`決定文書の表を読めませんでした: ${errorMessage(error)}`);
    console.log("解析した fixture 数: 0");
    console.log("結果: 決定文書の表を読めませんでした (exit 2)");
    return 2;
  }

  const selfTestOk = runSelfTest(markdown);
  if (!selfTestOk) {
    console.error(
      "\n🚨 自己検査に失敗した。この検査（パーサ）は信用できない。DB についての判定は出さない (exit 2)。",
    );
    return 2;
  }

  const fixtures = parseFixtureNames(markdown);

  console.log(`解析した fixture 数: ${fixtures.length}`);
  if (fixtures.length === 0) {
    console.error("決定文書の表を読めませんでした: fixture が 0 件です");
    console.log("結果: 決定文書の表を読めませんでした (exit 2)");
    return 2;
  }

  let found: Set<string>;
  try {
    found = await existingNames(fixtures);
  } catch (error) {
    console.error(`DB に接続できない、または表・列の一覧を読めませんでした: ${errorMessage(error)}`);
    console.log("結果: DB に接続できない、または表・列の一覧を読めませんでした (exit 2)");
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
