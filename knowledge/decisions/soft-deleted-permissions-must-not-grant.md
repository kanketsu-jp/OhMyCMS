---
type: decision
title: ゴミ箱に入れた権限は、許可を出さない（入り口より先に読み手を塞ぐ）
description: 権限に deleted_at を足したが、許可を出す resolvePermission がその列を見ていなかった。列を足した日と、読み手を直す日が別だったため。🚨 いま踏める人は居ない——権限を論理削除する入り口がコード上に存在しないから。踏めないのは守りが在るからではなく、入り口が無いからで、入り口ができた瞬間に踏めるようになる。だから入り口より先に読み手を塞いだ。
tags: [permissions, security, trash]
status: accepted
date: 2026-08-17
---

## 決定

**`resolvePermission` は、`deleted_at` が NULL の権限だけを見る。**

```ts
// lib/permissions/resolve.ts
const rows = await db<PermissionRow>("directus_permissions")
  .select("permissions", "fields")
  .whereIn("policy", policyIds)
  .where("collection", collection)
  .where("action", action)
  .whereNull("deleted_at");   // 🚨 これ
```

## なぜ

`20260817020000` で `directus_permissions` に `deleted_at` が入った（設問 300・(a)）。
**列は入ったが、許可を出す側はその列を見ていなかった。**

発見は storage（**権限の持ち主ではない人**）。原文:

> 「🚨 **ゴミ箱に入れた権限は、まだ効いています**
>   ＝ 管理者から見ると**消したつもり**／実際は**許可が生きている**」

## 🚨 いま踏める人は居ない。だが「安全」ではない

**測ったこと（2026-08-17・コードのみ）:**

| 問い | 実測 |
|---|---|
| `directus_permissions` を引く追跡済み `.ts/.tsx` | **10 本** |
| うち `deleted_at` を見ないもの | **4 本**（`resolve.ts` / `permissions-api.ts` / `reports/service.ts` / `verify-reports-http.ts`） |
| 権限を**論理削除する経路** | 🚨 **0 件**（`deletePermission` は `.delete()`＝**物理削除**） |
| `lib/trash/service.ts` が扱う表 | collections / folders / relations / files / activity（**権限は無い**） |
| `trash-manager.tsx` | 🚨 **`directus_permissions` を `system_table` として明示的に除外** |
| 共有 DB の論理削除済み権限 | **0 件**（読み取りのみで確認） |

🟢 対照: `directus_permissions` を `update` する箇所 **0 件** ／ 同じ引き方で `delete` **9 件**
（＝ この探し方は「在り」も出せる）。出鱈目な表名で同じ数え方 **0 本**。

🚨 **したがって「いま 0 件」は「異常が無い 0」ではない。「まだ誰も入れられない 0」である。**
**踏めないのは守りが在るからではなく、入り口が無いから。**
**入り口ができた瞬間に踏めるようになる**ので、**入り口より先にここを塞いだ**。

🚨 **`trash-manager` の除外が、事実上の入り口の蓋になっている。**
その蓋を外すかは board の設問（堀池さん待ち）。**この決定が入っていれば、どちらを選ばれても安全。**

## どう確かめたか

**使い捨ての Postgres（`:5438`）で RED→GREEN。🚨 共有 DB には 1 行も書いていない。**

```
投入 … 生きている権限 1 行 ＋ 論理削除済み 1 行
🔴 RED（直す前の SQL）…… posts, secrets   ← 🚨 消したはずの secrets が出る
🟢 GREEN（whereNull 追加）… posts          ← 🟢 生きている側は残る（塞ぎすぎていない）
🟢 対照(-) 存在しないポリシー … 0 行（＝ この問いは 0 も出せる）
```

🚨 **`:5437` は使わなかった。** `acceptance/checks/v1-e-first-run.mjs:39` が
「**同時に 2 本走らせられない（:3110 / :5437 / コンテナ名が固定）**」と書いているため。

🚨 **`pg_isready` を待ち条件にすると空振りする。** 実測: `pg_isready` が OK を返した直後に
`database "cms" does not exist` → `the database system is shutting down`（**初期化の途中だった**）。
**本物のクエリ（`select 1`）が通るまで待つこと。**

## 🚨 まだ塞いでいないもの（**落とさない**）

- **`lib/admin/permissions-api.ts`** … 一覧・更新。`deleted_at` **0 箇所**
  🚨 **「一覧に出るか」と「許可を出すか」は別の問い**。ここは**許可を出さない**ので、この決定の範囲外
- **`lib/reports/service.ts`** / **`scripts/verify-reports-http.ts`** … **0 箇所**（**未確認**）
- 🚨 **`directus_policies` / `directus_access` / `directus_roles`** … `deleted_at` を見るファイル **0 本**
  （shell の実測）。**そもそも列が無い**ので、いまは問題にならない
- 🚨 **読み手を 1 箇所に集めていない**（schema の提案）。利用者の表は `itemsTable` で入口を 1 本にしたが、
  **システム表は別経路**（`user-tables-have-one-entrance` にそう書いてある）。
  **次に読み手を足す人が、また漏らす形は残っている**

## 関連

- `knowledge/decisions/guards-keyed-by-name-break-silently.md`（守りが黙って効かなくなる形）
- `knowledge/decisions/user-tables-have-one-entrance.md`（利用者の表は入口 1 本。**システム表は別経路**）
- `knowledge/decisions/checks-must-declare-blind-spots.md`（見ていない範囲を書く）
