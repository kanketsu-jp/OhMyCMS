"use client";

// 🚨 **2026-08-16 に Server Component から client へ移した**（design 案A）。
//    理由: 表示モード / 編集モードは client の state でしか持てない
//    （規約 `knowledge/decisions/action-button-and-edit-mode.md`）。
//    サーバ専用だったのは `getLocale()` / `getT()` の 2 つだけで、どちらも client 版が在る。
//    🚨 **これで `components/admin` から Server Component が無くなった**
//    （1 枚だけ違うほうが事故のもと、という design の判断）。
import * as React from "react";
import { Check, Pencil, X } from "lucide-react";

import type { FieldResult } from "@/lib/schema/models";
import { PageAction } from "@/components/admin/page-action";
import { FieldValue } from "@/components/ui/field-value";
import { FormDraft } from "@/components/admin/form-draft";
import { FilePicker } from "@/components/admin/file-picker";
import { RichTextField } from "@/components/admin/rich-text-field";
import { CopyButton } from "@/components/ui/copy-button";
import { useLocale, useT } from "@/i18n/client";
import { fieldLabel } from "@/lib/schema/labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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


export function ItemForm({ collection, fields, itemId, item }: Props) {
  const locale = useLocale();
  const t = useT("fields");
  const tItems = useT("items");
  const tCommon = useT("common");
  const isEdit = Boolean(item);
  /**
   * 表示モード ⇄ 編集モード。
   *
   * 🚨 **新規作成（`/new`）は最初から編集モード**（初期値 `!isEdit`）。
   *    297 A（堀池さん）: 「**〜/new のような新規作成ページの場合、そこに必要なのは保存です。
   *    編集じゃない**」。**この部品は `/new` と `/[id]` で共用**なので、ここで分ける。
   */
  const [editing, setEditing] = React.useState(!isEdit);
  const [booleanValues, setBooleanValues] = React.useState<Record<string, boolean>>({});
  /** 🚨 「やめる」で**入れた値を捨てる**ための鍵（規約 §2-2。欄は uncontrolled）。 */
  const [formKey, setFormKey] = React.useState(0);
  const cancelEditing = React.useCallback(() => {
    setEditing(false);
    setFormKey((k) => k + 1);
  }, []);
  const visibleFields = fields.filter((field) => {
    if (!field.schema) return false;
    if (!isEdit && isGeneratedPrimaryUuid(field)) return false;
    // 🚨 hidden の列は書き手に見せない。本文の検索用の相方（`<field>_plain`）が
    // 生のテキスト欄として出てしまうため（中身は本文から導出される）。
    if (field.meta?.hidden) return false;
    return true;
  });
  const primaryKeyField = fields.find((field) => field.schema?.is_primary_key)?.field;
  const hasTrash = fields.some((field) => field.field === "deleted_at");
  const deleteOption = {
    label: tItems("delete_button"),
    formId: "item-form",
    submitName: "_method",
    submitValue: "delete",
    destructive: true,
    confirm: {
      title: tItems("delete_confirm_title"),
      description: hasTrash ? tItems("delete_confirm_soft") : tItems("delete_confirm_hard"),
      confirmLabel: tItems("delete_button"),
      tone: hasTrash ? "default" as const : "danger" as const,
    },
  };
  const copyOption = {
    label: tItems("copy_button"),
    formId: "item-form",
    submitName: "_method",
    submitValue: "copy",
  };

  return (
    <form
      // 🚨 `key` を増やすと作り直され、`defaultValue` が引き直される（「やめる」の実体）
      key={formKey}
      id="item-form"
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
        // 🚨 **2 つの「変えられない」を分ける**（混ぜると挙動が食い違う）:
        //   `pkReadonly` … 主キー。**モードに関係なく**永久に変えられない（書き込みにも送らない）
        //   `readonly` …… 上に加えて、**表示モードだから**変えられない
        const pkReadonly = isEdit && field.schema?.is_primary_key === true;
        const readonly = pkReadonly || !editing;
        const value = item?.[field.field];
        const fieldName = `field:${field.field}`;
        // 🚨 何で編集させるかは **meta.interface** が決める（型は DB の列の型でしかない）。
        // meta.interface が無い／型に合わない場合だけ、型から既定へ落ちる。
        const ui = resolveFieldInterface(field);
        const widthClass = ui === "json" ? "md:max-w-2xl" : fieldWidthClass(field);
        const inputValue = field.type === "dateTime" ? dateTimeValue(value) : valueForInput(value);
        // 🚨 `pkReadonly` のときだけ。**表示モードで全部の欄にコピーボタンを出さない**
        //    （出すと画面が賑やかになり、「この欄だけ特別」という元の意味も消える）。
        const canCopyReadonly =
          pkReadonly && ui !== "file" && ui !== "richtext" && ui !== "boolean";

        return (
          <div key={field.field} className="space-y-1.5">
            {/* 🚨 書き込み対象の印。**主キーかどうか**で決める（表示モードでも消さない）。
                モードで消すと、編集モードへ入った瞬間に作り直されるだけなので害は無いが、
                **「送らない理由」が 2 つ混ざる**ので分けておく。 */}
            {!pkReadonly ? <input type="hidden" name="__field" value={field.field} /> : null}
            {field.field === primaryKeyField ? (
              <input type="hidden" name="__primary_key" value={field.field} />
            ) : null}
            <input type="hidden" name={`__type:${field.field}`} value={field.type} />
            <input
              type="hidden"
              name={`__nullable:${field.field}`}
              value={String(field.schema?.is_nullable !== false)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={fieldName}>
                {/* 🚨 欄名は辞書を通す（設問286 A）。辞書が無ければ fieldLabel が
                    生の識別子に落ちるので、名前を付けるまで表示は変わらない。 */}
                {fieldLabel(field, locale)}
                {required ? <span className="text-destructive">*</span> : null}
              </Label>
              {canCopyReadonly ? (
                <CopyButton
                  value={ui === "json" ? valueForInput(value) : inputValue}
                  selectTargetId={fieldName}
                  data-copy-target={fieldName}
                  // 🚨 **何をコピーするかをボタン自身が言う**（DESIGN.md §2-12・堀池 2026-08-17 AM1。
                  //    原文:「これはボタン自体が「IDをコピー」と表示するべき。」）。
                  //    隣の `<Label>` と同じ表示名を渡す——**ボタンだけを見た人に伝わる**ようにする。
                  what={fieldLabel(field, locale)}
                />
              ) : null}
            </div>
            <div className={widthClass}>
              {ui === "file" && !pkReadonly ? (
                <FilePicker
                  inputId={fieldName}
                  name={fieldName}
                  // 🚨 表示モードは**選んだファイルだけ**（選ぶ入口も解除も出ない。design 案エ）
                  readOnly={!editing}
                  defaultValue={valueForInput(value)}
                />
              ) : ui === "richtext" && !pkReadonly ? (
                <RichTextField
                  inputId={fieldName}
                  name={fieldName}
                  // 🚨 表示モードは `editable: false`（本文の見え方を変えずに書けなくする。design 案ア）
                  editable={editing}
                  defaultValue={value}
                  required={required}
                />
              ) : ui === "boolean" ? (
                // 🚨 `checkbox` は `readOnly` が**効かない**（実測 2026-08-16）。
                //    表示モードでは**要素ごと置き換えて値を文字で出す**（§2-1 案 2。✓ の絵にしない）。
                !editing ? (
                  <FieldValue id={fieldName}>
                    {tCommon(value === true ? "state_enabled" : "state_disabled")}
                  </FieldValue>
                ) : (
                <label className="flex h-(--control-h) items-center gap-2 text-sm md:h-(--control-h-pc-field)">
                  <Checkbox
                    id={fieldName}
                    checked={booleanValues[field.field] ?? value === true}
                    disabled={pkReadonly}
                    onCheckedChange={(checked) => {
                      setBooleanValues((current) => ({ ...current, [field.field]: checked === true }));
                    }}
                  />
                  {!pkReadonly ? (
                    <input
                      type="hidden"
                      name={fieldName}
                      value={(booleanValues[field.field] ?? value === true) ? "true" : "false"}
                    />
                  ) : null}
                  {t("yes")}
                </label>
                )
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
      {/* 🚨 主ボタンはモードで変わる（規約 §2）。
          🚨 **新規作成（`/new`）は最初から編集モード**なので、「編集する」は出ない（297 A）。
             `editing` の初期値が `!isEdit` なので、この分岐がそのまま両方を満たす。 */}
      {editing ? (
        <>
          {/* 🚨 「やめる」は**既存を直しているときだけ**。新規作成には**戻る先が無い**
              （作りかけを捨てる操作は「画面を離れる」であって、モードを戻すことではない）。 */}
          {isEdit ? (
            <PageAction
              role="secondary"
              label={tCommon("action_cancel")}
              icon={<X />}
              onClick={cancelEditing}
            />
          ) : null}
          <PageAction
            form="item-form"
            role="primary"
            label={isEdit ? tCommon("action_save") : tItems("create_button")}
            icon={<Check />}
            options={isEdit ? [copyOption, deleteOption] : undefined}
          />
        </>
      ) : (
        <PageAction
          role="primary"
          label={tCommon("action_edit")}
          icon={<Pencil />}
          onClick={() => setEditing(true)}
          options={isEdit ? [copyOption, deleteOption] : undefined}
        />
      )}
    </form>
  );
}
