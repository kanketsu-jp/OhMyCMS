"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useT } from "@/i18n/client";
import type { FilterCondition } from "@/lib/items/parse-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Condition = FilterCondition;

type Props = {
  fields: readonly { field: string; label: string; type: string }[];
  initialConditions: Condition[];
  invalidFilter: boolean;
};

const OPERATORS = [
  "_eq", "_neq", "_lt", "_lte", "_gt", "_gte", "_in", "_nin", "_null", "_nnull",
  "_contains", "_ncontains", "_icontains", "_starts_with", "_ends_with", "_between",
  "_nbetween", "_empty", "_nempty",
] as const;

function fieldKind(type: string): "text" | "number" | "boolean" | "date" {
  if (["integer", "bigInteger", "float", "decimal"].includes(type)) return "number";
  if (type === "boolean") return "boolean";
  if (["date", "dateTime", "time"].includes(type)) return "date";
  return "text";
}

function operatorsFor(type: string): readonly string[] {
  const kind = fieldKind(type);
  if (kind === "boolean") return ["_eq"];
  if (kind === "number" || kind === "date") {
    return ["_eq", "_neq", "_lt", "_lte", "_gt", "_gte", "_in", "_nin", "_null", "_nnull", "_between", "_nbetween"];
  }
  return OPERATORS;
}

function fieldFor(fields: Props["fields"], name: string) {
  return fields.find((field) => field.field === name) ?? fields[0];
}

function valueFor(condition: Condition, type: string): unknown {
  if (["_null", "_nnull", "_empty", "_nempty"].includes(condition.operator)) return true;
  if (condition.operator === "_in" || condition.operator === "_nin") {
    return String(condition.value ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  }
  if (condition.operator === "_between" || condition.operator === "_nbetween") {
    return Array.isArray(condition.value) ? condition.value : ["", ""];
  }
  if (fieldKind(type) === "number") return Number(condition.value);
  return condition.value ?? "";
}

/**
 * アイテム一覧の一段フィルター編集部品。
 *
 * 🚨 条件を適用すると `q` とページ番号を消して先頭ページへ戻す。フィルター結果が空に見える状態を残さない。
 *    演算子はフィールド型ごとに絞り、無効な条件をそのまま URL へ書かない。
 *
 * 参考: `lib/items/parse-filter.ts` ／ DESIGN.md §2-8
 */
export function ItemFilter({ fields, initialConditions, invalidFilter }: Props) {
  const t = useT("items");
  const [conditions, setConditions] = useState<Condition[]>(initialConditions);
  const [draft, setDraft] = useState<Condition[]>(initialConditions.length ? initialConditions : [{ field: fields[0]?.field ?? "", operator: "_eq", value: "" }]);

  const update = (index: number, patch: Partial<Condition>) => {
    setDraft((current) => current.map((condition, position) => position === index ? { ...condition, ...patch } : condition));
  };
  const apply = () => {
    const next = draft.filter((condition) => condition.field && condition.operator).map((condition) => ({
      ...condition,
      value: valueFor(condition, fieldFor(fields, condition.field)?.type ?? "string"),
    }));
    setConditions(next);
    const url = new URL(window.location.href);
    if (next.length === 0) url.searchParams.delete("filter");
    else url.searchParams.set("filter", JSON.stringify({ _and: next.map(({ field, operator, value }) => ({ [field]: { [operator]: value } })) }));
    url.searchParams.delete("q");
    url.searchParams.delete("page");
    window.location.assign(url.toString());
  };
  const remove = (index: number) => setDraft((current) => current.filter((_, position) => position !== index));

  return (
    <div className="space-y-3" data-filter-ui="one-level">
      {invalidFilter ? <p className="text-base text-destructive">{t("filter_invalid")}</p> : null}
      {draft.map((condition, index) => {
        const field = fieldFor(fields, condition.field);
        const operators = operatorsFor(field?.type ?? "string");
        const operator = operators.includes(condition.operator) ? condition.operator : operators[0];
        const noValue = ["_null", "_nnull", "_empty", "_nempty"].includes(operator);
        const twoValues = ["_between", "_nbetween"].includes(operator);
        return (
          <div className="flex flex-wrap items-end gap-2" key={`${index}-${condition.field}`}>
            <label className="min-w-40 flex-1 space-y-1 text-sm">
              <span>{t("filter_field")}</span>
              <Select value={condition.field} onValueChange={(value) => update(index, { field: value, operator: "_eq", value: "" })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((option) => <SelectItem key={option.field} value={option.field}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="min-w-40 flex-1 space-y-1 text-sm">
              <span>{t("filter_operator")}</span>
              <Select value={operator} onValueChange={(value) => update(index, { operator: value, value: "" })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((option) => <SelectItem key={option} value={option}>{t(`operator${option}` as never)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            {!noValue ? (
              twoValues ? <><Input aria-label={t("filter_value_from")} value={Array.isArray(condition.value) ? String(condition.value[0] ?? "") : ""} onChange={(event) => update(index, { value: [event.target.value, Array.isArray(condition.value) ? condition.value[1] : ""] })} /><Input aria-label={t("filter_value_to")} value={Array.isArray(condition.value) ? String(condition.value[1] ?? "") : ""} onChange={(event) => update(index, { value: [Array.isArray(condition.value) ? condition.value[0] : "", event.target.value] })} /></> : fieldKind(field?.type ?? "string") === "boolean" ? <Select value={String(condition.value)} onValueChange={(value) => update(index, { value: value === "true" })}><SelectTrigger className="min-w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">{t("value_true")}</SelectItem><SelectItem value="false">{t("value_false")}</SelectItem></SelectContent></Select> : <Input className="min-w-40 flex-1" aria-label={t("filter_value")} type={fieldKind(field?.type ?? "string") === "number" ? "number" : "text"} value={Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? "")} onChange={(event) => update(index, { value: event.target.value })} />
            ) : null}
            <Button type="button" variant="ghost" size="icon" aria-label={t("filter_remove")} onClick={() => remove(index)}><Minus /></Button>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setDraft((current) => [...current, { field: fields[0]?.field ?? "", operator: "_eq", value: "" }])}><Plus data-icon="inline-start" />{t("filter_add")}</Button>
        <Button type="button" onClick={apply}>{t("filter_apply")}</Button>
        {conditions.length > 0 ? <Button type="button" variant="ghost" onClick={() => { setDraft([]); setConditions([]); const url = new URL(window.location.href); url.searchParams.delete("filter"); url.searchParams.delete("page"); window.location.assign(url.toString()); }}>{t("clear_filter")}</Button> : null}
      </div>
    </div>
  );
}

export type { Condition };
