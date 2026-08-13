export const NOTICE_KEYS = [
  "item_created",
  "item_deleted",
  "item_saved",
  "field_created",
  "relation_created",
  "relation_deleted",
  "collection_deleted",
] as const;

export type NoticeKey = (typeof NOTICE_KEYS)[number];

const NOTICE_KEY_SET: ReadonlySet<string> = new Set(NOTICE_KEYS);

export function noticeKeyFromQuery(value: string | undefined): NoticeKey | null {
  return value && NOTICE_KEY_SET.has(value) ? (value as NoticeKey) : null;
}
