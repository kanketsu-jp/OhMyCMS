"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function parseOptionalJson(text: string, label: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: `${label} は正しいJSONで入力してください` };
  }
}

export function AgentsManager({ agents }: { agents: AgentRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function create(formData: FormData) {
    setError(null);
    const capabilities = parseOptionalJson(String(formData.get("capabilities") ?? ""), "capabilities");
    if (!capabilities.ok) {
      setError(capabilities.message);
      return;
    }
    const tenantScope = parseOptionalJson(String(formData.get("tenant_scope") ?? ""), "tenant_scope");
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
      setError(messageFrom(payload, response.status === 403 ? "権限がありません" : "発行できません"));
      return;
    }
    setToken((payload as { token: string }).token);
    router.refresh();
  }

  async function revoke(id: string) {
    setError(null);
    const response = await fetch(`/api/auth/agents/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? "権限がありません" : "失効できません"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {token ? (
        <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <KeyRound className="size-4" />
            発行された生トークン
          </div>
          <p className="text-sm text-destructive">この画面を閉じると二度と表示できません。</p>
          <code className="block overflow-x-auto rounded-md bg-background p-3 text-sm">{token}</code>
          <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(token)}>
            <Copy />
            コピー
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form action={create} className="space-y-4 rounded-md border p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expires_in_days">expires_in_days</Label>
            <Input id="expires_in_days" name="expires_in_days" type="number" min="1" max="365" required />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="capabilities">capabilities（JSON）</Label>
            <textarea id="capabilities" name="capabilities" className="min-h-28 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant_scope">tenant_scope（JSON）</Label>
            <textarea id="tenant_scope" name="tenant_scope" className="min-h-28 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm" />
          </div>
        </div>
        <Button type="submit">発行</Button>
      </form>
      <div className="divide-y rounded-md border">
        {agents.map((agent) => (
          <div key={agent.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">
                {agent.name}
                {agent.revoked_at ? <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">失効済み</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                on_behalf_of: {agent.on_behalf_of} / expires_at: {agent.expires_at} / revoked_at: {agent.revoked_at ?? "-"}
              </p>
            </div>
            <Button type="button" variant="destructive" size="sm" disabled={Boolean(agent.revoked_at)} onClick={() => void revoke(agent.id)}>
              <Ban />
              失効
            </Button>
          </div>
        ))}
        {agents.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">エージェントはまだありません。</p>
        ) : null}
      </div>
    </div>
  );
}
