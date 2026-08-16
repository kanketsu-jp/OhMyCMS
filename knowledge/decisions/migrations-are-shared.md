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
  - resource: "repo://apps/studio/lib/db/knexfile.ts"
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

## 🚨 `down` の確認は、共有 DB でやらない（2026-08-16 追記）

**`migrate:rollback` を共有 DB へ打たない。使い捨ての Postgres で `up → down → up` を確かめる。**

```
bash apps/studio/scripts/verify-migrations-roundtrip.sh
```

- 使い捨ての Postgres（既定 `:55436`・`--rm`）を立て、`up` → `rollback --all` → `up` を走らせ、
  **1 回目と 3 回目の表の一覧が完全に一致すること**を見る。**共有 DB には 1 バイトも触れない**
  （共有 DB のポート `5436` を渡すと、**何もせずに exit 2 で止まる**）。
- 対照を内蔵している: `up` のあと表が 2 個未満なら「**この検査は何も測っていない**」として落ちる
  （「down で全部消えた」は、**最初から空でも同じ見た目**になるため）。

**なぜ共有 DB でやらないか。** rollback は**他の人の画面から列や表を消す**。
加えて司令塔ルールで `migrate:rollback` は**許可制**になった。
🚨 **受入の型に許可制の操作が入っていると、毎回止まる ＝ そのうち省略される。**
使い捨ての DB へ移すと、**省略の誘惑ごと構造で消える**。

🚨 **これで確かめられないこと。** 使い捨てで `down` が通っても、**共有 DB の状態は見ていない**。
共有 DB へ `up` したあとは、**行数が前後で同じ**を別途測る（「down が通る」≠「共有で up が効いた」）。

```
bun scripts/row-count-snapshot.ts --save /tmp/before.json   # 🚨 migrate の**前**に写す
bun run migrate
bun scripts/row-count-snapshot.ts --compare /tmp/before.json
```

- 既に在った表の**行数が変わった** / **表が消えた** → exit 1。
  表が増えるのは通す（migration の目的なので）が、🚨 **増えた表に行が入っていたら印を付けて出す**。
- 🚨 **写した側にも対照を当てている**（表 5 個未満・合計 0 行なら exit 2）。
  これが無いと、**空の写しと突き合わせて「0 表を突き合わせ ✅」で緑になる**——
  実際に作って踏んだ（2026-08-16）。**空の期待は、「全部ある」系の検査を必ず通す。**

実測（2026-08-16）: GREEN = `31 個 → 2 個 → 31 個` で exit 0。
RED は 2 通りの壊し方で確認した——① `down` で消し忘れる → 残った表名を挙げて exit 1、
② `down` が落ちる → exit 1。共有ポートを渡す → exit 2。

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
