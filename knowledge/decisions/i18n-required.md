---
type: decision
title: i18n は必須（旧PJの方針を反転）
description: 全UI文言を辞書化し日本語・英語に対応する。旧PJで堀池が明示していた「i18n は作らない」という決定を反転させたもの。
tags: [i18n, ui, apps-studio]
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
  id: decisions/i18n-required
  source_commit: 1603f6a
  authorship: agent
---

# i18n は必須（旧PJの方針を反転）

## 背景

**この決定は旧PJの決定を反転（supersede）させたものである。** 旧PJ（`ai-native-cms`）では
堀池が明示的に「翻訳・i18n は作らない」と指示していた
（`knowledge-historys/ai-native-cms/source/05-mvp-plan.md:34-56`）。今回の `idea.md`
§完全日本語対応 で、この方針を**必須に反転**させた。rag-okf の `supersedes` に相当する
反転であり、旧方針を採用する理由が今回のPJでは失われた（むしろ逆転した）ことを示す。

## 決定

> 基準日: 2026-08-13

全 UI 文言を辞書化し、日本語と英語に対応する。将来さらに言語を足せる形にする。

## 理由

既存 CMS が全滅した最大の理由が「管理画面の日本語化が、そのCMSの用意した範囲で
天井を打つ」ことだった。自作の最大の利得は**全文言が自前の辞書にある状態**にできることで、
ここを削ると自作する意味そのものが薄れる。

## 影響

- F1（i18n 基盤）完了後、全トラックが「UI に日本語・英語の文字列を直接書かず、必ず辞書キーを
  通す」契約に従う（`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §2-3）。
  F1 完了前に UI を触るトラックは新しい文言を追加しない。
- v0.9 MVP の受入基準 #7「UI が日本語（英語にも切り替わる）。ハードコードされた文言が無い」
  に直結する（同spec §5）。

## 根拠

- `knowledge-historys/izukurasan/03-findings.md` §2、同 README §4
- 反転元: `knowledge-historys/ai-native-cms/source/05-mvp-plan.md:34-56`
- `.temp/2026-08-13/decisions-log.md` D-009
