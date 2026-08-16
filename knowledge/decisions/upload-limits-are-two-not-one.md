---
type: decision
title: アップロードの上限は 2 つある。同じ文言で語らない
description: アプリが決めた上限と、要求の本文を読み切れる上限（Next の proxyClientMaxBodySize・既定 10MB）は別物で、後者のほうが小さかったため 50MB の判定へ一度も到達していなかった。上限は lib/files/upload-limit.ts の 1 箇所から両方へ配り、初期値 20MB・OHMYCMS_MAX_UPLOAD_MB で変更可にした。読み取り失敗の文言には数字を書かない。
tags: [files, architecture, i18n]
status: active
generated:
  by: storage
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/lib/files/upload-limit.ts"
  - resource: "repo://apps/studio/app/api/files/route.ts"
  - resource: "repo://apps/studio/next.config.ts"
---

## 決定

1. **上限は `lib/files/upload-limit.ts` の 1 箇所から配る。**
   そこから **アプリの判定**（`lib/files/service.ts`）と
   **Next の受け口**（`next.config.ts` の `experimental.proxyClientMaxBodySize`）の**両方**へ渡す。
   🚨 **数字を 2 箇所に書かない。** 片方だけ直すと**通す門と落とす門が食い違う**。

2. **初期値 20MB。`OHMYCMS_MAX_UPLOAD_MB` で変えられる。**
   由来: 堀池さん 296「**これは nextjs やサーバーの問題だと思うので見直して
   設定できるようにして。初期値は 20MB**」（2026-08-16）。

3. **受け口の上限は、アプリの上限より 1MB 大きくする。**
   🚨 同じ値にすると、**上限ちょうどのファイルが受け口で落ちて「大きすぎます」を出せない**
   （多重部分の飾りが本文に上乗せされるため）。

4. **失敗は 2 つに分けて返す。**
```
① アプリの上限を超えた   → 413 FILE_TOO_LARGE「ファイルサイズは N MB 以下にしてください」
   🚨 本文を読む前に content-length で弾く。
   🚨 比べる相手は「**本文の上限**」（＝受け口の値）。「ファイルの上限」と比べると、
      **ちょうど上限のファイルが弾かれて嘘になる**（実測で踏んだ）。
② 本文そのものを読み切れなかった → 413 UPLOAD_BODY_UNREADABLE
   🚨 **数字を書かない。** 大きさ以外の理由でも落ちうるので、
      「N MB 以下に」と言い切ると嘘になる場合がある。
```

## なぜ（2026-08-16 の実測）

### 上限の判定に、一度も到達していなかった

```
50MB 超を送る → 🚨 HTTP 500 / INTERNAL_ERROR
サーバのログ: [api] 未処理の例外: "TypeError: Failed to parse body as FormData."
＝ request.formData() が先に落ち、service.ts の判定へ届いていない
```
🚨 **書いてあるのに、画面へ出たことが一度も無い文言だった。**
利用者に出ていたのは「サーバ内部でエラーが発生しました」で、
**自分が悪いのか、こちらが壊れたのかを区別できない。**

### 🚨 詰まっていたのは Next の受け口だった

```
実測 1 / 5 / 6 / 7 / 8 / 9MB → 🟢 201
     9.996 / 10 / 20 / 40 / 49MB → 🚨 500
＝ 9MB と 10MB のあいだで落ちる

出どころ `experimental.proxyClientMaxBodySize` の既定 **10,485,760 ＝ ちょうど 10MB**
（node_modules/next の config-shared.js。**実測の境目と一致した**）
🚨 `proxy.ts` が在るので、この上限が要求の入口で効く。
🟢 対照 `proxy.ts` は本文に触れていない（実測 0 件）＝ proxy.ts のコードが原因ではない
```

### 全段の実値（**直す前**）

```
① アプリの検証        50MB（lib/files/service.ts / lib/drive/import.ts）
② Next の受け口       10MB ← 🚨 **ここで詰まっていた**
③ Traefik（Dokploy）  🚨 **未測定**（compose に「Traefik ラベルは手書きしない。
                      Dokploy が管理する」と在り、リポジトリからは分からない）
④ S3 / R2            単発 PUT のみ（multipart 0 件）＝ 20MB では効かない
```

## 測り方（RED / GREEN）

```
🟢 12MB → 201（直す前は UPLOAD_BODY_UNREADABLE で落ちていた境目）
🟢 21MB → 413 FILE_TOO_LARGE「20MB以下にしてください」（受け口を上げても、アプリ側で落ちる）
🟢 対照 5MB → 201

境目（**1 バイトで反転**）:
🟢 20,971,520 バイト（ちょうど 20MB）→ 201
🚨 20,971,521 バイト（+1 バイト）    → 413
```

## この決定が答えないこと

- 🚨 **本番の前段（Dokploy の Traefik）は未測定。**
  compose からは上限が分からない。**本番で 20MB が通るかは別の話。**
- 🚨 **本番ビルド（:3101）でも未測定。** `dev-login` が本番に無く、セッションを作れない。

## やらないこと

- ❌ ②の文言に上限の数字を書く（大きさ以外の理由でも起きる）
- ❌ 上限の数字を `service.ts` や `next.config.ts` に直書きする（食い違う）
- ❌ `content-length` を「ファイルの上限」と比べる（**ちょうど上限のファイルが弾かれる**）
- ❌ 本文を読んでから大きさを判定する（読めないから落ちている）

## 経緯（**消さない**）

🚨 この文書は当初「**アプリは 50MB、受け口は 9MB 台**」と書き、
「**10〜50MB のファイルをどうするかは決まっていない**」で終わっていた。
**296 の回答（A・初期値 20MB・設定できるように）で決着したので書き換えた。**
🚨 **「9MB 台」も、当時は境目を刻んだだけで出どころが分かっていなかった。**
`proxyClientMaxBodySize` の既定を読んで、**実測の境目と一致すること**まで確かめたのは後。

## 関連

- [保管先のキー設計を固定する](./storage-key-prefix-is-fixed.md)
- [保管先の安全装置は「実装が実際に使う値」で判定する](./storage-guard-uses-effective-config.md)
