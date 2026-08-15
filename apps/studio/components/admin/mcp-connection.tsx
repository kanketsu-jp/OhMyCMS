"use client";

import Link from "next/link";
import { CodeBlock } from "@/components/ui/code-block";
import { useT } from "@/i18n/client";

type Props = {
  url: string;
  entrypoint: string;
};

function Snippet({
  label,
  value,
  targetId,
}: {
  label: string;
  value: string;
  targetId: string;
}) {
  return <CodeBlock title={label} value={value} targetId={targetId} />;
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
      <CodeBlock title={t("url_label")} value={url} targetId="mcp-connection-url" />

      <Snippet label={t("cli_heading")} value={cliCommand} targetId="mcp-cli-command" />
      <Snippet label={t("json_heading")} value={clientConfig} targetId="mcp-client-config" />

      <p className="text-muted-foreground">
        {t("issue_token_prefix")}{" "}
        {/* 🚨 `hover:` には必ず `active:` を対で書く（堀池 2026-08-15）。
            タッチの端末に hover は無いので、hover だけだと**押した手応えが消える**。
            効果は hover と同じにしてある（家の既存 `active:bg-sidebar-accent` と同じ「写す」形）。 */}
        <Link
          href="/admin/settings/agents"
          className="font-medium text-primary hover:text-primary/80 active:text-primary/80"
        >
          {t("issue_token_link")}
        </Link>
      </p>
    </div>
  );
}
