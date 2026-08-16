"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2 } from "lucide-react";
import type { CollectionResult } from "@/lib/schema/models";
import { RowOptions } from "@/components/admin/row-options";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useFormSubmitShortcut } from "@/hooks/use-form-submit-shortcut";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";

type PermissionRow = {
  id: number;
  policy: string;
  collection: string;
  action: "read" | "create" | "update" | "delete";
  permissions: unknown;
  fields: string | null;
};

type Props = {
  policyId: string;
  collections: CollectionResult[];
  permissions: PermissionRow[];
};

const actions = ["read", "create", "update", "delete"] as const;

/**
 * 🚨 **API の生文言を画面へ出さない。** code だけを見て辞書の鍵へ写す。
 *    生文言は `lib/` に直書きされた日本語なので、**英語で見ている人の画面にも日本語が出る**。
 *    表に無い code は `null` を返し、呼び出し側の具体的な文言を使う
 *    （`unexpected`「予期しないエラー」より、その場の文言のほうが正確なため）。
 */
function errorKeyFrom(payload: unknown): ErrorKey | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "code" in payload.error &&
    typeof payload.error.code === "string"
  ) {
    const key = errorKeyFromApiCode(payload.error.code);
    return key === FALLBACK_ERROR_KEY ? null : key;
  }
  return null;
}

function jsonText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function parseJsonOrNull(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function fieldsFor(collections: CollectionResult[], collection: string): string[] {
  return collections.find((item) => item.collection === collection)?.schema?.columns.map((column) => column.name) ?? [];
}

/**
 * 権限フィルタの JSON。**行ごとに1つ**あるので、部品に切り出して**行ごとに targetId を持たせる**。
 *
 * 🚨 map の中で1つの targetId を使い回すと、**コピー先が最後に描かれた1つへ偏る**。
 * 行ごとに別 ID を渡して、押した行の値を選択・コピーできるようにする。
 * （実際にこの形で書いてしまい、書いた直後に気づいた）
 *
 * 🚨 マスクはスクロールする <pre> そのものに当てる。外側に巻くと監査が赤のままになる。
 */
function FilterBlock({ value, targetId }: { value: string; targetId: string }) {
  return <CodeBlock value={value} targetId={targetId} />;
}

export function PolicyPermissionsManager({ policyId, collections, permissions }: Props) {
  const router = useRouter();
  const t = useT("policies");
  const tError = useT("errors");
  // 🚨 呼び出し側は変えない。中で code → 辞書の鍵に写すだけ。
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFrom(payload);
    return key ? tError(key) : fallback;
  };
  const [collection, setCollection] = useState(collections[0]?.collection ?? "");
  const [action, setAction] = useState<(typeof actions)[number]>("read");
  const [allFields, setAllFields] = useState(true);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [filterJson, setFilterJson] = useState("");
  const [editing, setEditing] = useState<PermissionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const columns = useMemo(() => fieldsFor(collections, collection), [collections, collection]);
  const saveDisabled = !collection;

  function resetForm() {
    setEditing(null);
    setAction("read");
    setAllFields(true);
    setSelectedFields([]);
    setFilterJson("");
  }

  function startEdit(row: PermissionRow) {
    const parsedFields = (row.fields ?? "").split(",").map((field) => field.trim()).filter(Boolean);
    setEditing(row);
    setCollection(row.collection);
    setAction(row.action);
    setAllFields(parsedFields.includes("*") || parsedFields.length === 0);
    setSelectedFields(parsedFields.includes("*") ? [] : parsedFields);
    setFilterJson(jsonText(row.permissions));
  }

  const save = useSubmitOnce(async () => {
    setError(null);
    const parsed = parseJsonOrNull(filterJson);
    if (!parsed.ok) {
      setError(t("invalid_filter_json"));
      return;
    }
    const body = {
      policy: policyId,
      collection,
      action,
      permissions: parsed.value,
      fields: allFields ? "*" : selectedFields.join(","),
    };
    const response = await fetch(editing ? `/api/permissions/${editing.id}` : "/api/permissions", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_save_failed")));
      return;
    }
    resetForm();
    router.refresh();
  });

  const remove = useSubmitOnce(async (id: number) => {
    setError(null);
    const response = await fetch(`/api/permissions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_delete_failed")));
      return;
    }
    toast.success(t("permission_deleted"));
    router.refresh();
  }, (id) => String(id));

  useFormSubmitShortcut("policy-permission-form", { pending: save.pending, disabled: saveDisabled });

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {/* collection・action・fields・行フィルタ・操作の複数列を読む一覧なので table にする。 */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("collection_label")}</TableHead>
            <TableHead>{t("action_label")}</TableHead>
            <TableHead>{t("fields_list_label")}</TableHead>
            <TableHead>{t("filter_json_label")}</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">{t("edit_button")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.collection}</TableCell>
              <TableCell>{row.action}</TableCell>
              <TableCell className="text-muted-foreground">{row.fields || t("fields_unspecified")}</TableCell>
              <TableCell className="min-w-80 whitespace-normal">
                <FilterBlock value={jsonText(row.permissions) || t("no_filter")} targetId={`policy-filter-${row.id}`} />
              </TableCell>
              <TableCell>
                {/* 🚨 行の操作が 2 つ以上なら、破壊的なほうは ▾ の中へ
                    （`knowledge/decisions/action-button-and-edit-mode.md`。283 A を行へ延ばしたもの） */}
                <div className="flex justify-end gap-1">
                  <Button type="button" variant="outline" size="sm" aria-label={t("edit_button")} onClick={() => startEdit(row)}>
                    <Pencil />
                    <span className="hidden md:inline">{t("edit_button")}</span>
                  </Button>
                  <RowOptions
                    label={t("row_options")}
                    options={[
                      {
                        label: t("delete_button"),
                        icon: <Trash2 />,
                        destructive: true,
                        disabled: remove.isPending(String(row.id)),
                        onSelect: () => void remove.run(row.id),
                      },
                    ]}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {permissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("no_permissions")}</p>
      ) : null}
      <form
        id="policy-permission-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run();
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="collection">{t("collection_label")}</Label>
            <select
              id="collection"
              value={collection}
              onChange={(event) => {
                setCollection(event.target.value);
                setSelectedFields([]);
                setAllFields(true);
              }}
              className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm"
            >
              {collections.map((item) => (
                <option key={item.collection} value={item.collection}>{item.collection}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="action">{t("action_label")}</Label>
            <select
              id="action"
              value={action}
              onChange={(event) => setAction(event.target.value as (typeof actions)[number])}
              className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm"
            >
              {actions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("fields_list_label")}</Label>
          <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
            <input type="checkbox" checked={allFields} onChange={(event) => setAllFields(event.target.checked)} className="size-4" />
            {t("allow_all_label")}
          </label>
          {!allFields ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {columns.map((field) => (
                <label key={field} className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field)}
                    onChange={(event) => {
                      setSelectedFields((current) =>
                        event.target.checked
                          ? [...current, field]
                          : current.filter((item) => item !== field),
                      );
                    }}
                    className="size-4"
                  />
                  {field}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="permissions">{t("filter_json_label")}</Label>
          <Textarea
            id="permissions"
            value={filterJson}
            onChange={(event) => setFilterJson(event.target.value)}
            className="min-h-36 font-mono md:max-w-2xl"
            placeholder='{"owner":{"_eq":"$CURRENT_USER"}}'
          />
          <p className="text-xs leading-5 text-muted-foreground">{t("filter_json_help_variables")}</p>
          <p className="text-xs leading-5 text-muted-foreground">{t("filter_json_help_combination")}</p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={save.pending} disabled={saveDisabled}>
            <Save />
            {editing ? t("update_button") : t("add_button")}
          </Button>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={resetForm}>{t("cancel_edit_button")}</Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
