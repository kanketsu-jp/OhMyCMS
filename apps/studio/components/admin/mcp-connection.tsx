"use client";

import Link from "next/link";
import { CodeBlock } from "@/components/ui/code-block";
import { useT } from "@/i18n/client";

type Props = {
  url: string;
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

/**
 * MCP クライアントへ接続するための URL・CLI・JSON 設定を表示する部品。
 *
 * 🚨 接続先とトークンのプレースホルダーは呼び出し元から受け取り、ここで実値を生成・保存しない。
 *    表示する説明文は `mcp` 辞書を通し、コード例の値だけを動的に埋め込む。
 *
 * 参考: `apps/studio/app/(admin)/admin/settings/ai/page.tsx` ／ `DESIGN.md` §0-1
 */
export function McpConnection({ url }: Props) {
  const t = useT("mcp");
  const tokenPlaceholder = t("token_placeholder");
  const cliCommand = [
    "claude mcp add ohmycms --scope local \\",
    `  --env OHMYCMS_URL=${url} \\`,
    `  --env OHMYCMS_TOKEN=${tokenPlaceholder} \\`,
    "  -- ohmycms-mcp",
  ].join("\n");
  const clientConfig = JSON.stringify(
    {
      mcpServers: {
        ohmycms: {
          command: "ohmycms-mcp",
          args: [],
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
            効果は hover と同じにしてある（家の既存 `active:bg-sidebar-accent` と同じ「写す」形）。

            実測（触る端末を再現して算出色を読んだ・2026-08-15）:
              SP (hover:none / pointer:coarse)  :hover **効かない** / :active 効く
              PC (hover:hover)                  :hover 効く        / :active 効く
              🚨 `active:` が無い形は SP で**押しても何も起きない**（無反応）
              ＝ Tailwind の `hover:` は `@media (hover: hover)` の中なので、**規則ごと当たらない**
              🚨 未検証: 実機の指で手応えとして十分か（強制した状態を読んでおり、押してはいない） */}
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
