import type { FieldResult } from "./models";

/**
 * フィールドの「見た目（インターフェース）」のカタログ。
 *
 * 型（type）は DB の列の型で、インターフェースは「その列を何で編集させるか」。
 * 1つの型に複数のインターフェースがありうる（json は生JSONでも本文エディタでも編集できる）。
 *
 * 🚨 ここは Next.js に依存させない（AGENTS.md §3.6）。
 * React コンポーネントへの解決は components/admin/field-input.tsx が持つ。
 */

export const FIELD_INTERFACE_IDS = [
  "input",
  "boolean",
  "json",
  "file",
  "richtext",
] as const;

export type FieldInterfaceId = (typeof FIELD_INTERFACE_IDS)[number];

type FieldInterfaceSpec = {
  id: FieldInterfaceId;
  /** このインターフェースを選べる型。空配列は「どの型でも選べない（既定でのみ使う）」 */
  types: readonly string[];
};

const FIELD_INTERFACES: readonly FieldInterfaceSpec[] = [
  { id: "input", types: ["string", "integer", "bigInteger", "float", "decimal", "date", "time", "dateTime", "uuid"] },
  { id: "boolean", types: ["boolean"] },
  { id: "json", types: ["json"] },
  { id: "file", types: ["uuid"] },
  // 本文（リッチテキスト）。保存形式は ProseMirror の doc JSON なので、載る型は json だけ。
  { id: "richtext", types: ["json"] },
];

export function isFieldInterfaceId(value: unknown): value is FieldInterfaceId {
  return typeof value === "string"
    && (FIELD_INTERFACE_IDS as readonly string[]).includes(value);
}

/** その型で選べるインターフェースの一覧（フィールド追加GUIの選択肢） */
export function interfacesForType(type: string): FieldInterfaceId[] {
  return FIELD_INTERFACES.filter((spec) => spec.types.includes(type)).map((spec) => spec.id);
}

export function isInterfaceAllowedForType(id: string, type: string): boolean {
  return isFieldInterfaceId(id) && interfacesForType(type).includes(id);
}

/**
 * 「ファイルを指すフィールド」かどうか。
 * 外部キーが directus_files を指していれば確実。指していなくても、
 * uuid 型で名前が file / image などなら実運用上ファイルとして扱う（既存の挙動を踏襲）。
 */
export function isFileField(field: Pick<FieldResult, "field" | "type" | "schema">): boolean {
  if (field.schema?.foreign_key_table === "directus_files") return true;
  return field.type === "uuid" && ["file", "image", "thumbnail", "photo"].includes(field.field);
}

/** meta.interface が無いときに使う既定。従来の item-form.tsx の分岐と同じ結果になる */
export function defaultInterfaceForType(
  field: Pick<FieldResult, "field" | "type" | "schema">,
): FieldInterfaceId {
  if (isFileField(field)) return "file";
  if (field.type === "boolean") return "boolean";
  if (field.type === "json") return "json";
  return "input";
}

/**
 * このフィールドを何で編集させるかを決める。
 *
 * meta.interface が入っていればそれを使うが、**型に対して許されている場合だけ**。
 * 型を変えた・古い値が残っている等で不整合になっても、フォームが壊れず既定へ落ちるようにする。
 */
export function resolveFieldInterface(
  field: Pick<FieldResult, "field" | "type" | "meta" | "schema">,
): FieldInterfaceId {
  const declared = field.meta?.interface;
  if (typeof declared === "string" && isInterfaceAllowedForType(declared, field.type)) {
    return declared as FieldInterfaceId;
  }
  return defaultInterfaceForType(field);
}
