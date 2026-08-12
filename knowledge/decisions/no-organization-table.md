---
type: decision
title: 組織テーブルを作らない
description: 「組織」を第一級エンティティにせず、企業は普通のコレクション（companies）として表現し、データ分離は Policy と行レベルフィルタで行う。
tags: [architecture, permissions, multi-tenant]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/no-organization-table
  source_commit: 1603f6a
  authorship: agent
---

# 組織テーブルを作らない

## 背景

マルチテナント／権限まわりの土台をどう設計するかという検討の中で、2026-08-04 に
堀池が決定した項目。

## 決定

> 基準日: 2026-08-13

「組織」を第一級エンティティにしない。企業は普通のコレクション（`companies`）として表現し、
データの分離は Policy + 行レベルフィルタ（`$CURRENT_USER.<企業参照フィールド>`）で行う。
Directus に倣う。

## 理由

原本（決定ログ）に独立した理由の記述はなく、決定そのものに埋め込まれている:
Directus のポリシー＋行レベルフィルタという運用実績のあるパターンを踏襲することで、
「組織」を特別扱いするための専用の仕組みを増やさない。理由の詳細な検討過程は
出典（`source/03-v1-scope.md:179-197`）側にあり、本ファイルには転記していない
（未確認）。

## 影響

保留事項として、認可の強制点をアプリ層に置くか DB 層（RLS）に置くかが残っている。
MCP を外部エージェントへ開放する段階で再検討する。

## 根拠

- 2026-08-04 堀池決定（`knowledge-historys/ai-native-cms/source/03-v1-scope.md:179-197`）
- `.temp/2026-08-13/decisions-log.md` D-006
