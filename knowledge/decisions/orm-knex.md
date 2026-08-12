---
type: decision
title: ORM は Knex（Prisma / Drizzle は不採用）
description: GUI で実行時にスキーマ（コレクション）が増える構造のため、ビルド時スキーマ確定を前提とする Prisma / Drizzle は使わず Knex を採用する。
tags: [db, orm, knex, nextjs]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
  - resource: "repo://apps/studio/next.config.ts"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/orm-knex
  source_commit: 1603f6a
  authorship: agent
---

# ORM は Knex（Prisma / Drizzle は不採用）

## 背景

このCMSは GUI からコレクション（テーブル）を追加・変更できる。つまりスキーマがアプリの
実行中に変わりうる。ORM 選定はこの制約を満たせるかどうかで決まる。

## 決定

> 基準日: 2026-08-13

ORM は **Knex 3.3 + pg**。Prisma / Drizzle は使わない。

## 理由

Prisma / Drizzle は「スキーマがビルド時に確定している」ことを前提とするツールであり、
GUI で実行時にコレクションを増やせるこの CMS の要件と原理的に噛み合わない。Directus が
Knex を採用しているのも同じ理由。

## 影響

- 付随する必須設定: `next.config.ts` の `serverExternalPackages: ["knex","pg","sharp"]`。
  Knex は全 DB ドライバを動的 `require` するため、これが無いと build が落ちる
  （旧PJでコメント付きで実装済み。移植時に保持すること）。
- `apps/studio/lib/db` 配下に Knex ベースの実装・`knexfile.ts`・マイグレーション
  （`lib/db/migrations`）がある。マイグレーションは `pnpm migrate` / `pnpm migrate:rollback`
  （実体は `apps/studio/package.json` の `migrate` スクリプト）で実行する。

## 根拠

- `knowledge-historys/ai-native-cms/03-lessons.md`
- `knowledge-historys/ai-native-cms/source/05-mvp-plan.md:59-71`（旧PJの実測結論）
- `.temp/2026-08-13/decisions-log.md` D-002
