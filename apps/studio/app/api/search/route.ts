import { requireActor } from "@/lib/auth/context";
import { getT } from "@/i18n/server";
import { errorResponse, ok } from "@/lib/schema/api";
import {
  search,
  type StaticEntry,
  type TranslatedEntry,
} from "@/lib/search/service";

export const runtime = "nodejs";

/** 検索語の上限。長すぎる ILIKE を投げさせない。 */
const MAX_QUERY_LENGTH = 100;

/**
 * 横断検索（F2-J）。**追加のみ**で、既存 API は変えていない（契約 §2-1）。
 *
 * 🚨 権限は `lib/search/service.ts` が既存の入口（listItems / listFiles /
 *    resolvePermission / requireAdminAccess）を通して決める。
 *    **ここで独自の判定を足さないこと。**
 *
 * 設定項目と画面の名前は辞書から来る。ドメイン層に文言を持たせないため、
 * ここで引いて渡す（`lib/` が i18n に依存しないようにする狙いもある）。
 */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);

    const t = await getT("search");
    const translate = (entries: StaticEntry[]): TranslatedEntry[] =>
      entries.map((entry) => ({ ...entry, label: t(entry.labelKey) }));

    return ok({ data: await search(actor, q, translate) });
  } catch (error) {
    return errorResponse(error);
  }
}
