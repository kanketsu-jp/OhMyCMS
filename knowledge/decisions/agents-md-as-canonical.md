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

## 🚨 未解決: 規約と実装が食い違っている箇所が 1 つ在る（2026-08-16）

```
AGENTS.md §6 … 「`export const runtime = 'nodejs'` は**書かなくてよい**（デフォルトが nodejs）」
🚨 実装      … 【実測 2026-08-16】`apps/studio/app/api/**/route.ts` の **65 本 / 全 65 本**が書いている
```

**どちらかへ寄せる必要が在る。いまは寄せていない**（ゴミ箱の作業を優先したため）。

🚨 **これは「違反」ではない。** §6 は「書かなくてよい」であって「書くな」ではないので、
**65 本とも規約に反していない**。だが**新しく書く人は必ず迷う**（規約は不要と言い、周りは全部書いている）。

由来: 2026-08-16。design が codex の出力をレビューし、
**「§6 に反している」と指摘しかけて、対照（既存 65 本）を取って止めた**。
🚨 **指摘する前に「既存はどうなっているか」を測ったので、誤った指摘を出さずに済んだ。**
🚨 **そして「実装が全部そうだから正しい」とも結論していない**——
`surface.tsx` に記録した「**規約と実装が食い違ったとき、実装の側を正として扱った**のが誤り」
と同じ罠なので、**どちらへ寄せるかは別途決める**ものとして残す。

## 根拠

- https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- `.temp/2026-08-13/decisions-log.md` D-011
