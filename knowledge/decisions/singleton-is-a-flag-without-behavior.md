---
type: decision
title: singleton は旗だけ在って中身が無い。v1 では作らない
description: Directus は「1 行しか持たないコレクション」を一覧を飛ばして詳細で開く。こちらは directus_collections.singleton の列も型も API の受け口も在るが、その旗で分岐しているコードは 0 件で、true のコレクションも 0 件。対応物が無いのではなく、器だけ在って中身が無い状態なので、v1 では作らず、作るときに要るものを書き残す。
tags: [schema, apps-studio, v1]
status: active
generated:
  by: agent
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://apps/studio/lib/db/migrations/20260804000600_create_directus_collections.ts"
  - resource: "repo://apps/studio/lib/schema/models.ts"
  - resource: "repo://apps/studio/lib/schema/service.ts"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/singleton-is-a-flag-without-behavior
  authorship: agent
---

# singleton は旗だけ在って中身が無い

## Directus はどうしているか

`content-singleton` というルートを持ち、**1 行しか持たないコレクション（設定のようなもの）は
一覧を飛ばして詳細画面で開く**（`app/src/modules/content/index.ts` の routes）。

## こちらの実測（2026-08-17）

```
singleton を持つコード … 3 件。🚨 全部が「定義側」だった:
  lib/db/migrations/20260804000600_create_directus_collections.ts … 列を作る
  lib/schema/models.ts …………………………………………………… 型
  lib/schema/service.ts（COLLECTION_META_COLUMNS）………… API が受ける鍵の一覧
🚨 その旗で分岐している画面・処理 … 0 件
実データ … singleton が true のコレクション … 0 / 16
🟢 対照 同じ探し方で hidden … models と service に在る（＝ この数え方は 0 以外も出せる）
```

## 決定

**v1 では singleton の振る舞いを作らない。列と型と API の受け口はそのまま残す。**

🚨 **「Directus に対応物が無い」ではない。** 対応物は在り、**こちらは器だけ持っている**。
消すのではなく、**中身が無いことを書いて残す**——消すと、次の人が
「Directus には在るのに、なぜ無いのか」を最初から調べ直す。

## 作るときに要るもの（先に書いておく）

1. **一覧を飛ばす分岐** … `/admin/content/<collection>` に来たとき、`singleton` が true なら
   その 1 行の詳細へ送る（1 行がまだ無ければ新規作成へ）
2. **旗を立てる口** … コレクション設定の画面に「1 行だけのコレクションにする」を足す
   （いまは API からしか立てられない）
3. **1 行を超えたときの扱い** … 旗が true なのに 2 行以上ある状態をどうするか
   （Directus は最初の 1 行を開く。こちらも同じでよいが、**決めてから作る**）

🚨 **旗が立っている利用者は 0 人**なので、上を作るまで**誰も困らない**。
困る人が出た時点が、作る時点。

## 関連

- [[list-views-are-switchable-layouts]] — 表示形式は画面ではなく見え方、という考え方
- [[intentional-deviations-from-idea-md]] — 原典から意図的に外したものの書き方
