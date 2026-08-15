"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2 } from "lucide-react";
import type { CollectionResult } from "@/lib/schema/models";
import { PageAction } from "@/components/admin/page-action";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

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

function messageFrom(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
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
  const [collection, setCollection] = useState(collections[0]?.collection ?? "");
  const [action, setAction] = useState<(typeof actions)[number]>("read");
  const [allFields, setAllFields] = useState(true);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [filterJson, setFilterJson] = useState("");
  const [editing, setEditing] = useState<PermissionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const columns = useMemo(() => fieldsFor(collections, collection), [collections, collection]);

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

  return (
    <div className="space-y-6">
      {/* 🚨 このページの `<form>` は無い（ボタンの onClick で送っている）ので、
          ヘッダーへは `form=` ではなく `onClick` で出す（`page-actions.ts` の kind: "button"）。
          文字は状態で変わる: 行を選んでいなければ「追加」、選んでいれば「更新」。
          🚨 コレクションが 1 つも無いときは **`disabled`**。**隠さない**。
          （最初は出し分けで隠していた。`PageAction` に `disabled` が無かったため。
            `4d0a18c` で saml が足したので、憲章 §3c どおり「押せないが見える」に直した。
            隠すと「この画面で何ができるか」自体が見えなくなる。） */}
      <PageAction
        onClick={() => void save.run()}
        pending={save.pending}
        disabled={!collection}
        label={editing ? t("update_button") : t("add_button")}
        icon={<Save />}
        role="primary"
      />
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="space-y-4">
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
        {/* 追加・更新はヘッダー（`PageAction`）へ移した。ここに残すと入口が 2 つになる。
            編集をやめる操作は「いま編集中である」という**この場の状態**を戻すものなので、
            ヘッダーへは上げずにここへ残す。 */}
        {editing ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={resetForm}>{t("cancel_edit_button")}</Button>
          </div>
        ) : null}
      </div>
      <div className="divide-y border-t">
        {permissions.map((row) => (
          <div key={row.id} className="space-y-3 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{row.collection} / {row.action}</p>
                <p className="text-sm text-muted-foreground">fields: {row.fields || t("fields_unspecified")}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" aria-label={t("edit_button")} onClick={() => startEdit(row)}>
                  <Pencil />
                  <span className="hidden md:inline">{t("edit_button")}</span>
                </Button>
                <Button type="button" variant="destructive-ghost" size="sm" aria-label={t("delete_button")} disabled={remove.isPending(String(row.id))} onClick={() => void remove.run(row.id)}>
                  <Trash2 />
                  <span className="hidden md:inline">{t("delete_button")}</span>
                </Button>
              </div>
            </div>
            <FilterBlock value={jsonText(row.permissions) || t("no_filter")} targetId={`policy-filter-${row.id}`} />
          </div>
        ))}
        {permissions.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t("no_permissions")}</p>
        ) : null}
      </div>
    </div>
  );
}
