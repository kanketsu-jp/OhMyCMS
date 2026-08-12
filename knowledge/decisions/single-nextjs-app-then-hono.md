---
type: decision
title: v0.9 は Next.js 単一アプリ、分離時は Hono
description: v0.9 MVP は apps/studio（Next.js 16）1本で管理GUIとREST APIの両方を持つ。将来 API を別プロセスに切り出す時は Hono を採用する。
tags: [architecture, nextjs, hono, apps-studio]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
  - resource: "repo://.temp/2026-08-13/specs/00-phase-plan-and-contract.md"
  - resource: "repo://apps/studio/next.config.ts"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/single-nextjs-app-then-hono
  source_commit: 1603f6a
  authorship: agent
---

# v0.9 は Next.js 単一アプリ、分離時は Hono

## 背景

旧PJ（`ai-native-cms`）の実装（TS/TSX 119本・検証済み）が Next.js 1本の構成で動いており、
移植コストの観点からこの形を踏襲する判断をした。

## 決定

> 基準日: 2026-08-13

- v0.9 MVP は **Next.js 16 の単一アプリ**（`apps/studio`）で管理 GUI と REST API の両方を持つ。
- **将来 API を別プロセスにするときは Hono を採用する**（2026-08-13 堀池指示）。
- 分離が必要になる時期の見通し: v2 のリアルタイム機能・プッシュ通知、v3 のワークフロー
  （定期実行・Webhook）。これらは常駐プロセス / WebSocket / cron を要し、リクエスト単位で
  動く Next.js の route handler では素直に書けない。

## 理由

旧PJ実装がこの形で動いており移植コストがゼロ。ロジックは `lib/` に寄せてあるため、
後から API を別プロセスへ切り出せる状態を保てる。

## 影響

- 保険（後続フェーズの受入条件）: `lib/` に Next.js 固有の import（`next/server` 等）を
  持ち込まない。これを守っている限り、分離は `lib/` を Hono 側へ移すだけで済む。
- 実測（2026-08-13）: `apps/studio/lib/{schema,items,permissions,auth,files,storage,db}` は
  `next/*` を import していない。`next/*` を使っているのは `lib/admin/api.ts` と
  `lib/admin/forms.ts` のみで、これらは「管理画面用クライアントヘルパ」として境界の外側に
  意図的に置かれている（詳細は `knowledge/areas/apps-studio.md` を参照）。
- `.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §2-2 が全トラック共通の契約として
  この境界を明文化している。

## 根拠

- `.temp/2026-08-13/decisions-log.md` D-003
- `.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §2-2
- 実測: `grep -rl "from ['\"]next" apps/studio/lib` の結果（2026-08-13）
