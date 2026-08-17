import Link from "next/link";

import { FieldDisplay } from "@/components/admin/field-display";
import { getFormat, getT } from "@/i18n/server";
import type { FieldResult } from "@/lib/schema/models";
import { cn } from "@/lib/utils";

type Props = {
  items: Record<string, unknown>[];
  fields: FieldResult[];
  pk: string;
  collection: string;
  dateField: string | null;
  month: { year: number; month: number };
};

type CalendarDay = {
  key: string;
  date: Date;
  inMonth: boolean;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function itemDateKey(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return dateKey(date);
}

function calendarDays(month: { year: number; month: number }): CalendarDay[] {
  const first = new Date(month.year, month.month - 1, 1);
  const daysInMonth = new Date(month.year, month.month, 0).getDate();
  const rows = Math.ceil((first.getDay() + daysInMonth) / 7);
  const days: CalendarDay[] = [];

  for (let index = 0; index < rows * 7; index += 1) {
    const date = new Date(month.year, month.month - 1, index - first.getDay() + 1);
    days.push({
      key: dateKey(date),
      date,
      inMonth: date.getMonth() === month.month - 1,
    });
  }

  return days;
}

export async function ItemCalendar({ items, fields, pk, collection, dateField, month }: Props) {
  const t = await getT("items");
  const format = await getFormat();

  if (dateField === null) {
    return <p className="text-sm text-muted-foreground">{t("calendar_needs_date_field")}</p>;
  }

  const [titleField] = fields;
  const encodedCollection = encodeURIComponent(collection);
  const itemsByDay = new Map<string, Record<string, unknown>[]>();

  for (const item of items) {
    const key = itemDateKey(item[dateField]);
    if (!key) continue;
    const dayItems = itemsByDay.get(key) ?? [];
    dayItems.push(item);
    itemsByDay.set(key, dayItems);
  }

  return (
    // 🚨 外枠に罫線を持たせない。この格子は面（Surface）の中に描かれるので、
    //    枠を付けると面が 2 段になる（knowledge/decisions/no-nested-surfaces）。
    //    升目の区切りは、各セルの下線・右線だけで出す。
    <div className="grid grid-cols-7">
      {calendarDays(month).map((day) => {
        const dayItems = itemsByDay.get(day.key) ?? [];

        return (
          <div
            key={day.key}
            className={cn(
              "min-h-32 min-w-0 border-b border-r p-2",
              !day.inMonth && "bg-muted/30 text-muted-foreground",
            )}
          >
            <div className="mb-2 text-xs text-muted-foreground" aria-label={format.date(day.date)}>
              {format.number(day.date.getDate())}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              {dayItems.map((item, index) => {
                const id = String(item[pk] ?? "");
                const href = `/admin/content/${encodedCollection}/${encodeURIComponent(id)}`;

                return (
                  <Link
                    key={id || index}
                    href={href}
                    className="block min-w-0 truncate rounded px-2 py-1 text-xs transition-colors hover:bg-muted active:bg-muted/80"
                  >
                    {titleField ? (
                      <FieldDisplay field={titleField} value={item[titleField.field]} />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
