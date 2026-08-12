"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import type { CollectionResult } from "@/lib/schema/models";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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

function parseJsonOrNull(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: "行フィルタは正しいJSONで入力してください" };
  }
}

function fieldsFor(collections: CollectionResult[], collection: string): string[] {
  return collections.find((item) => item.collection === collection)?.schema?.columns.map((column) => column.name) ?? [];
}

export function PolicyPermissionsManager({ policyId, collections, permissions }: Props) {
  const router = useRouter();
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

  async function save() {
    setError(null);
    const parsed = parseJsonOrNull(filterJson);
    if (!parsed.ok) {
      setError(parsed.message);
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
      setError(messageFrom(payload, response.status === 403 ? "権限がありません" : "保存できません"));
      return;
    }
    resetForm();
    router.refresh();
  }

  async function remove(id: number) {
    setError(null);
    const response = await fetch(`/api/permissions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? "権限がありません" : "削除できません"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="space-y-4 rounded-md border p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="collection">コレクション</Label>
            <select
              id="collection"
              value={collection}
              onChange={(event) => {
                setCollection(event.target.value);
                setSelectedFields([]);
                setAllFields(true);
              }}
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
            >
              {collections.map((item) => (
                <option key={item.collection} value={item.collection}>{item.collection}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="action">action</Label>
            <select
              id="action"
              value={action}
              onChange={(event) => setAction(event.target.value as (typeof actions)[number])}
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
            >
              {actions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>fields 許可リスト</Label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allFields} onChange={(event) => setAllFields(event.target.checked)} className="size-4" />
            すべて許可（*）
          </label>
          {!allFields ? (
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
              {columns.map((field) => (
                <label key={field} className="flex items-center gap-2 text-sm">
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
          <Label htmlFor="permissions">permissions（行フィルタ JSON）</Label>
          <textarea
            id="permissions"
            value={filterJson}
            onChange={(event) => setFilterJson(event.target.value)}
            className="min-h-36 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder='{"owner":{"_eq":"$CURRENT_USER"}}'
          />
          <p className="text-xs leading-5 text-muted-foreground">
            動的変数: $CURRENT_USER / $NOW / $CURRENT_ROLE。演算子: _eq _neq _lt _lte _gt _gte _in _nin _null _nnull _contains _icontains _starts_with _ends_with _between _nbetween _empty _nempty。_and / _or はネストできます。
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            複数ポリシーは加算的に合成されます。行フィルタは OR、fields は和集合です。admin_access=true のポリシーが1つでもあると全権限になります。
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => void save()} disabled={!collection}>
            <Save />
            {editing ? "更新" : "追加"}
          </Button>
          {editing ? (
            <Button type="button" variant="ghost" onClick={resetForm}>編集を解除</Button>
          ) : null}
        </div>
      </div>
      <div className="divide-y rounded-md border">
        {permissions.map((row) => (
          <div key={row.id} className="space-y-3 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{row.collection} / {row.action}</p>
                <p className="text-sm text-muted-foreground">fields: {row.fields || "未指定"}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => startEdit(row)}>編集</Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => void remove(row.id)}>
                  <Trash2 />
                  削除
                </Button>
              </div>
            </div>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{jsonText(row.permissions) || "行フィルタなし"}</pre>
          </div>
        ))}
        {permissions.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">permission行はまだありません。</p>
        ) : null}
      </div>
    </div>
  );
}
