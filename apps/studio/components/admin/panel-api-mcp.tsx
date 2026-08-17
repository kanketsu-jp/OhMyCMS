"use client";

import { useMemo } from "react";
import { usePathname, useParams } from "next/navigation";

import { PanelSection } from "@/components/admin/panel-section";
import { CopyButton } from "@/components/ui/copy-button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/i18n/client";
import TOOL_CATALOG from "@/lib/mcp/tool-catalog.json";

/**
 * 右サイドバー ④「API・MCP」の中身。
 *
 * 由来（idea.md L84・堀池の原文）:
 *   「API・MCP（API を使う時のクエリなど、OpenApi で書くような内容。**これは OpenApi から抽出できる
 *     ならそうする**。理由として DRY 志向なので、なるべくどこかでマスタとして定義してすべてそれを
 *     使うようにすれば LLM や人がそこを更新するだけで一元管理＋最新がどれか？わかる。また、
 *     **MCP でそのページや選択中の ID などを LLM へ渡す時のプロンプトを簡単にコピーできる**）」
 *
 * 🚨 **OpenAPI の抽出元はこのリポジトリに存在しません**（2026-08-15 実測）。
 *    名前で探す `find -iname '*openapi*'` → 0 件 / 全ワークスペースの依存 → 0 件 /
 *    本文検索が返す 2 件はこのコメントと OTel の喩え。
 *    🟢 対照: 囮に openapi.yaml と zod-to-openapi 依存を置くと、どちらも 1 件で拾えた。
 *    ＝「見ていない 0」ではなく「**無い 0**」。
 *
 * 🚨 そして**静的な OpenAPI はこの CMS には元から合いません**。`AGENTS.md §1` のとおり
 *    GUI でコレクションを増やせる＝**スキーマが実行時に変わる**ので、`/api/items/<collection>` を
 *    静的な YAML に書いた瞬間に古くなります（`§3.1` で Prisma/Drizzle を外したのと同じ理由）。
 *    → 原文の理由は「**DRY・マスタは1つ**」なので、**形式ではなくそちらを守りました**。
 *
 * ■ マスタは2つとも既存のものを使い、写しを作っていません
 *   MCP のツール    `packages/mcp/src/catalog.ts`（22 本）
 *                   → `lib/mcp/tool-catalog.json` は**生成された写し**で、ずれたら
 *                     `scripts/check-mcp-catalog.mjs` が pre-commit で落とす
 *   生きたスキーマ  コレクション名・ID は **URL から読む**（画面に書き写さない）
 *
 * 🚨 右パネルは PC の3列目で**幅が狭い**。コマンドは折り返さず、**自分のコンテナで横スクロール**させる
 *    （`panel-display.tsx` と同じ規律）。面は積まない。
 */

type Tool = { name: string; title: string; description: string; readOnly: boolean };

const TOOLS = TOOL_CATALOG as Tool[];

/** URL からこのページの資源を読む。**画面に書き写さない**（写すとスキーマ変更でずれる）。 */
function resourceOf(pathname: string, params: Record<string, string | string[] | undefined>) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const collection = one(params.collection);
  const id = one(params.id);

  if (pathname.startsWith("/admin/content/") && collection) {
    return {
      kind: "items" as const,
      collection,
      id,
      path: id ? `/api/items/${collection}/${id}` : `/api/items/${collection}`,
      tools: id
        ? ["ohmycms_item_get", "ohmycms_item_update", "ohmycms_items_query"]
        : ["ohmycms_items_query", "ohmycms_item_create"],
    };
  }
  if (pathname.startsWith("/admin/collections")) {
    return {
      kind: "collections" as const,
      collection,
      id: null,
      path: collection ? `/api/collections/${collection}` : "/api/collections",
      tools: collection
        ? ["ohmycms_collection_get", "ohmycms_fields_list", "ohmycms_field_create"]
        : ["ohmycms_collections_list", "ohmycms_collection_create"],
    };
  }
  if (pathname.startsWith("/admin/files")) {
    return { kind: "files" as const, collection: null, id, path: "/api/files", tools: ["ohmycms_files_list"] };
  }
  if (pathname.startsWith("/admin/settings")) {
    return {
      kind: "settings" as const, collection: null, id: null, path: "/api/settings",
      tools: ["ohmycms_settings_get", "ohmycms_settings_update", "ohmycms_permissions_describe"],
    };
  }
  return { kind: "other" as const, collection: null, id: null, path: null, tools: ["ohmycms_permissions_describe"] };
}

export function PanelApiMcp() {
  const t = useT("panel");
  const pathname = usePathname();
  const params = useParams();

  const resource = useMemo(() => resourceOf(pathname, params ?? {}), [pathname, params]);

  // 🚨 起点はブラウザが見ている値を使う。サーバで組むと、プロキシ配下で内部ホスト名になる
  //    （`lib/auth/urls.ts` の publicBaseUrl と同じ落とし穴。本番で実測済み）。
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const curl = resource.path
    ? `curl -sS "${origin}${resource.path}" -H "Authorization: Bearer $OHMYCMS_TOKEN"`
    : null;

  const tools = TOOLS.filter((tool) => resource.tools.includes(tool.name));

  // 🚨 原典が名指ししている中心機能。**そのページと選択中の ID を埋めて**渡せる形にする。
  //
  // 🚨 **プロンプトも辞書を通す**（`AGENTS.md §3.8`）。LLM へ渡す文だから英語のままでよい、
  //    とはしない——**画面に表示され、利用者がそのまま貼る文**なので、
  //    英語で使っている人には英語で出る必要がある。`check-i18n-hardcoded.mjs` が実際に拾った。
  const prompt = [
    t("api_prompt_line_intro", { origin }),
    t("api_prompt_line_screen", { path: pathname }),
    resource.collection ? t("api_prompt_line_collection", { collection: resource.collection }) : null,
    resource.id ? t("api_prompt_line_id", { id: resource.id }) : null,
    tools.length > 0
      ? t("api_prompt_line_tools", { tools: tools.map((tool) => tool.name).join(", ") })
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <PanelSection value="api" title={t("api_mcp")} contentClassName="space-y-4 text-sm">
        {/* ── LLM へ渡すプロンプト（原典が名指しした中心機能なので先頭） ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium">{t("api_prompt_heading")}</h3>
            <CopyButton value={prompt} selectTargetId="panel-api-prompt" />
          </div>
          <ScrollArea className="rounded-md bg-muted">
            <pre id="panel-api-prompt" className="w-max p-2 text-xs whitespace-pre text-muted-foreground">
              {prompt}
            </pre>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>

        <Separator />

        {/* ── REST（このページを叩く形） ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium">{t("api_rest_heading")}</h3>
            {curl ? <CopyButton value={curl} selectTargetId="panel-api-curl" /> : null}
          </div>
          {curl ? (
            <ScrollArea className="rounded-md bg-muted">
              <pre id="panel-api-curl" className="w-max p-2 text-xs whitespace-pre text-muted-foreground">
                {curl}
              </pre>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <p className="text-xs text-muted-foreground">{t("api_rest_none")}</p>
          )}
        </section>

        <Separator />

        {/* ── MCP（この画面に効くツール） ── */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium">{t("api_mcp_heading")}</h3>
          {/* 🚨 件数を出す。**一部だけ出して「これで全部」に見せない**（サンプルを母集団にしない）。 */}
          <p className="text-xs text-muted-foreground">
            {t("api_mcp_count")}: {tools.length} / {TOOLS.length}
          </p>
          <ul className="space-y-2">
            {tools.map((tool) => (
              <li key={tool.name} className="space-y-0.5">
                <p className="flex flex-wrap items-center gap-x-2 text-xs font-medium">
                  <span className="font-mono break-all">{tool.name}</span>
                  <span className="text-muted-foreground">
                    {tool.readOnly ? t("api_mcp_read_only") : t("api_mcp_writes")}
                  </span>
                </p>
                {/* 🚨 この説明文は MCP の目録（正）から来ている。**ここで書き直さない** */}
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("api_mcp_source")}</p>
        </section>
    </PanelSection>
  );
}
