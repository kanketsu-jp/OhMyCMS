import { db } from "@/lib/db/knex";
import {
  isRichTextDocument,
  plainColumnName,
  sanitizeDocument,
  toPlainText,
  type RichTextDocument,
} from "@/lib/richtext/document";
// 型だけの参照なので実行時の循環にはならない（service.ts がこのファイルを使う）
import type { Item } from "./service";

/**
 * 本文（リッチテキスト）フィールドの保存前検証。
 *
 * 🚨 **クライアント側の検証を当てにしない。** エディタは `javascript:` のリンクを作らせないが、
 * `/api/items/...` は誰でも直接叩けるので、**サーバでもう一度落とす**
 * （AGENTS.md §3.5「フィルタで隠すのでなく、サーバ側で拒否する」と同じ考え方）。
 *
 * ここで落とすのは「危ない値」だけで、本文そのものは通す。
 * サニタイズは配信時にもう一度行う（後でルールを厳しくしたとき、過去のデータも救えるようにするため）。
 */
export async function sanitizeRichTextFields(
  collection: string,
  payload: Item,
): Promise<Item> {
  const keys = Object.keys(payload);
  if (keys.length === 0) return payload;

  const richTextFields = await richTextFieldsFor(collection, keys);
  if (richTextFields.size === 0) return payload;

  const plainColumns = await existingColumns(
    collection,
    [...richTextFields].map(plainColumnName),
  );

  const result: Item = { ...payload };
  for (const field of richTextFields) {
    const value = result[field];
    if (value === null || value === undefined) {
      // 本文を消したら、検索用の相方も一緒に消す（残すと消したはずの本文で検索に出る）
      setPlain(result, field, plainColumns, null);
      continue;
    }

    const parsed = parseDocument(value);
    // doc の形をしていない値は本文として保存させない（型は jsonb なので何でも入ってしまう）
    const safe = parsed ? sanitizeDocument(parsed) : null;
    result[field] = safe;

    // 🚨 本文と同じ書き込みの中で相方を更新する。別の更新に分けない。
    // 片方だけ古いと「検索に出るのに中身が違う」になる。
    setPlain(result, field, plainColumns, safe ? toPlainText(safe) : null);
  }
  return result;
}

/**
 * 検索用の相方の列へ値を入れる。
 *
 * 列が無いコレクション（本文フィールドを作る前からあるデータ等）では**何もしない**。
 * 無い列を payload に足すと INSERT ごと落ちるため。
 *
 * この値は利用者が直接書くものではなく本文から導出されるので、
 * フィールド単位の権限チェック（`assertPayloadAllowed`）より後に足している。
 * 本文を書ける人は、その導出物も書けるべきという判断。
 */
function setPlain(
  target: Item,
  field: string,
  existing: Set<string>,
  value: string | null,
): void {
  const column = plainColumnName(field);
  if (!existing.has(column)) return;
  target[column] = value;
}

async function existingColumns(
  collection: string,
  candidates: string[],
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const rows = await db("information_schema.columns")
    .select("column_name")
    .where({ table_schema: "public", table_name: collection })
    .whereIn("column_name", candidates) as { column_name: string }[];

  return new Set(rows.map((row) => row.column_name));
}

async function richTextFieldsFor(
  collection: string,
  keys: string[],
): Promise<Set<string>> {
  const rows = await db("directus_fields")
    .select("field")
    .where({ collection, interface: "richtext" })
    .whereIn("field", keys) as { field: string }[];

  return new Set(rows.map((row) => row.field));
}

function parseDocument(value: unknown): RichTextDocument | null {
  if (isRichTextDocument(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (isRichTextDocument(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}
