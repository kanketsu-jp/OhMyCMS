---
type: decision
title: DB は PostgreSQL（Cloudflare D1 は撤回）
description: DB は PostgreSQL 17 を Docker Compose に同梱してセルフホストする。ストレージは別軸で S3 互換アダプタ方式を採る。
tags: [db, postgresql, docker, storage]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
  - resource: "repo://.temp/2026-08-13/idea.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/db-postgres
  source_commit: 1603f6a
  authorship: agent
---

# DB は PostgreSQL（Cloudflare D1 は撤回）

## 背景

`idea.md` 初版では「CloudFlare の D1/R2 を使う」という想定だった。2026-08-13、堀池が
「CloudflareのD1はミス。DBはPostgresを使う想定」と明示的に指摘し、この方針を撤回した。

## 決定

> 基準日: 2026-08-13

- DB は **PostgreSQL 17**。Docker Compose に同梱してセルフホストで完結させる。
- ストレージは DB とは別軸の判断として **S3 互換アダプタ方式**を採用する（R2 / GCS / MinIO /
  ローカルFS を差し替え可能にする）。本番の既定は R2、ローカル開発の既定はローカルFS（または
  Compose 同梱の MinIO）。

## 理由

D1 は Cloudflare Workers 専用でセルフホストできず、MVP 要件「Docker および Compose で DB を
含めすべてが起動できる」と両立しない。一方 R2 は S3 互換なのでストレージとしては採用する
（DB としての D1 とストレージとしての R2 は別の話として切り分けた）。

## 影響

- `.temp/2026-08-13/idea.md` §DB/Storage を書き換え済み。
- 実際に `docker/compose.yml` に PostgreSQL 17（ホスト 5436）が同梱されている
  （`README.md` の起動手順 `pnpm db:up` に対応）。
- ORM 選定（Knex）や Docker 全部入り化（F0b）など、後続の決定・タスクの前提になっている。

## 根拠

- `.temp/2026-08-13/decisions-log.md` D-001（2026-08-13）
- `.temp/2026-08-13/idea.md` §DB/Storage
- 堀池発言（2026-08-13）「CloudflareのD1はミス。DBはPostgresを使う想定」
