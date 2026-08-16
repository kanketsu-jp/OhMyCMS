---
type: decision
title: ゴミ箱に在るものの名前は、空けない
description: ソフトデリートした行の一意な名前は押さえたままにする。名前を空けると、あとで戻したときに衝突して戻せなくなり「戻すと全部戻る」が破れる。代わりに「ゴミ箱に在るので使えません」と言い分ける。
tags: [files, schema, i18n, permissions]
status: active
generated:
  by: agent
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/lib/labels/service.ts"
  - resource: "repo://apps/studio/lib/files/live.ts"
  - resource: "repo://apps/studio/scripts/verify-labels-authz.ts"
stale_after: 2027-02-16
x_rag_okf:
  id: decisions/soft-deleted-names-stay-taken
  authorship: agent
---

# ゴミ箱に在るものの名前は、空けない

## 背景

削除が「消す」ではなく「印を立てる」（`deleted_at`）に変わった（283 A）。
このとき、**一意制約を持つ列**（名前など）に選択が 1 つ生まれる。

```
案① 名前を押さえたまま … ゴミ箱の中の名前は再利用できない
案② 名前を空ける ……… 部分索引（where deleted_at is null）にして、同じ名前を作れるようにする
```

実測 2026-08-16（`ohmycms_labels`）:

```
ohmycms_labels_name_unique … CREATE UNIQUE INDEX … USING btree (name)
＝ deleted_at を見ない全件の索引 ＝ 何もしなければ案①になる
```

## 決定

**案①（押さえたまま）にする。部分索引を入れない。**

理由は「**戻せる**」を保証できるのが案①だけだから。

```
案② 名前を空けると … 同じ名前の新しい行を作れる
                  → 🚨 そのあとゴミ箱の古いほうを戻すと、名前が衝突して戻せない
                  ＝ 「戻すと全部戻る」（290 A）が破れる
```

ゴミ箱に在るものは「消えた」のではなく「**まだ在る**」。
名前を押さえ続けるのは、その状態の素直な帰結でもある。

## そのままだと悪い形になるので、言い分ける

案①には副作用がある。**一覧に出ていない相手と衝突する**ので、
`すでに同じ名前があります` とだけ返すと、利用者からは

> **一覧に無いのに作れない**

という説明できない状態に見える（利用者はゴミ箱を見に行く発想が無い）。

したがって **code を分けて、進み方まで文言に書く**。

```
LABEL_EXISTS         … 生きている行とぶつかった
LABEL_EXISTS_TRASHED … 🚨 ゴミ箱の行とぶつかった
   ja「同じ名前のラベルがゴミ箱にあります。戻すか、ゴミ箱から完全に削除してください」
   en「A label with that name is in Trash. Restore it, or delete it permanently from Trash.」
```

🚨 **文言には画面の名前と同じ語を入れる**（サイドバーの項目名 `trash.title` ＝
ja「ゴミ箱」/ en「Trash」）。普通名詞で `in the trash` と書くと、探す手がかりにならない。
トーストにボタンは置かない——**トーストは消えるので、「消える前に押す導線」になる**
（[[toast-for-events-page-for-what-needs-fixing]]）。

## 他の表にも同じことが起きる

🚨 **一意制約を持つ表すべて**が同じ選択に直面する。ラベルだけ丁寧にして、
他が素っ気ないのは悪い形（利用者にとっては同じ操作なので）。

```
directus_files / directus_folders … 名前に一意制約が在るか【未測定】
利用者が GUI で作った表 ………… 一意列を作れるか【未測定】
```

同じ形（**別の code を割り、「ゴミ箱に在るので使えません」と言い分ける**）に揃えること。

## この決定の外側

- 🚨 **割り当て（`ohmycms_label_assignments`）には印を立てない。**
  割り当てはそれ自体を消さず、相手（ファイル／ラベル）の印で見せ方が決まる。
  読むときに join 先で外すので、**戻したときに付け直さなくてよい**。
  ＝ ゴミ箱の `sourceKind: "label_assignments"` は **実装が無いので 0 件**であって、
  異常が無いので 0 ではない。
- 🚨 **90 日後の完全削除は、この決定の対象外**（289 C）。物理削除に戻るので、
  そこでは名前も CASCADE も本来どおり動く。
  🟢 **受領表で確認: 289 →「90 日で誰が消すか」= C（定期実行の仕組みを作る）**
  （2026-08-16 回答済み。**「289 未決」と書いてあったのを直した**・design）
  🚨 **同じファイルに居た 283 / 290 も 1 件ずつ引いた**（283 A / 290 A・**どちらも本文は正しかった**）。
  **直す番号だけ引いて隣を素通りすると、同じ日に二度間違える**（実際にやった）。

## 実測の跡

```
scripts/verify-labels-authz.ts の #21
🔴 物理削除の版 … createLabel が成功してしまう（例外なし）
🟢 いまの版 …… 409 LABEL_EXISTS_TRASHED
```
