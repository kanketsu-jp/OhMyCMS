import Link from "next/link";

import { FieldDisplay, type DisplayLookup } from "@/components/admin/field-display";
import { getLocale } from "@/i18n/server";
import { fieldLabel } from "@/lib/schema/labels";
import type { FieldResult } from "@/lib/schema/models";
import { cn } from "@/lib/utils";

type ItemCardColumns = 1 | 2 | 3 | 4 | 5;

const DEFAULT_ITEM_CARD_COLUMNS: ItemCardColumns = 5;
const CARD_DETAIL_LIMIT = 3;

type Props = {
  items: Record<string, unknown>[];
  columns: FieldResult[];
  pk: string;
  collection: string;
  lookup: DisplayLookup;
};

function itemCardGridClass(columns: ItemCardColumns): string {
  switch (columns) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-1 sm:grid-cols-2";
    case 3:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
    case 4:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-4";
    case 5:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-5";
  }
}

export async function ItemCards({ items, columns, pk, collection, lookup }: Props) {
  const locale = await getLocale();
  const [titleField, ...detailFields] = columns;
  const encodedCollection = encodeURIComponent(collection);

  return (
    <div className={cn("grid gap-4", itemCardGridClass(DEFAULT_ITEM_CARD_COLUMNS))}>
      {items.map((item, index) => {
        const id = String(item[pk] ?? "");
        const href = `/admin/content/${encodedCollection}/${encodeURIComponent(id)}`;

        return (
          <Link
            key={id || index}
            href={href}
            className="block min-w-0 rounded-md p-3 transition-colors hover:bg-muted active:bg-muted/80"
          >
            {titleField ? (
              <div className="min-w-0 truncate text-sm font-medium">
                <FieldDisplay field={titleField} value={item[titleField.field]} lookup={lookup} />
              </div>
            ) : null}
            {detailFields.length > 0 ? (
              <dl className="mt-3 flex flex-col gap-2 text-xs">
                {detailFields.slice(0, CARD_DETAIL_LIMIT).map((field) => (
                  <div key={field.field} className="min-w-0">
                    <dt className="truncate text-muted-foreground">{fieldLabel(field, locale)}</dt>
                    <dd className="mt-0.5 min-w-0 truncate">
                      <FieldDisplay field={field} value={item[field.field]} lookup={lookup} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
