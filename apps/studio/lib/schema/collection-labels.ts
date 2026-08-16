import type { CollectionResult } from "./models";
import { fieldLabel } from "./labels";

/**
 * コレクションの表示名を、ロケードごとの辞書から解決する（設問318）。
 *
 * 🚨 **`fieldLabel` と同じ解決順**（完全一致 → 言語だけ → fallback → 生の識別子）。
 * 解決の規則を 2 つ持つと、**欄とコレクションで名前の出方が食い違う**——
 * 利用者から見れば同じ「名前」なので、**同じ規則で解く**。
 *
 * 🚨 **実装も分けない。** `fieldLabel` は `{ field, meta }` の形しか見ないので、
 * コレクションを**その形に写して**渡す。規則を写経すると、片方だけ直したときに割れる。
 *
 * 🚨 **`note` を表示名として使わない**（2026-08-16 実測でゴミ箱がそうしていた）。
 * `note` の画面上のラベルは「**メモ**」であり、
 * 利用者が説明のつもりで書いた文が見出しになるのは、意図と違う。
 */
export function collectionLabel(
  collection: Pick<CollectionResult, "collection" | "meta">,
  locale: string,
  fallbackLocale = "ja",
): string {
  return fieldLabel(
    { field: collection.collection, meta: { translations: collection.meta?.translations ?? null } as never },
    locale,
    fallbackLocale,
  );
}
