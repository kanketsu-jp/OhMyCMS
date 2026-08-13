import type { FieldResult } from "./models";
import { isFileField } from "./interfaces";

/**
 * フィールドの「一覧での見せ方（display）」のカタログ。
 *
 * 🚨 **interface（編集の見た目）と display（一覧の見た目）は別物**。これは Directus の考え方で、
 * `create_directus_fields.ts` は最初から両方の列を持っていた。**使っていなかっただけ**。
 *
 * 使わなかった結果どうなったか: 一覧も編集も `renderValue()` 1本で
 * 「オブジェクトなら `JSON.stringify`」していたので、**中括弧ごと画面に出ていた**
 * （堀池さん「json がそのまま書かれている」）。
 *
 * 🚨 Directus の実装18種を読むと、その中に **`raw`** がある:
 *     component: ({ value }) => typeof value === "string" ? value : JSON.stringify(value)
 * **私たちの `renderValue()` はこれと同じ**だった。違いは、Directus が
 * **利用者が明示的に選んだときだけ**使うのに対し、こちらは**全型の既定**にしていたこと。
 * → **`raw` は既定にしない。** 明示的に選んだときだけ。
 *
 * 🚨 ここは Next.js に依存させない（AGENTS.md §3.6）。**値をどう文字列にするかまで**を持ち、
 * React での描画は `components/admin/field-display.tsx` が持つ。
 * `interfaces.ts` と同じ分担・同じ関数構成にしてある（**新しい設計を持ち込まない**）。
 */

export const FIELD_DISPLAY_IDS = [
  "text",
  "boolean",
  "datetime",
  "file",
  "relation",
  "richtext",
  "json",
  "raw",
] as const;

export type FieldDisplayId = (typeof FIELD_DISPLAY_IDS)[number];

type FieldDisplaySpec = {
  id: FieldDisplayId;
  /** この display を選べる型。`raw` はどの型でも選べる（Directus の `types: TYPES` と同じ） */
  types: readonly string[];
};

const ALL_TYPES = [
  "string", "text", "integer", "bigInteger", "float", "decimal",
  "boolean", "date", "time", "dateTime", "timestamp", "uuid", "json",
] as const;

const FIELD_DISPLAYS: readonly FieldDisplaySpec[] = [
  { id: "text", types: ["string", "text", "integer", "bigInteger", "float", "decimal", "uuid"] },
  { id: "boolean", types: ["boolean"] },
  { id: "datetime", types: ["date", "time", "dateTime", "timestamp"] },
  { id: "file", types: ["uuid"] },
  { id: "relation", types: ["uuid", "integer", "bigInteger"] },
  // 本文。保存形式は ProseMirror の doc JSON なので、載る型は json だけ（interfaces.ts の richtext と対）
  { id: "richtext", types: ["json"] },
  { id: "json", types: ["json"] },
  // 🚨 逃げ道。**既定にしない**
  { id: "raw", types: ALL_TYPES },
];

export function isFieldDisplayId(value: unknown): value is FieldDisplayId {
  return typeof value === "string"
    && (FIELD_DISPLAY_IDS as readonly string[]).includes(value);
}

/** その型で選べる display の一覧 */
export function displaysForType(type: string): FieldDisplayId[] {
  return FIELD_DISPLAYS.filter((spec) => spec.types.includes(type)).map((spec) => spec.id);
}

export function isDisplayAllowedForType(id: string, type: string): boolean {
  return isFieldDisplayId(id) && displaysForType(type).includes(id);
}

/** 相手（別のコレクションの行）を指しているフィールドか。 */
export function isRelationField(field: Pick<FieldResult, "schema">): boolean {
  const table = field.schema?.foreign_key_table;
  return Boolean(table) && table !== "directus_files";
}

/**
 * `meta.display` が無いときに使う既定。
 * 🚨 **どれも JSON（中括弧）を出さない。** ここが「一覧に json が出る」の直し所そのもの。
 */
export function defaultDisplayForType(
  field: Pick<FieldResult, "field" | "type" | "schema" | "meta">,
): FieldDisplayId {
  if (isFileField(field)) return "file";
  if (isRelationField(field)) return "relation";
  if (field.type === "boolean") return "boolean";
  if (["date", "time", "dateTime", "timestamp"].includes(field.type)) return "datetime";
  if (field.type === "json") {
    // 本文として編集させているなら、一覧も本文として見せる（interface と対にする）
    return field.meta?.interface === "richtext" ? "richtext" : "json";
  }
  return "text";
}

/**
 * このフィールドを一覧でどう見せるかを決める。
 *
 * `meta.display` が入っていればそれを使うが、**型に対して許されている場合だけ**。
 * 型を変えた・古い値が残っている等で不整合になっても、一覧が壊れず既定へ落ちる
 * （`resolveFieldInterface` と同じ考え方）。
 */
export function resolveFieldDisplay(
  field: Pick<FieldResult, "field" | "type" | "meta" | "schema">,
): FieldDisplayId {
  const declared = field.meta?.display;
  if (typeof declared === "string" && isDisplayAllowedForType(declared, field.type)) {
    return declared as FieldDisplayId;
  }
  return defaultDisplayForType(field);
}

// ── 値 → 文字列（純関数。React を持ち込まない） ──────────────────────────

/** ProseMirror の doc JSON から本文だけを拾って1行にする。 */
export function richTextToPlain(value: unknown, limit = 80): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof record.text === "string") parts.push(record.text);
    if (Array.isArray(record.content)) for (const child of record.content) walk(child);
  };
  walk(value);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * json の中身を1行で요約する。
 * 🚨 **中括弧を出さない。** 「何が入っているか」が分かれば一覧の役目は足りる。
 * 件数の文言は呼び出し側（辞書を持つ側）で作るので、ここは件数だけ返す。
 */
export type JsonSummary =
  | { kind: "empty" }
  | { kind: "list"; count: number }
  | { kind: "text"; text: string }
  | { kind: "fields"; count: number };

export function summarizeJson(value: unknown, limit = 60): JsonSummary {
  if (value === null || value === undefined) return { kind: "empty" };
  if (Array.isArray(value)) return { kind: "list", count: value.length };
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return { kind: "empty" };
    // 人が読める値が1つでもあれば、それを見せるのがいちばん親切
    const readable = entries.find(([, v]) => typeof v === "string" && v.trim() !== "");
    if (readable) {
      const text = String(readable[1]).trim();
      return { kind: "text", text: text.length > limit ? `${text.slice(0, limit)}…` : text };
    }
    return { kind: "fields", count: entries.length };
  }
  return { kind: "text", text: String(value) };
}
