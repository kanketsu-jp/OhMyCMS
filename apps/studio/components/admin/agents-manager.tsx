"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Ban, Plus } from "lucide-react";
import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import type { PermissionAction } from "@/lib/permissions/resolve";

type AgentRow = {
  id: string;
  name: string;
  on_behalf_of: string;
  tenant_scope: unknown;
  capabilities: unknown;
  origin: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

type CollectionNameRow = {
  collection: string;
};

type CapabilitiesState = {
  selection: Record<string, PermissionAction[]>;
  text: string;
};

const permissionActions = ["read", "create", "update", "delete"] as const satisfies readonly PermissionAction[];

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

function parseOptionalJson(text: string, invalidMessage: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: invalidMessage };
  }
}

function collectionRowsFrom(payload: unknown): CollectionNameRow[] | null {
  const candidate =
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray(payload)
        ? payload
        : null;

  if (!candidate) return null;

  const rows: CollectionNameRow[] = [];
  for (const item of candidate) {
    if (
      item &&
      typeof item === "object" &&
      "collection" in item &&
      typeof item.collection === "string"
    ) {
      rows.push({ collection: item.collection });
    }
  }
  return rows;
}

function capabilitiesFromSelection(selection: Record<string, PermissionAction[]>): string {
  const collections = Object.fromEntries(
    Object.entries(selection)
      .filter(([, actions]) => actions.length > 0)
      .map(([collection, actions]) => [collection, actions]),
  );

  if (Object.keys(collections).length === 0) return "";
  return JSON.stringify({ collections }, null, 2);
}

export function AgentsManager({ agents }: { agents: AgentRow[] }) {
  const t = useT("agents");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionNameRow[]>([]);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitiesState>({ selection: {}, text: "" });

  useEffect(() => {
    let cancelled = false;

    async function loadCollections() {
      setCollectionsError(null);
      try {
        const response = await fetch("/api/collections?names=true");
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setCollections([]);
          setCollectionsError(messageFrom(payload, t("collections_load_failed")));
          return;
        }
        const rows = collectionRowsFrom(payload);
        if (!rows) {
          setCollections([]);
          setCollectionsError(t("collections_load_failed"));
          return;
        }
        setCollections(rows);
      } catch {
        if (!cancelled) {
          setCollections([]);
          setCollectionsError(t("collections_load_failed"));
        }
      }
    }

    void loadCollections();

    return () => {
      cancelled = true;
    };
  }, [t]);

  function toggleCapability(collection: string, action: PermissionAction, checked: boolean) {
    setCapabilities((current) => {
      const nextActions = new Set(current.selection[collection] ?? []);
      if (checked) {
        nextActions.add(action);
      } else {
        nextActions.delete(action);
      }

      const selection = { ...current.selection };
      if (nextActions.size === 0) {
        delete selection[collection];
      } else {
        selection[collection] = permissionActions.filter((item) => nextActions.has(item));
      }
      return { selection, text: capabilitiesFromSelection(selection) };
    });
  }

  const create = useSubmitOnce(async (formData: FormData) => {
    setError(null);
    const capabilities = parseOptionalJson(String(formData.get("capabilities") ?? ""), t("invalid_json", { label: t("capabilities_label") }));
    if (!capabilities.ok) {
      setError(capabilities.message);
      return;
    }
    const tenantScope = parseOptionalJson(String(formData.get("tenant_scope") ?? ""), t("invalid_json", { label: t("tenant_scope_label") }));
    if (!tenantScope.ok) {
      setError(tenantScope.message);
      return;
    }
    const body = {
      name: String(formData.get("name") ?? ""),
      expires_in_days: Number(formData.get("expires_in_days") ?? 0),
      capabilities: capabilities.value,
      tenant_scope: tenantScope.value,
    };
    const response = await fetch("/api/auth/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as { token?: string } | unknown;
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? t("forbidden") : t("issue_failed")));
      return;
    }
    setToken((payload as { token: string }).token);
    router.refresh();
  });

  const revoke = useSubmitOnce(async (id: string) => {
    setError(null);
    const response = await fetch(`/api/auth/agents/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? t("forbidden") : t("revoke_failed")));
      return;
    }
    router.refresh();
  }, (id) => id);

  return (
    <div className="space-y-4">
      {token ? (
        <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <KeyRound />
            {t("token_heading")}
          </div>
          <p className="text-sm text-destructive">{t("token_warning")}</p>
          {/* 🚨 ここだけ背景を外す。**外の箱が既に面**（destructive の警告箱: 背景 + 罫線 1px + 角丸）
              なので、CodeBlock の既定の背景をそのまま入れると**背景の中に背景＝面が 2 段**になる
              （2026-08-15 実測。外 背景あり/罫線1px/角丸8px、中 背景あり/角丸10px）。
              🚨 静的検査は destructive を例外にしているので**赤くならない**が、規約の意図には反する
              （`knowledge/decisions/no-nested-surfaces.md`「面は1段まで」）。
              左右の余白も外す。背景が無ければ、余白は外の箱の p-4 が持っている。 */}
          <CodeBlock
            value={token}
            targetId="agent-issued-token"
            preClassName="bg-transparent px-0 text-sm"
          />
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form id="agent-issue-form" action={create.run} className="space-y-4">
        <FormDraft formId="agent-issue-form" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name_label")}</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expires_in_days">{t("expires_in_days_label")}</Label>
            <Input id="expires_in_days" name="expires_in_days" type="number" min="1" max="365" required />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <Label>{t("capabilities_picker_label")}</Label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("capabilities_picker_help")}</p>
          </div>
          {collectionsError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {collectionsError}
            </div>
          ) : null}
          {collections.length > 0 ? (
            <ScrollFade
              direction="vertical"
              // 🚨 塗りを持たせない。**面の中でこれを塗ると面が2段になる**（実測で深さ2）。
              //    スクロールできることは scroll-fade が示すので、背景は要らない。
              className="max-h-72 rounded-lg"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-48">{t("collection_column")}</TableHead>
                    {permissionActions.map((action) => (
                      <TableHead key={action}>{t(`action_${action}`)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.map((row) => (
                    <TableRow key={row.collection}>
                      <TableCell className="font-mono text-xs">{row.collection}</TableCell>
                      {permissionActions.map((action) => {
                        const checked = capabilities.selection[row.collection]?.includes(action) ?? false;
                        return (
                          <TableCell key={action}>
                            <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
                              <input
                                type="checkbox"
                                checked={checked}
                                aria-label={t("action_checkbox_label", {
                                  collection: row.collection,
                                  action: t(`action_${action}`),
                                })}
                                onChange={(event) => toggleCapability(row.collection, action, event.target.checked)}
                                className="size-4"
                              />
                              <span className="sr-only">{t(`action_${action}`)}</span>
                            </label>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollFade>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("collections_empty")}
            </p>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="capabilities">{t("capabilities_label")}</Label>
            <Textarea
              id="capabilities"
              name="capabilities"
              value={capabilities.text}
              onChange={(event) => setCapabilities((current) => ({ ...current, text: event.target.value }))}
              className="min-h-28 font-mono"
            />
            <p className="text-xs leading-5 text-muted-foreground">{t("capabilities_json_help")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant_scope">{t("tenant_scope_label")}</Label>
            <Textarea id="tenant_scope" name="tenant_scope" className="min-h-28 font-mono" />
          </div>
        </div>
        <PageAction
          form="agent-issue-form"
          role="primary"
          pending={create.pending}
          label={t("issue_button")}
          icon={<Plus />}
        />
      </form>
      <div className="divide-y border-t">
        {agents.map((agent) => (
          <div key={agent.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">
                {agent.name}
                {/* 🚨 塗った箱にしない。面の中なので、背景を持たせると深さ 2 になる
                    （knowledge/decisions/no-nested-surfaces.md §2-1）。
                    2026-08-15 実測: bg-muted の chip が 64x21px の面として検出された。
                    失効は**取り消せない状態**なので、色ではなく赤い文字で示す。 */}
                {agent.revoked_at ? <span className="ml-2 text-xs font-medium text-destructive">{t("revoked_badge")}</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                on_behalf_of: {agent.on_behalf_of} / expires_at: {agent.expires_at} / revoked_at: {agent.revoked_at ?? "-"}
              </p>
            </div>
            <Button type="button" variant="destructive-ghost" size="sm" aria-label={t("revoke_button")} disabled={revoke.isPending(agent.id) || Boolean(agent.revoked_at)} onClick={() => void revoke.run(agent.id)}>
              <Ban data-icon="inline-start" />
              <span className="hidden md:inline">{t("revoke_button")}</span>
            </Button>
          </div>
        ))}
        {agents.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t("empty")}</p>
        ) : null}
      </div>
    </div>
  );
}
