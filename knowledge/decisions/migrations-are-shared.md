---
type: decision
title: migration を足す人は、直前に「他人の未適用分」を確認する
description: DB が全ペインで1つなので、knex は未適用の migration を全部まとめて走らせる。自分の1本を足したつもりでも、他ペインが書いて未適用のまま置いている分が一緒に入る。
tags: [ops, ci, architecture]
status: active
generated:
  by: rag-okf
  at: 2026-08-14
verified: []
sources:
  - resource: "repo://apps/studio/lib/db/migrations"
  - resource: "repo://apps/studio/package.json"
stale_after: 2027-02-14
x_rag_okf:
  id: decisions/migrations-are-shared
  authorship: agent
---

# migration を足す人は、直前に「他人の未適用分」を確認する

## 決定

`bun run migrate` を打つ前に、**未適用の migration が他にあるか**を必ず見る。

```
bun --filter @ohmycms/studio migrate:status
```

自分の 1 本だけを足したつもりでも、**他ペインが書いて未適用のまま置いている分が一緒に走る**。

## なぜ

DB が全ペインで 1 つ（`ohmycms-db`）なので、migration の適用は**共有資源の操作**になる。
knex は「未適用のものを全部」まとめて 1 バッチで走らせるため、
**打った人の意図と、実際に DB へ入るものが一致しない。**

## 実際に起きたこと（2026-08-14）

storage が `20260814010000_add_asset_blur_and_variants_to_directus_files` を適用したところ、
出力は `Batch 6 run: 2 migrations` だった。auth が書いた
`20260813070100_add_tenant_name_to_ohmycms_settings` が未適用のまま置かれていて、**一緒に入った**。

このときは入った列が「いずれ要るもの」だったので実害は無かった。
だが、**作業中で壊れている migration が混ざれば、打った人の作業が止まる**（原因も自分の外にある）。

## 併せて守ること

- **採番は日付＋時刻で十分に間隔を空ける**。同じ日付帯で番号を取り合うと、
  適用順が書いた順と変わりうる。
  → [[storage-key-prefix-is-fixed]] と同じで、**後から直せない性質のもの**は先に決める。
- 適用したら**何が入ったかを共有する**（自分の 1 本だけとは限らないため）。
- 🚨 **共有資源の操作**という点では [[shared-resources-are-exclusive]] と同じ枠。
  あちらは Docker と受入ハーネス、こちらは DB スキーマ。

## 出典

2026-08-14。v1-B（ストレージ）で `blur_data_url` / `compressed_key` を足したときの実測。
司令塔の指示で記録。
