---
type: decision
title: ファイルの削除は 2 回消す。順番は「実体 → 行」
description: 行を消す前に保管先の実体を消す。逆にすると key を持つ行が先に消えて、二度と辿れない孤児になる。実体を消すのは完全削除と 90 日の掃除だけで、ソフト削除では消さない（消すと一覧には戻るのに開けない）。判定は lib/files の deleteStoredObjects 1 箇所に置き、掃除も lib/trash 側へ置く（lib/files だと循環する）。知っているキーは分岐に置かず必ず消す（deletePrefix が在る側だけ通すと、local / s3 は両方持つので反対側が一度も通らない）。既存の孤児 25 件の扱いは未決で、孤児を検出する仕組みも無い。
tags: [files, architecture, permissions]
status: active
generated:
  by: storage
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/lib/files/service.ts"
  - resource: "repo://apps/studio/lib/trash/service.ts"
  - resource: "repo://apps/studio/lib/storage/driver.ts"
---

## 決定

1. **ファイルを消すときは 2 回消す。** **行**（`directus_files`）と、**保管先の実体**（バイト）。
   🚨 **順番は「実体 → 行」。** 逆にすると、実体の削除に失敗したときに
   **キーを持つ行がもう無い**ので、**二度と辿り着けない孤児**になる。

2. **実体を消す判定は `lib/files/service.ts` の `deleteStoredObjects(fileId)` 1 箇所。**
   ゴミ箱の「完全に削除」も、90 日の掃除も、**この関数を呼ぶだけ**にする。
   🚨 **キーの組み立てを外へ出さない**（`compressed_key` を外へ出さずに済む唯一の形）。

3. **知っているキーは、分岐に置かず必ず消す。**
   `filename_disk` と `compressed_key` を毎回消し、そのあと `deletePrefix?.()` で
   取りこぼしと空のディレクトリを拾う。
   🚨 **`deletePrefix` が在る側だけを通す形にしない**（下の「なぜ」参照）。

4. **掃除（90 日）は `lib/trash/` に置く。** `lib/files/` に置かない。
   🚨 保持日数は `lib/trash/service.ts` に在るので、`lib/files` から読むと
   **`files → trash` と `trash → files` で循環する**（`lib/files/live.ts` を
   第 3 の場所へ出したのと同じ形）。**向きを 1 方向に保つ。**

5. **消せなかったら、消したことにしない。**
   保管先が設定されていない行は `503 STORAGE_UNAVAILABLE` を投げ、**行を残す**。

6. **ソフト削除では実体を消さない**（[ゴミ箱と復元の画面](./trash-and-restore-ui.md)）。
   消すと「一覧には戻るのに開けない」になる。**消すのは ①完全削除 ②90 日の掃除だけ。**

## なぜ（2026-08-16 の実測）

### 「完全に削除しました」が嘘だった

```
lib/trash の permanentlyDeleteTrashItem … 行だけ delete()
  storage を含む行 … 🚨 0 件（🟢 対照 同ファイルの import は 9 行＝読めている）

本番コードで実体を消す呼び出し（lib/storage 自身と scripts を除く）
  deletePrefix …… 🚨 0 件
  storage.delete … 1 件だけ＝**アップロード失敗時の巻き戻し**（削除の経路ではない）
  🟢 対照(+) 同じ探し方で put/get 系は 5 件（＝探し方は動いている）
```
🚨 **画面には「完全に削除しました。この操作は元に戻せません。」と出ていた。**
実際は行が消えて実体が残り、key は `<id>/<filename>` なので**もう誰も辿り着けない**。

🚨 **これは「まだ起きていない」欠陥だった**（ゴミ箱の行が files 0 / folders 0 / labels 0 ＝
新しい経路は一度も通っていない）。**ただし同じ形の孤児は実在した**——
開発 DB で **実体 48 id / 行 23 id ／ 孤児 25 件・104 KB**（🟢 対照 一致 23 件）。
🚨 **孤児 25 件は全部 08-13 ＝ 物理削除の時代の残骸**で、**新しい経路の証拠ではない。**

### 🚨 「`deletePrefix` が在ればそれだけ」は、測れない分岐を作る

最初はそう書いた。しかし **local / s3 は両方 `deletePrefix` を持つ**ので、
**1 つずつ消す側が一度も通らない**——**「壊れていない」ではなく「測れていない」**。
→ **知っているキーを毎回消す形に変えた**（消す回数より、測れることを採る）。
どちらの `delete` も**無いキーで落ちない**（local は `force: true` / S3 は 204）。

## 測り方（RED / GREEN）

```
🔴 消す前 …… 元=在る 圧縮=在る 迷子=在る 箱=在る
🟢 消した後 … 元=無い 圧縮=無い 迷子=無い 箱=無い
🟢 対照(-) 行が無い id …… 投げずに戻る（孤児は消せない＝仕様）
🟢 対照(+) 保管先が未設定 … STORAGE_UNAVAILABLE を投げ、**実体は消えない**
```

🚨 **これだけでは「鍵の輪が回った」と言えない。**
`${id}/` の下に在るものは **`deletePrefix` でも消える**ので、**同じ絵になる**。

```
→ 実体を `${id}/` の**外**（`zz-outside-prefix/probe.txt`）に置いた行で試す
   `deletePrefix(`${id}/`)` では**消せない場所**なのに … 🟢 **消えた**
   ＝ **1 つずつ消す側が確かに通っている**
```

## やらないこと

- ❌ 行を先に消す（**孤児になり、二度と消せない**）
- ❌ ソフト削除で実体を消す（戻したときに開けない）
- ❌ 実体を消す判定を 2 箇所に書く（ゴミ箱と掃除で食い違う）
- ❌ `lib/files/purge.ts` を作る（**循環する**。掃除は `lib/trash/`）
- ❌ 消せなかったのに成功として返す
- ❌ 既存の孤児を、持ち主を確かめずに消す
  （[検証用に見えるデータを、名乗りが無いという理由で消さない](./permanent-fixtures-are-not-junk.md)）

## この決定が答えないこと

- 🚨 **既存の孤児 25 件をどうするか**は決めていない（持ち主の確認が先）。
- 🚨 **孤児を検出する仕組みは無い**。いま数えられるのは、`.storage` の一覧と
  `directus_files` を**手で突き合わせたときだけ**。

## 関連

- [ゴミ箱と復元の画面](./trash-and-restore-ui.md)
- [ゴミ箱に在るものの名前は、空けない](./soft-deleted-names-stay-taken.md)
- [保管先のキー設計を固定する](./storage-key-prefix-is-fixed.md)
- [保管先の安全装置は「実装が実際に使う値」で判定する](./storage-guard-uses-effective-config.md)
