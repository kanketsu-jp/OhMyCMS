"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { useScrollFade } from "@/components/ui/scroll-fade";

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

function parseOptionalJson(text: string, invalidMessage: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: invalidMessage };
  }
}

export function AgentsManager({ agents }: { agents: AgentRow[] }) {
  // 🚨 スクロールする要素そのものに fade を当てる（外側に巻くと監査が赤のまま）。
  // <code> はタグを差し替えられないので、部品ではなくフックで振る舞いだけ付ける。
  const tokenRef = useRef<HTMLElement>(null);
  useScrollFade(tokenRef, "horizontal");
  const t = useT("agents");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const create = useSubmitOnce(async (formData: FormData) => {
    setError(null);
    const capabilities = parseOptionalJson(String(formData.get("capabilities") ?? ""), t("invalid_json", { label: "capabilities" }));
    if (!capabilities.ok) {
      setError(capabilities.message);
      return;
    }
    const tenantScope = parseOptionalJson(String(formData.get("tenant_scope") ?? ""), t("invalid_json", { label: "tenant_scope" }));
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
            <KeyRound className="size-4" />
            {t("token_heading")}
          </div>
          <p className="text-sm text-destructive">{t("token_warning")}</p>
          <code
            ref={tokenRef}
            data-slot="scroll-fade"
            data-direction="horizontal"
            className="block overflow-x-auto py-2 font-mono text-sm break-all"
          >{token}</code>
          <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(token)}>
            <Copy />
            {t("copy_button")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form action={create.run} className="space-y-4">
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="capabilities">{t("capabilities_label")}</Label>
            <textarea id="capabilities" name="capabilities" className="min-h-28 w-full rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-base md:text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant_scope">{t("tenant_scope_label")}</Label>
            <textarea id="tenant_scope" name="tenant_scope" className="min-h-28 w-full rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-base md:text-sm" />
          </div>
        </div>
        <Button type="submit" disabled={create.pending}>{t("issue_button")}</Button>
      </form>
      <div className="divide-y border-t">
        {agents.map((agent) => (
          <div key={agent.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">
                {agent.name}
                {agent.revoked_at ? <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("revoked_badge")}</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                on_behalf_of: {agent.on_behalf_of} / expires_at: {agent.expires_at} / revoked_at: {agent.revoked_at ?? "-"}
              </p>
            </div>
            <Button type="button" variant="destructive-ghost" size="sm" disabled={revoke.isPending(agent.id) || Boolean(agent.revoked_at)} onClick={() => void revoke.run(agent.id)}>
              <Ban />
              {t("revoke_button")}
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
