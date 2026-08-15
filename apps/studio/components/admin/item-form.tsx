import { Check } from "lucide-react";

import type { FieldResult } from "@/lib/schema/models";
import { PageAction } from "@/components/admin/page-action";
import { FormDraft } from "@/components/admin/form-draft";
import { FilePicker } from "@/components/admin/file-picker";
import { RichTextField } from "@/components/admin/rich-text-field";
import { CopyButton } from "@/components/ui/copy-button";
import { getT } from "@/i18n/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldWidthClass, resolveFieldInterface } from "@/lib/schema/interfaces";

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


export async function ItemForm({ collection, fields, itemId, item }: Props) {
  const t = await getT("fields");
  const tItems = await getT("items");
  const isEdit = Boolean(item);
  const visibleFields = fields.filter((field) => {
    if (!field.schema) return false;
    if (!isEdit && isGeneratedPrimaryUuid(field)) return false;
    // 🚨 hidden の列は書き手に見せない。本文の検索用の相方（`<field>_plain`）が
    // 生のテキスト欄として出てしまうため（中身は本文から導出される）。
    if (field.meta?.hidden) return false;
    return true;
  });

  return (
    <form id="item-form"
      action={
        isEdit
          ? `/admin/actions/items/${encodeURIComponent(collection)}/${encodeURIComponent(String(itemId ?? ""))}`
          : `/admin/actions/items/${encodeURIComponent(collection)}`
      }
      method="post"
      className="space-y-5"
    >
      <FormDraft formId="item-form" />
      {visibleFields.map((field) => {
        const required = field.schema?.is_nullable === false && !field.schema?.is_primary_key;
        const readonly = isEdit && field.schema?.is_primary_key === true;
        const value = item?.[field.field];
        const fieldName = `field:${field.field}`;
        // 🚨 何で編集させるかは **meta.interface** が決める（型は DB の列の型でしかない）。
        // meta.interface が無い／型に合わない場合だけ、型から既定へ落ちる。
        const ui = resolveFieldInterface(field);
        const widthClass = ui === "json" ? "md:max-w-2xl" : fieldWidthClass(field);
        const inputValue = field.type === "dateTime" ? dateTimeValue(value) : valueForInput(value);
        const canCopyReadonly =
          readonly && ui !== "file" && ui !== "richtext" && ui !== "boolean";

        return (
          <div key={field.field} className="space-y-1.5">
            {!readonly ? <input type="hidden" name="__field" value={field.field} /> : null}
            <input type="hidden" name={`__type:${field.field}`} value={field.type} />
            <input
              type="hidden"
              name={`__nullable:${field.field}`}
              value={String(field.schema?.is_nullable !== false)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={fieldName}>
                {field.field}
                {required ? <span className="text-destructive">*</span> : null}
              </Label>
              {canCopyReadonly ? (
                <CopyButton
                  value={ui === "json" ? valueForInput(value) : inputValue}
                  selectTargetId={fieldName}
                  data-copy-target={fieldName}
                />
              ) : null}
            </div>
            <div className={widthClass}>
              {ui === "file" && !readonly ? (
                <FilePicker
                  inputId={fieldName}
                  name={fieldName}
                  defaultValue={valueForInput(value)}
                />
              ) : ui === "richtext" && !readonly ? (
                <RichTextField
                  inputId={fieldName}
                  name={fieldName}
                  defaultValue={value}
                  required={required}
                />
              ) : ui === "boolean" ? (
                <label className="flex h-(--control-h) items-center gap-2 text-sm md:h-(--control-h-pc-field)">
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
              ) : ui === "json" ? (
                <Textarea
                  id={fieldName}
                  name={fieldName}
                  required={required}
                  readOnly={readonly}
                  defaultValue={valueForInput(value)}
                  className="min-h-36"
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
                  defaultValue={inputValue}
                />
              )}
            </div>
          </div>
        );
      })}
      {visibleFields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty_fields")}</p>
      ) : null}
      {/* 🚨 主要アクションは**ヘッダー（PC）と下部ナビ（SP）へ portal で出す**。
          `lib/admin/page-actions.ts` が
            /admin/content/[collection]/new  → items.create_button
            /admin/content/[collection]/[id] → items.save_button
          を `kind:"submit" form:"item-form" role:"primary"` として**宣言していたのに、
          どの画面も PageAction を描いていなかった**（2026-08-15 実測。宣言だけがあり、
          画面には保存ボタンが無かった）。
          🚨 ここに `<Button type="submit">` を**併置しない**。併置すると保存が 2 箇所に出る。
             ボタンはこの form の外（ヘッダー）に描かれるので、HTML の `form` 属性で結ぶ。 */}
      <PageAction
        form="item-form"
        role="primary"
        label={isEdit ? tItems("save_button") : tItems("create_button")}
        icon={<Check />}
      />
    </form>
  );
}
