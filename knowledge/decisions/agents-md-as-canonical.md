---
type: decision
title: 指示書は AGENTS.md を正本にする
description: このPJのAIエージェント向け指示は AGENTS.md を正本にする。Claude Code 専用にせず Codex / OpenCode にも届く経路を維持する。
tags: [agents-md, ops, tooling]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
  - resource: "repo://AGENTS.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/agents-md-as-canonical
  source_commit: 1603f6a
  authorship: agent
---

# 指示書は AGENTS.md を正本にする

## 背景

2026-08-13、堀池が次の記事を提示した:
https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals

## 決定

> 基準日: 2026-08-13

このPJのAIエージェント向け指示は **`AGENTS.md`** を正本にする。

## 理由

理由の詳細は調査中（成果物 `.temp/2026-08-13/research/nextjs16-and-agents-md.md`、
本ファイル作成時点で内容は未確認）。決定ログの記載時点では提示記事のタイトル
（AGENTS.md が Skills よりエージェント評価で優れる）が根拠として示されている。

## 影響

- `AGENTS.md` は Codex / OpenCode にも届く（Claude Code 専用にしない）。
- rag-okf も `AGENTS.md` の索引ブロックを共有経路として使う設計なので相性が良い
  （`.temp/2026-08-13/idea.md` §ROKF「チームへの共有」を参照）。
- 実測（2026-08-13）: リポジトリルートに `AGENTS.md` が存在する（137行 / 約11.5KB）。
  禁止事項（Prisma/Drizzle 禁止・`middleware.ts` 禁止・`serverExternalPackages` 保持 等）が
  記載されており、全トラックが作業前に読む運用になっている
  （`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §4-5）。

## 根拠

- https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- `.temp/2026-08-13/decisions-log.md` D-011
