---
type: decision
title: Directus をフォークしない
description: Directus は設計と API の形だけを参考にし、ソースをフォークして改造する方式は採らない。ホワイトラベルは Payload 型のファイルパス間接参照（Import Map）方式で実現する。
tags: [architecture, directus, whitelabel]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/no-directus-fork
  source_commit: 1603f6a
  authorship: agent
---

# Directus をフォークしない

## 背景

`idea.md` §バックエンドで Directus を設計のベース（コレクション・ストレージ・ユーザー・
権限・MCP対応 等）として参考にする方針を掲げているが、それを実装としてどう取り込むかは
別の判断が要る。

## 決定

> 基準日: 2026-08-13

Directus のソースをフォークして改造する方式は採らない。参考にするのは**設計と API の形**まで。

- ホワイトラベルの実現方式: **Payload 型のファイルパス間接参照（Import Map）方式**。
- 未決事項: 管理画面のレイアウト構造まで案件ごとに変えるか。そこまでやるなら
  3階層オーバーライドが要り、難易度が一段上がる。

## 理由

Medusa / Strapi / Saleor で、開発元自身がフォーク運用の破綻を認めている実例がある。
ロゴ変更すらフォークが要る構造になると、上流に追従できなくなる。

## 影響

- Directus のコードを直接取り込む・改変するのではなく、API の形（エンドポイント設計・
  コレクション/フィールド/リレーションのモデル等）だけを参考に自前実装する方針が
  `apps/studio` の設計全体に及ぶ。
- ホワイトラベル方式の詳細（Import Map の具体設計）は本ファイルの決定時点では未実装・
  未確認。実装が進んだ段階で `knowledge/areas/` 側に反映する。

## 根拠

- `knowledge-historys/ai-native-cms/source/03-v1-scope.md:125-166`
- `.temp/2026-08-13/decisions-log.md` D-005
