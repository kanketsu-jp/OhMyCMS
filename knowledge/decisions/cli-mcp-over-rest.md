---
type: decision
title: CLI と MCP は REST API 経由（DB 直接アクセス禁止）
description: packages/cli と packages/mcp は packages/sdk 経由で HTTP により REST API を叩く。DB を直接触らせず、権限の強制点を API 層 1 箇所に保つ。
tags: [architecture, cli, mcp, permissions, sdk]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
  - resource: "repo://.temp/2026-08-13/specs/00-phase-plan-and-contract.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/cli-mcp-over-rest
  source_commit: 1603f6a
  authorship: agent
---

# CLI と MCP は REST API 経由（DB 直接アクセス禁止）

## 背景

旧PJ（`directus-mscl`）で、権限の実体がロールでなくユーザー×ポリシーへ散り、
「誰が何を見られるか」を一覧で言えなくなった教訓がある。この教訓を踏まえて
CLI・MCP のアクセス経路を設計する。

## 決定

> 基準日: 2026-08-13

`packages/cli` と `packages/mcp` は `packages/sdk`（型付き REST クライアント）経由で
HTTP により API を叩く。DB を直接触る経路は持たせない。

## 理由

権限の強制点を1箇所（サーバの API 層）に保つため。DB を直接触る経路を作ると権限チェックが
二重実装になり、必ず片方が腐る。

## 影響

- `packages/sdk` が CLI/MCP の唯一の入口になる。
- フェーズ計画（`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §3）で
  F3（SDK）→F4（CLI）→F5（MCP）の順に直列で依存する。
- 既存 REST API のURL・メソッド・レスポンス形は「変更しない・追加のみ」という契約
  （同spec §2-1）と対になっている。

## 根拠

- 旧PJの教訓「権限の実体がロールでなくユーザー×ポリシーに散り、誰が何を見られるか
  一覧で言えなくなった」（`knowledge-historys/directus-mscl/02-attempts.md` 8/3節）
- `.temp/2026-08-13/decisions-log.md` D-004
