import type { FieldResult } from "@/lib/schema/models";

type CalendarField = Pick<FieldResult, "field" | "type">;

function isCalendarField(field: CalendarField): boolean {
  return field.type === "date" || field.type === "dateTime";
}

export function resolveCalendarField(
  fields: CalendarField[],
  raw: string | string[] | undefined,
): string | null {
  if (typeof raw === "string" && raw !== "") {
    const selected = fields.find((field) => field.field === raw);
    if (selected && isCalendarField(selected)) return selected.field;
  }

  return fields.find(isCalendarField)?.field ?? null;
}

export function resolveCalendarMonth(
  raw: string | string[] | undefined,
  now: Date,
): { year: number; month: number } {
  if (typeof raw === "string") {
    const match = /^(\d{4})-(\d{2})$/.exec(raw);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) return { year, month };
    }
  }

  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
