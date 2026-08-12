---
type: decision
title: middleware.ts でなく proxy.ts を使う
description: Next.js 16 で middleware.ts は proxy.ts に改称された。新PJでは proxy.ts を使う。認可の最終判断は proxy.ts に置かない。
tags: [nextjs, auth, proxy]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/use-proxy-not-middleware
  source_commit: 1603f6a
  authorship: agent
---

# middleware.ts でなく proxy.ts を使う

## 背景

Next.js 16 で `middleware.ts` は `proxy.ts` に改称された。命名変更に伴い、新PJでどちらの
名称・仕組みを使うかを決める必要があった。

## 決定

> 基準日: 2026-08-13

Next.js 16 で `middleware.ts` は `proxy.ts` に改称された。新PJでは **`proxy.ts`** を使う。

## 理由

出典は調査中（`.temp/2026-08-13/research/nextjs16-and-agents-md.md` に一次情報URLを
記載予定）。本ファイル作成時点でこの調査ファイルの内容は未確認のため、理由の詳細は
「未確認」として扱う。決定自体は Next.js 16 の公式な改称に追従するもの。

## 影響

- 実測（決定ログ記載時点）: 旧PJには `middleware.ts` も `proxy.ts` も**存在しない**ため、
  移植時に移行対象は無い。
- 設計上の制約として残す: **認可の最終判断を `proxy.ts` に置かない。** matcher 漏れ・
  rewrite 迂回・API 直叩きで簡単に素通りするため、認可は必ず Server 側で再検証する
  （グローバルルール `~/.claude/rules/auth-session-jwt-cookie.md` §2 に準拠）。

## 根拠

- 出典調査中: `.temp/2026-08-13/research/nextjs16-and-agents-md.md`（一次情報URL記載予定、
  本ファイル作成時点で未確認）
- `.temp/2026-08-13/decisions-log.md` D-010
