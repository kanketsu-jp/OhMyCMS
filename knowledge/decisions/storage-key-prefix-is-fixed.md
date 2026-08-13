---
type: decision
title: 保管先のキー設計を固定する（接頭辞は後から変えない）
description: DB には接頭辞なしのキーを保存し、S3_KEY_PREFIX はドライバ内でだけ前に付ける。空なら従来と完全に同じキーになるので移行が要らないが、後から変えると既存ファイルが迷子になる。
tags: [architecture, files, ops]
status: active
generated:
  by: rag-okf
  at: 2026-08-14
verified: []
sources:
  - resource: "repo://apps/studio/lib/storage/s3.ts"
  - resource: "repo://apps/studio/lib/files/service.ts"
  - resource: "repo://.env.example"
stale_after: 2027-02-14
x_rag_okf:
  id: decisions/storage-key-prefix-is-fixed
  authorship: agent
---

# 保管先のキー設計を固定する（接頭辞は後から変えない）

## 決定

ファイルの保管キーを次で固定する。**一度決めたら変えない。**

```
<uuid>/<ファイル名>                     元のファイル
<uuid>/transformed/<hash>.<ext>        変換したもの（?width= などのキャッシュ）
```

`S3_KEY_PREFIX` を設定した場合、この前に `<接頭辞>/` が付く。
🚨 **接頭辞はドライバの中だけで付ける。DB（`directus_files.filename_disk`）には接頭辞なしのキーを保存する。**

## なぜ

- **空なら従来のキーと1バイトも変わらない** ので、既に運用しているところで移行が要らない。
  これが「ドライバ内で付ける」を選んだ決め手。
- 1つのバケットを本番と検証で共有するとき、接頭辞だけで住み分けられる。

## 🚨 変えるとどうなるか

**既存のファイルが全部見つからなくなる。** DB のキーは接頭辞を含まないので、
読むときに「今の接頭辞」を前に付けて探す。接頭辞を後から変えると、
**前の接頭辞で置いたファイルを誰も探しに行かない**。

削除も同じで、消したつもりのファイルが残り続ける。

## 関連する決定

- 読み出しは **保存したときの保管先**（`directus_files.storage`）で行う。
  今の設定で読むと、ローカル運用のまま後から S3 を設定した瞬間に過去のファイルが全部読めなくなる。
  → [[storage-driver-is-per-row]]（未執筆）
- 配信は `/api/assets/<id>` を通す（署名付き URL を出さない）。
  → [[no-presigned-urls]]（未執筆）

## 出典

2026-08-13。v1-B（ストレージを GCP / Cloudflare 対応にする）の設計時に、
司令塔と storage 担当で確定。「最初に決めて固定、変えない」。
