---
type: index
title: Knowledge Index
description: Repository knowledge bundle index.
tags: []
status: draft
generated:
  by: rag-okf
  at: 2026-08-13
verified: []
sources: []
stale_after: 2027-02-08
x_rag_okf:
  id: index
  source_commit: 4b1404c
  source_digest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  authorship: deterministic
---

# Knowledge Index

## Entries
- [受入ハーネス（acceptance）](./areas/acceptance.md) — `areas/acceptance`
- [apps/studio（管理画面 + REST API）](./areas/apps-studio.md) — `areas/apps-studio`
- [デザインの規約（design-system）](./areas/design-system.md) — `areas/design-system`
- [権限と認可（permissions）](./areas/permissions.md) — `areas/permissions`
- [指示書は AGENTS.md を正本にする](./decisions/agents-md-as-canonical.md) — `decisions/agents-md-as-canonical`
- [認証は SAML → メール OTP → パスワードの順に使う](./decisions/auth-methods.md) — `decisions/auth-methods`
- [CLI と MCP は REST API 経由（DB 直接アクセス禁止）](./decisions/cli-mcp-over-rest.md) — `decisions/cli-mcp-over-rest`
- [DB は PostgreSQL（Cloudflare D1 は撤回）](./decisions/db-postgres.md) — `decisions/db-postgres`
- [フォルダは「誰かの持ち物」にしない](./decisions/folders-are-not-owned.md) — `decisions/folders-are-not-owned`
- [i18n はライブラリを使わず自前実装にする](./decisions/i18n-own-implementation.md) — `decisions/i18n-own-implementation`
- [i18n は必須（旧PJの方針を反転）](./decisions/i18n-required.md) — `decisions/i18n-required`
- [設定・スキーマの正本は JSON](./decisions/json-as-source-of-truth.md) — `decisions/json-as-source-of-truth`
- [開発サーバを外部へ公開しない（公開するのは本番ビルドだけ）](./decisions/never-expose-dev-server.md) — `decisions/never-expose-dev-server`
- [Directus をフォークしない](./decisions/no-directus-fork.md) — `decisions/no-directus-fork`
- [面（Surface）は1段まで。入れ子を構造的に禁止する](./decisions/no-nested-surfaces.md) — `decisions/no-nested-surfaces`
- [組織テーブルを作らない](./decisions/no-organization-table.md) — `decisions/no-organization-table`
- [ORM は Knex（Prisma / Drizzle は不採用）](./decisions/orm-knex.md) — `decisions/orm-knex`
- [ポートは 31xx 帯に寄せ、よく使うポートを避ける](./decisions/port-allocation.md) — `decisions/port-allocation`
- [リレーションを辿るときも、相手側コレクションの権限を必ず通す](./decisions/relation-permission-boundary.md) — `decisions/relation-permission-boundary`
- [秘密の置き場所は「復元可能性」で決める（ハッシュ化できるものだけ GUI 可）](./decisions/secrets-storage-by-recoverability.md) — `decisions/secrets-storage-by-recoverability`
- [共有資源（受入ハーネス・Docker・node_modules）は同時に1つしか使わない](./decisions/shared-resources-are-exclusive.md) — `decisions/shared-resources-are-exclusive`
- [v0.9 は Next.js 単一アプリ、分離時は Hono](./decisions/single-nextjs-app-then-hono.md) — `decisions/single-nextjs-app-then-hono`
- [手順ドキュメントはステップ式で書く。前提を独立させ、スクリーンショットを使わない](./decisions/stepwise-docs.md) — `decisions/stepwise-docs`
- [二階建て認証（人間とエージェントを分ける）](./decisions/two-tier-auth.md) — `decisions/two-tier-auth`
- [UI の置き場所は「操作の頻度」で決める](./decisions/ui-placement-by-frequency.md) — `decisions/ui-placement-by-frequency`
- [middleware.ts でなく proxy.ts を使う](./decisions/use-proxy-not-middleware.md) — `decisions/use-proxy-not-middleware`
- [v0.9 時点で堀池が決めた 6 件](./decisions/v09-open-questions-answered.md) — `decisions/v09-open-questions-answered`
- [否定形の検証は「検出できること」を先に確かめる](./decisions/verify-the-verifier.md) — `decisions/verify-the-verifier`
- [通信路が HTTPS かどうかを NODE_ENV で決めない](./decisions/https-is-not-node-env.md) — `decisions/https-is-not-node-env`
- [保管先のキー設計を固定する（接頭辞は後から変えない）](./decisions/storage-key-prefix-is-fixed.md) — `decisions/storage-key-prefix-is-fixed`
- [migration を足す人は、直前に「他人の未適用分」を確認する](./decisions/migrations-are-shared.md) — `decisions/migrations-are-shared`
- [hrdr による多ペイン運用（司令塔 + トラックA/B/C）](./ops/hrdr-panes.md) — `ops/hrdr-panes`
- [cms](./project.md) — `project`

## 根拠アーカイブについて（このリポジトリには入っていない）

`knowledge/decisions/*` の `## 根拠` は、前身プロジェクトの知見アーカイブ
`.temp/2026-08-13/knowledge-historys/`（ai-native-cms / directus-mscl / izukurasan）を
参照していることがある。**このアーカイブは意図的にコミットしていない。**

理由: 過去のセッションログを含み、そこに**調査用の管理トークンが平文で残った実例がある**ため
（`directus-mscl/README.md` に記録あり）。秘密が混入しうるものをチーム共有のリポジトリへ入れない。

- 判断の**中身**は各 decision ファイル本文へ転記済みなので、アーカイブが無くても読める
- アーカイブ本体は堀池のローカル（`.temp/`）にのみ存在する
