---
type: index
title: Knowledge Index
description: Repository knowledge bundle index.
tags: []
status: draft
generated:
  by: rag-okf
  at: 2026-08-12
verified: []
sources: []
stale_after: 2027-02-08
x_rag_okf:
  id: index
  source_commit: 1603f6a
  source_digest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  authorship: deterministic
---

# Knowledge Index

## Entries

- `project.md` — このリポジトリ（cms / OhMyCMS）の全体像といまの活動領域
- `decisions/db-postgres.md` — DB は PostgreSQL（Cloudflare D1 は撤回）
- `decisions/orm-knex.md` — ORM は Knex（Prisma / Drizzle は不採用）
- `decisions/single-nextjs-app-then-hono.md` — v0.9 は Next.js 単一アプリ、分離時は Hono
- `decisions/cli-mcp-over-rest.md` — CLI と MCP は REST API 経由（DB 直接アクセス禁止）
- `decisions/no-directus-fork.md` — Directus をフォークしない
- `decisions/no-organization-table.md` — 組織テーブルを作らない
- `decisions/two-tier-auth.md` — 二階建て認証（人間とエージェントを分ける）
- `decisions/json-as-source-of-truth.md` — 設定・スキーマの正本は JSON
- `decisions/i18n-required.md` — i18n は必須（旧PJの方針を反転）
- `decisions/use-proxy-not-middleware.md` — middleware.ts でなく proxy.ts を使う
- `decisions/agents-md-as-canonical.md` — 指示書は AGENTS.md を正本にする
- `areas/apps-studio.md` — apps/studio（管理画面 + REST API）の責務・境界・エンドポイント一覧
- `ops/hrdr-panes.md` — hrdr による多ペイン運用（司令塔 + トラックA/B/Cの排他）

## 根拠アーカイブについて（このリポジトリには入っていない）

`knowledge/decisions/*` の `## 根拠` は、前身プロジェクトの知見アーカイブ
`.temp/2026-08-13/knowledge-historys/`（ai-native-cms / directus-mscl / izukurasan）を
参照していることがある。**このアーカイブは意図的にコミットしていない。**

理由: 過去のセッションログを含み、そこに**調査用の管理トークンが平文で残った実例がある**ため
（`directus-mscl/README.md` に記録あり）。秘密が混入しうるものをチーム共有のリポジトリへ入れない。

- 判断の**中身**は各 decision ファイル本文へ転記済みなので、アーカイブが無くても読める
- アーカイブ本体は堀池のローカル（`.temp/`）にのみ存在する
