import { db } from "@/lib/db/knex";
import {
  isRichTextDocument,
  sanitizeDocument,
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

  const result: Item = { ...payload };
  for (const field of richTextFields) {
    const value = result[field];
    if (value === null || value === undefined) continue;

    const parsed = parseDocument(value);
    // doc の形をしていない値は本文として保存させない（型は jsonb なので何でも入ってしまう）
    result[field] = parsed ? sanitizeDocument(parsed) : null;
  }
  return result;
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
