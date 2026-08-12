---
type: decision
title: 設定・スキーマの正本は JSON
description: 設定・スキーマ・権限定義の正本は JSON とする。LLM に見せる時だけ YAML/TOML に変換してよい。型強制（JSON Schema）を優先する判断。
tags: [config, schema, json, permissions]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/json-as-source-of-truth
  source_commit: 1603f6a
  authorship: agent
---

# 設定・スキーマの正本は JSON

## 背景

設定・スキーマ・権限定義をどのフォーマットで正本管理するか。LLM に読ませるトークン効率と、
型強制のどちらを優先するかのトレードオフの検討。

## 決定

> 基準日: 2026-08-13

設定・スキーマ・権限定義の正本は **JSON**。LLM に見せるときだけ YAML/TOML に変換してよい。

## 理由

TOML/YAML は JSON 比 21〜29% トークンが少ないが、絶対量は 300〜1,400 トークンでキャッシュに
乗れば消える規模。一方 **JSON Schema で型を強制できるのは JSON だけ**（MCP の
`outputSchema` も各社の構造化出力も JSON Schema 前提）。権限の誤設定は情報漏洩に直結する
ため、トークン節約より型強制を優先する。

## 影響

落とし穴として次に注意する:

- JSON シリアライザは `ensure_ascii=False` 必須（日本語で +21〜34% 増える）
- TOML に `null` 型が無い
- AI 生成 YAML を非 safe ローダーで読まない

権限定義（`app/api/permissions`, `app/api/policies` 等）・スキーマ定義
（`app/api/collections`, `app/api/fields`）の正本フォーマットとしてこの決定が適用される。

## 根拠

- `knowledge-historys/ai-native-cms/source/03-v1-scope.md:89-123`
- `.temp/2026-08-13/decisions-log.md` D-008
