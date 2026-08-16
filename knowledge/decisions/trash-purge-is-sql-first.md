---
type: decision
title: 90 日の掃除は SQL が正本。TypeScript は薄い口で、ファイルだけが例外
description: pg_cron は TypeScript を呼べないので、規則を TS に置くと同じ規則が 2 箇所になる。保持日数・対象表の導出・除外・走行記録はすべて SQL 関数 1 つに置き、TS は呼ぶだけにした。ただし directus_files だけは SQL から実体を消せないので除外し、TS 側（実体 → 行の順）で消す。
tags: [trash, files, schema, ops]
status: active
generated:
  by: agent
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/lib/db/migrations/20260817040000_create_purge_trash_function.ts"
  - resource: "repo://apps/studio/lib/trash/purge.ts"
  - resource: "repo://apps/studio/lib/trash/purge-files.ts"
  - resource: "repo://apps/studio/scripts/verify-trash-purge.ts"
stale_after: 2027-02-16
x_rag_okf:
  id: decisions/trash-purge-is-sql-first
  authorship: agent
---

# 90 日の掃除は SQL が正本。TypeScript は薄い口で、ファイルだけが例外

## 決定

1. **正本は SQL 関数**（`ohmycms_purge_trash()`）。保持日数・対象表の導出・除外・走行の記録を、
   **すべてそこに 1 つだけ**置く。TypeScript（`lib/trash/purge.ts`）は**呼ぶだけ**。
2. **対象の一覧をコードに書かない。** `information_schema` から「`deleted_at` を持つ表」を実行時に引く。
3. **除外は「消してはいけない側」だけ**を、理由つきで SQL に書く。
4. **`directus_files` は例外**。SQL では実体を消せないので除外し、**TypeScript 側**で
   `deleteStoredObjects(id)` → 行、の順に消す。

関連: [[deleting-a-file-is-two-deletes]]（順番は「実体 → 行」）／
[[trash-and-restore-ui]]（ゴミ箱の画面）／[[soft-deleted-names-stay-taken]]（名前を空けない）

## なぜ SQL が正本か

掃除は **`pg_cron` が呼ぶ**。cron は TypeScript を呼べないので、規則を TS に置くと
**同じ規則が 2 箇所**になる（正本と写しが別々に腐る）。
＝ **1 箇所に書いて、2 つの口から呼ぶ**。TS 側の口は「アプリから手で走らせたいとき」用。

🚨 **走行の記録も SQL の中でやる。** 記録が TS 側に在ると、
**cron から走ったときだけ記録が残らない**（＝「まだ 1 度も走っていない」と同じ顔になる）。

🚨 **保持日数（90）も SQL が正本**（`ohmycms_trash_retention_days()`）。
画面の「あと何日」も `retention_days` もそこを読む。別々に持つと、
**掃除が消したあとも画面が「あと N 日」と言う**ずれ方をする。

## なぜ対象の一覧を書かないか

一覧をコードに書くと、**`deleted_at` を足した人が掃除の一覧を直し忘れたときに黙って掃除されない**。
実行時に引けば、**足し忘れが構造的に起きない**。

その代わり「**列は在るが消してはいけない表**」を分けられないので、除外リストが要る。3 つの条件:

1. **1 件ごとに理由を書く**（名前だけ並べない）
2. **空でも黙らない**（戻り値の `skipped` が毎回出る。**空の除外は「全部消す」**なので）
3. **除外に書いた表が実際に `deleted_at` を持つか**を毎回見て、`rotten_skips` として返す

🚨 最初は `directus_activity`（監査）を除外に入れたが**外した**。
【測った】その表は `deleted_at` を持たないので**対象候補に入らない**＝ 除外に書いても意味が無く、
**初日から条件 3 に当たっていた**。**将来のために名前を置くと、警告が鳴りっぱなしになって読まれなくなる。**

## ファイルだけが例外（storage の指摘・2026-08-16）

【測った】`deleted_at` を持つ表 **19 個**に `directus_files` が入っている。
**SQL からは storage（local FS / S3 / R2）に手が届かない**ので、
`ohmycms_trash_purge_skip()` に**理由つきで**入れ、ファイルは `purgeExpiredFiles()`（TS）が消す。

🚨 **順番と、その理由（なぜ行を先に消すと戻せなくなるか）は
[[deleting-a-file-is-two-deletes]] に在る。ここには書き写さない**
——**2 箇所に書くと、片方だけ直って腐る**（storage の指摘）。

**「ファイルは掃除しない」ではなく「SQL では掃除できない」。**
🚨 **除外の理由に「なぜ SQL では書けないか」を書く。** 書かないと、次の人が調べ直す。

## 落ちたときは、例外を再送出しない（意図した形）

再送出すると**トランザクションごと巻き戻り、記録も消える**（＝ 黙って失敗する）。
**途中まで消した分は確定する**が、**何が起きたかは `error` に残る**ほうを採った。

## 実測（2026-08-16・使い捨ての postgres）

受入は **pg_cron が呼ぶのと同じもの（SQL 関数）を直接呼ぶ**。
TS 経由で測っても、**薄い口を測っているだけ**で cron の振る舞いを見ていない。

- **OK 22 / NG 0**。走らせる前に「記録 0 件」／🔴 90 日超は消える／🟢 90 日以内は残る／
  🟢 論理削除でない行は残る／🔴 **あとから足した表も自動で対象**／
  🔴 `directus_files` の行は**消えない**（🟢 対照 **同じ走行で** zz の 90 日超は消える）／
  2 回目は 0 件でも**記録は 2 件**／除外の表を落とすと `rotten_skips` が鳴る
- 🟢 対照 **薄い口からも同じ形が返る**（口が 2 つとも生きている）
- 判定はすべて **id**。共有 DB のポート（5436）を渡すと exit 2 で止まる
- 🔴 壊して赤も測った: 保持日数を 3650 へ／**除外の照合を外す**／**対象の導出を 1 表に固定**／
  **除外リストを空にする** の 4 通り。🟢 対照 壊さなければ 22/22 緑
- up → down → up が 1:1（表 32 → 2 → 32）

## 🚨 まだ決まっていないもの

- **`error` が入った記録を、誰がどこで見るか**（画面かログか）。
  🚨 **記録に残るだけでは誰も見ない。**「前回の掃除は失敗しています」が見える形が要る
- **`ohmycms_label_assignments` を掃除してよいか**（対象候補 19 表のうちの 1 つ）。
  割り当ては「それ自体を消さない」設計なので、**toast の判断**。**まだ聞いていない**
- **`purgeExpiredFiles()` を誰が定期的に呼ぶか**。TS 側なので `pg_cron` からは呼べない。
  🚨 **いまは口が在るだけで、1 度も通っていない**（storage の実測: 関数が DB に無いので呼べない）
- **`cron.schedule` はまだ入れていない**（許可制）。`create extension pg_cron` も未実行で、
  **この postgres の image に pg_cron が在るかも確かめていない**

## 出典

2026-08-16。設問300 の束（ゴミ箱の 90 日）。司令塔の判断で (ii)（実行時に引く）＋ 除外リスト、
のちに (a)（正本を SQL へ）。`directus_files` の例外は storage の指摘による。
