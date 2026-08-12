---
type: decision
title: 二階建て認証（人間とエージェントを分ける）
description: ログインは人間の身元確認のみとし、エージェントはそこから委任される別主体として扱う。エージェントの権限は委任元の権限とcapabilitiesの積。
tags: [auth, permissions, agents]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/two-tier-auth
  source_commit: 1603f6a
  authorship: agent
---

# 二階建て認証（人間とエージェントを分ける）

## 背景

既存の多くの CMS は、API トークン等を使ってエージェント（自動化・LLM）が人間に
成り代わって操作する方式を取っている。この方式の監査上の弱点を踏まえて設計する。

## 決定

> 基準日: 2026-08-13

- ログインは**人間の身元確認のみ**。エージェントはそこから**委任される別主体**として扱う。
- エージェントの権限 = 委任元の権限 ∩ capabilities。

v1 で入れないと後から入らないもの（後付けは過去ログが欠損する）:

- 監査ログの `actor_type` / `actor_id` / `on_behalf_of` / `via_tool`
- 主体テーブルの人間/エージェント区別
- エージェントトークンの `expires_at` 必須化と個別失効

## 理由

人間に成り代わる方式（既存CMSは全社これ）だと、監査で誰がやったか分からなくなる。

## 影響

旧PJで実装済み（`lib/auth/context.ts` の `Actor = HumanActor | AgentActor`）。移植時は
このアクター分離のモデルをそのまま踏襲する前提になる。監査ログのスキーマ設計・
エージェントトークンの発行/失効 UI（`app/api/auth/agents/**`）に直結する。

## 根拠

- `knowledge-historys/ai-native-cms/source/03-v1-scope.md:57-87`
- `.temp/2026-08-13/decisions-log.md` D-007
