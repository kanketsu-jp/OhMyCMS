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

### 🚨 なぜ「嘘の ready」が出るか（機構・shell が特定）

公式 image の `docker-entrypoint.sh` の `docker_temp_server_start()` は
`-c listen_addresses=''` で一時サーバを起こす（原文コメント: *does not listen on external TCP/IP*）。
**つまり初期化中のサーバは unix socket にしか出ない。**

- 🚨 **`docker exec` で叩くと、その一時サーバが見える** → `pg_isready` は ready と言う
- 🟢 host の TCP からは見えない
- ＝ **「ready」という名前の道具が、`docker exec` では別のサーバを見ている**

窓の長さ（shell の実測・`postgres:17-alpine`・各 5 回・コンテナのログの時刻で計測）:

| 条件 | 窓の中央値 |
|---|---|
| `POSTGRES_DB` あり | **0.159 秒**（範囲 0.157〜0.169） |
| `POSTGRES_DB` なし | **0.115 秒**（範囲 0.099〜0.123） |

**範囲が重ならない。差は約 +0.044 秒（+38%）**で、ログの並びから
**`CREATE DATABASE` がその窓の中に在る**（＝ `POSTGRES_DB` を指定すると段が 1 つ増える）。

🚨 **この機構が説明するのは「窓の側」だけ**（shell が自分で射程を狭めた）。
**「叩く側がその窓に入るか」は競走**で、**そちらは誰も測っていない**。
実際 schema の機械では、**同じ形が 20 分の間に 3/3 通る → 3/3 落ちる へ反転した**。

🚨 **したがって「うちでは通る」は根拠にならない。**
観測（何回通った／落ちた）は**その時刻のもの**で、**機構だけが時刻に依存しない。**

- ✅ **`pg_isready` を `docker exec` から叩かない**
- ✅ **本物のクエリが通るまで待つ**（回数を増やしても、見る対象が同じなら意味がない）
- 🚨 **その「本物のクエリ」は、これから使う DB へ投げること**（下記）

### 🚨 「本物のクエリ」だけでは足りない — 宛先の DB で結果が変わる

**一時サーバにも `postgres`（既定 DB）は在る**（`initdb` が作る）。
だから **`psql -d postgres -c 'select 1'` は窓の中でも通る**。

実測（窓の中＝ `docker exec` の `pg_isready` が ok と言った瞬間）:

| 宛先 | 窓の中 | 待ち切った後 |
|---|---|---|
| `-d cms`（**これから使う DB**） | 🟢 **落ちる**（＝ 窓を捕まえる） | 🟢 通る |
| `-d postgres`（既定 DB） | 🚨 **通る**（＝ **窓をすり抜ける**） | 🟢 通る |

🚨 **`POSTGRES_DB` で作らせた DB は、窓の中にはまだ無い**（`CREATE DATABASE` が窓の中に在るため）。
**だから宛先をそこにすると窓を捕まえられる。既定 DB にすると捕まえられない。**

- ✅ **待ち条件は `psql -h 127.0.0.1 -d <これから使う DB> -c 'select 1'`**
- 🚨 **`-d postgres` で待つと、`pg_isready` と同じだけ嘘をつく**（**クエリにしただけでは直らない**）
- 🚨 **`-h 127.0.0.1` を落とさない**（下記）

### 🚨 宛先の DB だけでも足りない — unix socket なら通ってしまう

一時サーバは **unix socket には出ている**。だから `docker exec` の `psql` は
（既定で unix socket を使うので）**窓の中でも一時サーバに当たる**。

実測（窓の中）:

| 叩き方 | 結果 |
|---|---|
| `psql -U cms -d postgres`（unix） | 🚨 **通る**（＝ すり抜け） |
| `psql -h 127.0.0.1 -U cms -d postgres`（TCP） | 🟢 **落ちる**（＝ TCP には出ていない） |

shell の測定（4 回・陽性対照つき）では、
**unix の `psql -d postgres -c 'select 1'` が 4 回中 2 回、一時サーバに当たって「通った」と答えた**。
`-d cms` でも 1 回通っている（**`CREATE DATABASE` の後・停止の前**の窓）。

🚨 **したがって守りは 2 つ要る。片方だけでは塞がらない。**

1. **宛先を「これから使う DB」にする**（`CREATE DATABASE` より前を捕まえる）
2. **`-h 127.0.0.1` で TCP から叩く**（`listen_addresses=''` の一時サーバを構造的に外す）

🟢 **2 は確率ではなく構造**（一時サーバは TCP に出られない）。
🟢 陽性対照: 本物のサーバなら `-h 127.0.0.1` でも通る（＝ この条件は 0 も 1 も出せる）。

（経緯: auth が「クエリにすれば直る」と書き、shell が「宛先」を問い、auth が測って宛先を足し、
shell が計器を直して「宛先だけでも足りない」を出し、auth が再測して `-h` を足した。
🚨 **3 回書き直している。1 回で正しく書けていない。**）

（この穴は shell が「schema の直しは窓を塞いだのか」と問い、auth が測って確認した。
🚨 **`select 1` が通る＝準備完了、と書いた最初の版は不十分だった。**）

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
