"use client";

import Link from "next/link";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

type Props = {
  url: string;
  entrypoint: string;
};

function Snippet({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const t = useT("mcp");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base leading-snug font-medium">{label}</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(value)}>
          <Copy data-icon="inline-start" />
          {t("copy_button")}
        </Button>
      </div>
      <pre className="overflow-x-auto scroll-fade-x rounded-lg bg-muted/60 p-3 text-xs leading-5">
        <code>{value}</code>
      </pre>
    </div>
  );
}

export function McpConnection({ url, entrypoint }: Props) {
  const t = useT("mcp");
  const tokenPlaceholder = t("token_placeholder");
  const cliCommand = [
    "claude mcp add ohmycms --scope local \\",
    `  --env OHMYCMS_URL=${url} \\`,
    `  --env OHMYCMS_TOKEN=${tokenPlaceholder} \\`,
    `  -- node ${entrypoint}`,
  ].join("\n");
  const clientConfig = JSON.stringify(
    {
      mcpServers: {
        ohmycms: {
          command: "node",
          args: [entrypoint],
          env: {
            OHMYCMS_URL: url,
            OHMYCMS_TOKEN: tokenPlaceholder,
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-6 text-sm">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base leading-snug font-medium">{t("url_label")}</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(url)}>
            <Copy data-icon="inline-start" />
            {t("copy_button")}
          </Button>
        </div>
        <code className="overflow-x-auto scroll-fade-x rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs">
          {url}
        </code>
      </div>

      <Snippet label={t("cli_heading")} value={cliCommand} />
      <Snippet label={t("json_heading")} value={clientConfig} />

      <p className="text-muted-foreground">
        {t("issue_token_prefix")}{" "}
        <Link href="/admin/settings/agents" className="font-medium text-primary hover:text-primary/80">
          {t("issue_token_link")}
        </Link>
      </p>
    </div>
  );
}
