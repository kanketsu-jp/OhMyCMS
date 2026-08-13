import type { FieldResult } from "@/lib/schema/models";
import { FilePicker } from "@/components/admin/file-picker";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  collection: string;
  fields: FieldResult[];
  itemId?: string;
  item?: Record<string, unknown>;
};

function valueForInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function dateTimeValue(value: unknown): string {
  const raw = valueForInput(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
  return date.toISOString().slice(0, 16);
}

function isGeneratedPrimaryUuid(field: FieldResult): boolean {
  return field.type === "uuid" && field.schema?.is_primary_key === true;
}

function isFileField(field: FieldResult): boolean {
  if (field.schema?.foreign_key_table === "directus_files") return true;
  return field.type === "uuid" && ["file", "image", "thumbnail", "photo"].includes(field.field);
}

export async function ItemForm({ collection, fields, itemId, item }: Props) {
  const t = await getT("fields");
  const tItems = await getT("items");
  const isEdit = Boolean(item);
  const visibleFields = fields.filter((field) => {
    if (!field.schema) return false;
    if (!isEdit && isGeneratedPrimaryUuid(field)) return false;
    return true;
  });

  return (
    <form
      action={
        isEdit
          ? `/admin/actions/items/${encodeURIComponent(collection)}/${encodeURIComponent(String(itemId ?? ""))}`
          : `/admin/actions/items/${encodeURIComponent(collection)}`
      }
      method="post"
      className="space-y-5"
    >
      {visibleFields.map((field) => {
        const required = field.schema?.is_nullable === false && !field.schema?.is_primary_key;
        const readonly = isEdit && field.schema?.is_primary_key === true;
        const value = item?.[field.field];
        const fieldName = `field:${field.field}`;

        return (
          <div key={field.field} className="space-y-1.5">
            {!readonly ? <input type="hidden" name="__field" value={field.field} /> : null}
            <input type="hidden" name={`__type:${field.field}`} value={field.type} />
            <input
              type="hidden"
              name={`__nullable:${field.field}`}
              value={String(field.schema?.is_nullable !== false)}
            />
            <Label htmlFor={fieldName}>
              {field.field}
              {required ? <span className="text-destructive">*</span> : null}
            </Label>
            {isFileField(field) && !readonly ? (
              <FilePicker
                inputId={fieldName}
                name={fieldName}
                defaultValue={valueForInput(value)}
              />
            ) : field.type === "boolean" ? (
              <label className="flex h-(--control-h) items-center gap-2 text-sm md:h-(--control-h-pc)">
                <input
                  id={fieldName}
                  type="checkbox"
                  name={fieldName}
                  value="true"
                  defaultChecked={value === true}
                  disabled={readonly}
                  className="size-4"
                />
                {t("yes")}
              </label>
            ) : field.type === "json" ? (
              <textarea
                id={fieldName}
                name={fieldName}
                required={required}
                readOnly={readonly}
                defaultValue={valueForInput(value)}
                className="min-h-36 w-full rounded-lg bg-muted/60 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            ) : (
              <Input
                id={fieldName}
                name={fieldName}
                type={
                  field.type === "dateTime"
                    ? "datetime-local"
                    : field.type === "date"
                      ? "date"
                      : field.type === "time"
                        ? "time"
                        : ["integer", "bigInteger", "float", "decimal"].includes(field.type)
                          ? "number"
                          : "text"
                }
                step={["float", "decimal"].includes(field.type) ? "any" : undefined}
                maxLength={field.type === "string" ? field.schema?.max_length ?? undefined : undefined}
                required={required}
                readOnly={readonly}
                defaultValue={field.type === "dateTime" ? dateTimeValue(value) : valueForInput(value)}
              />
            )}
          </div>
        );
      })}
      {visibleFields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty_fields")}</p>
      ) : null}
      <Button type="submit">{isEdit ? tItems("save_button") : tItems("create_button")}</Button>
    </form>
  );
}
