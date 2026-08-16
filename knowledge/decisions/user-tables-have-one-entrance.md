---
type: decision
title: 利用者の表は 1 本の入口から開き、内部列はコード側で断る
description: 論理削除を入れたので「消えた行を読まない条件」が要る。各所に手で書かせず itemsTable() 1 本に集める。書き込み側は directus_fields の印ではなくコードの不変式（INTERNAL_COLUMNS / is_primary_key）で断る。
tags: [items, schema, permissions, architecture]
status: active
generated:
  by: agent
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/lib/items/table.ts"
  - resource: "repo://apps/studio/lib/items/service.ts"
  - resource: "repo://apps/studio/lib/schema/service.ts"
  - resource: "repo://apps/studio/scripts/check-items-entry.mjs"
stale_after: 2027-02-16
x_rag_okf:
  id: decisions/user-tables-have-one-entrance
  authorship: agent
---

# 利用者の表は 1 本の入口から開き、内部列はコード側で断る

## 決定

1. **読むとき** — 利用者が作った表を開くのは `lib/items/table.ts` の **`itemsTable(conn, collection)`** だけ。
   消えた行を隠す条件（`whereNull("deleted_at")`）は、**ここにしか書かない**。
2. **書くとき** — 内部列と主キーは**サーバ側で 400 を返して断る**。
   判定は **`directus_fields` の印ではなく、コードの不変式**に置く。

関連: [[soft-deleted-names-stay-taken]]（名前を空けない）／[[trash-and-restore-ui]]（ゴミ箱の画面）

## なぜ 1 本にするか

条件を各所に手で書かせると、**1 箇所でも漏れたときに「消したはずの行が画面に出る」**。
しかも**その画面だけ**なので気づきにくい。

🚨 **実際に 2 回漏れた**（どちらもコードを読んで見つかった。画面からの報告が先だったものも在る）:

| 漏れた場所 | どう見えるか | なぜ検査が見逃したか |
|---|---|---|
| 一覧と件数（`lib/items/query.ts`） | **消した行が一覧に残る** | 検査が `db(` `trx(` だけを見ており、引数名が `client` だと見えなかった |
| 関連の取得（`resolveRelationsForItems`） | **消した行が「関連する項目」として出る** | 検査が **`(collection)` という引数の名前**しか見ていなかった |

置き場所も原因だった。`itemsTable` は `service.ts` に在り、`service.ts` が `query.ts` を import
しているので、**`query.ts` からは import できない**（循環）。→ `lib/items/table.ts` へ出した。

## なぜ書き込みの判定を「データ」に置かないか

最初は `directus_fields.readonly` を引いて断っていた。しかしそれは**画面の印**であり、
**守りの基準が守りの対象と同じ場所**に在る形になる（その行を書き換えられるようになった日に、
**印を消せば書ける**）。

→ **`lib/schema/service.ts` の `INTERNAL_COLUMNS`（コード側）を正本**にした。
`meta.readonly` も**併せて**断る（利用者が自分で readonly にした列）。

🚨 **登録する側（`table.ts`）と断る側（`service.ts`）が、両方この集合を読む。**
片方だけ直す事故が構造的に起きないようにするため——
**集合が 1 個のうちは同じ結果になり、2 個目を足した日に穴が空く**（それを検査で見ている）。

主キーは集合に入れず、**スキーマの `is_primary_key`** で判定する。
主キーの列名は表ごとに違いうるので、名前で書けない。
**作成では断らない**（`POST` に `id` を渡すのは正しい使い方）。禁じるのは**あとから変えること**。

## 実測（2026-08-16）

- 入口ごし `2 → 1` ／ `meta.total_count`・`filter_count` とも `2 → 1` ／
  DB の全件は **2 のまま** ＝ 消したのでなく隠している
- `deleted_at` を PATCH → **400**「変更できないフィールドです」
  🚨 **`readonly` を false にしても 400 のまま**（＝ コード側が効いている）
- 主キーを PATCH → **400**「主キーは変更できません」／
  🟢 対照 `POST` に `id` を渡す → **201**（締めすぎていない）
- ゴミ箱の行と id がぶつかる → **409 `ITEM_EXISTS_TRASHED`**（生きている行とは `ALREADY_EXISTS`）
- 🟢 security の実測: 列レベル（400）が行レベル（404）**より先**に効く。非 admin も同じ

## 🚨「内部で使う項目」の判定は 3 つ在る（目的が違う・2026-08-16）

design がフィールド一覧を実測して、**画面の折りたたみは 2 件、`INTERNAL_COLUMNS` は 1 件**という
食い違いを出した。`page.tsx` のコメントも「**判定の道が 2 本あると、次に内部項目を足す人が
どちらに従うか分からなくなる**」と自分で心配していた。

🚨 **2 本なのは間違いではない。目的が 3 つ在る。**

| 何を決めるか | 判定 | 置き場所 |
|---|---|---|
| **見せない** | `meta.hidden` | データ（画面が読む） |
| **書かせない** | `meta.readonly` | データ（サーバが読む） |
| **印を消されても書かせない** | `INTERNAL_COLUMNS` | **コード** |

🚨 **③が要る理由**: `meta.readonly` は**データなので、印を消されたら外れる**。
だから「消えては困る列」だけ、コード側にも置く。＝ **③は②の部分集合で、より強い**。

【測った・2026-08-16】`zz_probe_actions`:
`body_rich_plain` と `deleted_at` … **hidden=true / readonly=true**。
🚨 **hidden かつ readonly でない欄は 0 件**（＝ いまは「見せない」と「書かせない」が一致している）。
`INTERNAL_COLUMNS` に在るのは `deleted_at` だけ。

→ **`body_rich_plain` を「内部で使う項目」と呼ぶのは意図どおり**（自動生成・隠す・書かせない）。
🚨 **新しく内部の列を足す人へ**: **①②は必ず立てる**。**③は「印を消されても困る」ものだけ**。

🚨 **測っていないこと**: 「`body_rich_plain` は API から書けない」は**コードとデータから読めた**だけで、
**400 を実測していない**。

## 🚨 これで守れていないもの

- **システム表は別経路**。`directus_files` / `directus_folders` は
  `lib/files/live.ts` の `liveRows` が隠し、書き込みは**許可リスト**で断っている
  （items は利用者の列を扱うので allow-list にできない。**原因の形が逆なので混ぜないこと**）
- **リレーション**は 2026-08-16 に使い捨ての台（`zz_rel_parent` / `zz_rel_child`・**m2o**）を
  立てて 1 度だけ測った。**関連経由の分岐は動く**:
  `requiresConfirmation: true` ／ `trashedReferences` 1 件 ／ `relatedRestoreCount` **1**（実件数と一致）／
  「一緒に戻す」で `{"restored":2}`（**親子とも戻った**）。台は表ごと落とし、
  `directus_relations` は **0 件**に戻してある（表の総数 48 → 46）。
  🚨 **測ったのは m2o の 1 形・1 段だけ**。**m2m は画面から作れない**ので当面起きないが、
  **作れるようになった日に初めて測る対象ができる**。**2 段以上（A→B→C）も測っていない**
- `ITEM_EXISTS_TRASHED` は **API を直に叩く経路でだけ**返る。
  【測った】作成画面は主キーの欄を持たず、`__field` にも `id` は入らない
- 検査（`check-items-entry.mjs`）は **`lib/items/` の中だけ**を見る。
  その外から利用者の表を開くコードは見えない

## 出典

2026-08-16。設問288 A（ソフトデリート）の実装中に、
`deleted_at` が編集フォームで入力できること・API から書けること・
主キーが PATCH で書き換えられることを順に実測して塞いだ。
司令塔・security・toast・design の指摘を反映している。
