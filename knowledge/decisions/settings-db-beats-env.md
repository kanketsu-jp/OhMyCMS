---
type: decision
title: 設定は DB が正。env は初期値でしかない
description: env に正しい値を渡しても、DB のその列に値が入っていれば DB が勝つ。実測では compose の S3_FORCE_PATH_STYLE=true が DB の 'false' に負け、virtual-host 形式で存在しないホストを引きに行って 502 になった。env を読むかぎり設定は正しく見えるので、env だけを見ていると原因に辿り着けない。設定の値を疑うときは env ではなく DB を引く。
tags: [architecture, ops, files]
status: active
generated:
  by: storage
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://apps/studio/lib/settings/service.ts"
  - resource: "repo://apps/studio/lib/storage/index.ts"
  - resource: "repo://acceptance/compose.acceptance.yml"
---

## 決定

1. **設定の正本は DB（`ohmycms_settings`）。`env` は「初期値」でしかない。**
   `lib/settings/service.ts` の `fromEnvironment()` は **DB に値が無いときだけ**効く。
   🚨 **DB に値が入っていれば、env に何を渡しても無視される。**

2. **設定の値を疑うときは、env ではなく DB を引く。**
   ```
   docker exec ohmycms-db psql -U cms -d cms -c "select * from ohmycms_settings"
   ```
   🚨 **`docker inspect` の env を見ても、そこは正しい**。だから env だけ見ると永久に分からない。

3. **台（受入・検証環境）を作る手順には、DB を書く行を必ず入れる。**
   env を渡すだけの手順は、**DB が空の環境でしか動かない**。

## なぜ（2026-08-17 の実測）

### 症状

```
POST /api/files → 502 STORAGE_ERROR
   本文 …「ストレージへの接続に失敗しました (Error code=ENOTFOUND)」
```

🚨 **台は全部無罪だった**（design と storage が別々に測った）:

```
🟢 MinIO 到達 200 ／ SDK import OK ／ HeadBucket 200 ／ ListObjects 200
🟢 素の node から PutObject 200（同じコンテナ・同じ env・同じ Buffer + ContentType）
🟢 コンテナ内のソースは HEAD と md5 一致（＝ 古いビルドではない）
🚨 Next 経由だけが 502
```

### 原因

```
【引いた】lib/storage/index.ts … forcePathStyle: settings.s3_force_path_style === "true"
【測った】DB の ohmycms_settings.s3_force_path_style … 🚨 'false'
【引いた】lib/settings/service.ts … env は初期値。DB に値が在れば DB が勝つ
＝ 🚨 compose の S3_FORCE_PATH_STYLE=true は無視されていた
```

`forcePathStyle` が false だと SDK は **virtual-host 形式**（`<bucket>.<host>`）を使う。

```
【測った】ohmycms.minio … ENOTFOUND
🟢 対照   minio       … OK 172.28.0.4
```

`update ohmycms_settings set s3_force_path_style='true'` → **同じビルドのまま 201 / storage=s3**。

## 🚨 いちばん危ないのは「別の理由で直ったように見える」こと

同じ日、**ビルドを焼き直した直後に成功したので「ビルドが壊れていた」と読まれかけた**。
時刻で割ると、そうではなかった:

```
19:33:34Z 焼き直し（この版でのみ出せる code= が本文に在る）
🚨 19:33:50Z 同じ焼きで **502**（＝ 焼き直しでは直っていない）
19:34:5xZ  DB を 1 列変える
🟢 19:34:52Z **201** ／ 19:36:3xZ 受入の 6 件も 201
```

🚨 **「焼き直しで消える」と記録していたら、次の人は「もう 1 回焼こう」で終わる。**
**DB の 1 列は誰も見ない。そして同じ 502 が出続ける。**

## やらないこと

- ❌ 設定が効かないときに **env だけ**を確かめる（DB が勝つので、env は常に正しく見える）
- ❌ 台の手順を **env を渡す行だけ**で書く（DB が空の環境でしか動かない）
- ❌ 「焼き直したら直った」を原因として記録する（**時刻で割る**）
- ❌ 🚨 **直した設定を「後始末」として元へ戻す**（下の「戻さない」を読むこと）

## 🚨 直した値は戻さない（2026-08-17・司令塔の判断）

**この開発用 DB では `s3_force_path_style` は `'true'` が正しい値。**

```
・この DB が向いている先は **MinIO**
・**MinIO は path-style が要る** ＝ `'true'` でなければ動かない（実測: `'false'` で ENOTFOUND）
・`'false'` だったのは **誰かが選んだ値ではなく、初期値が入ったまま**だった
   （env の `S3_FORCE_PATH_STYLE=true` が DB に負けていた）
```

🚨 **だから `'false'` へ戻すのは「後始末」ではなく「地雷を埋め直すこと」。**
戻した瞬間に V1-B はまた BLOCKED になり、**次の人が同じ切り分けを最初からやる**
（今日は 3 人がかりで、その 1 列に辿り着いた）。

🚨 **値の隣に理由を残すこと。** 残さないと、次の人が
「初期値に戻っていないな」と思って `'false'` にする。

- ✅ 例外: **BLOCKED の枝を測りたいときだけ**、予告して **1 回戻す** → 測る →
  🚨 **必ず `'true'` へ直し、前後を値で出す**（「戻しました」だけにしない）

## この決定が答えないこと

- 🚨 **なぜ DB に `'false'` が入っていたのかは分かっていない**（初期値として書かれたのか、
  誰かが GUI で保存したのか。**追っていない**）。
- 🚨 **他の設定項目で同じことが起きるか**は測っていない（`s3_force_path_style` で 1 回起きた、まで）。

## 関連

- [保管先の安全装置は「実装が実際に使う値」で判定する](./storage-guard-uses-effective-config.md)
- [保管先のキー設計を固定する](./storage-key-prefix-is-fixed.md)
- [秘密の置き場所は「復元可能性」で決める](./secrets-storage-by-recoverability.md)
