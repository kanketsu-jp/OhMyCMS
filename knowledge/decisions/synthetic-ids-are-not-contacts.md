---
type: decision
title: 合成 ID は画面に出さない
description: "directus_users.email が NOT NULL のために入れている合成 ID（local-admin@localhost / <uuid>@saml.invalid）は利用者の連絡先ではないので画面に出さない。ただし人でない起動用ユーザーと本物の利用者は同じ扱いにしない。"
tags: [permissions, security, ui, apps-studio]
status: stable
generated:
  by: "rag-okf:mcp"
  at: "2026-08-15T11:47:10.307Z"
verified: []
sources:
  - resource: "repo://apps/studio/lib/admin/user-label.ts"
  - resource: "repo://apps/studio/lib/settings/local-admin.ts"
  - resource: "repo://apps/studio/lib/auth/saml/placeholder-email.ts"
  - resource: "repo://apps/studio/scripts/check-user-label-leak.mjs"
x_rag_okf:
  id: decisions/synthetic-ids-are-not-contacts
  source_commit: be350fa
  source_digest: "sha256:32e3b603204896fa117e47c9c5757114254f14d42a2d459d9d5883439b5e3f55"
  authorship: agent
---

# 合成 ID は画面に出さない

## 背景

`directus_users.email` は NOT NULL + unique 制約があるため、メールを持たない主体にも値を
入れる必要がある。いま2種類の**合成 ID**（器を埋めるためだけの値で、誰かの連絡先ではない）が
存在する:

- `local-admin@localhost`（`lib/settings/local-admin.ts`）: セッションの持ち主として持つ、
  起動用の内部専用ユーザー。**人ではない。**
- `<uuid>@saml.invalid`（`lib/auth/saml/placeholder-email.ts`）: メールを送ってこない IdP の
  ために `verify.ts` が合成するアドレス。**本物の利用者だが、メールだけが埋め草。**

## 決定

> 基準日: 2026-08-15

合成 ID は利用者の連絡先ではないので画面に出さない。ただし**2つを同じ扱いにしない**:

- `local-admin@localhost` → **行ごと**出さない（名前・画像・絵文字も含めて）。`visibleHuman`
  （`lib/admin/user-label.ts`）で弾く。
- `<uuid>@saml.invalid` → **メール行だけ**隠す。名前・画像・絵文字は残す。`displayUserLabel`
  だけで弾く（`visibleHuman` には足さない）。

判定は**呼び出し側ではなく、値が作られる場所**（`lib/admin/user-label.ts`）に置く。

## 理由

画面に出ると、利用者は自分のアカウントだと誤解する。一方 SAML の人は実在するので、
アカウント行ごと消すと「その人が居なくなったように見える」。判定を呼び出し側に置く設計だと、
次に `UserMenu` を置く人が必ず素の `me.data.email` を渡してまた漏れる（実際に layout.tsx の
2箇所へ同じ式が写されていた）。値が作られる場所で弾けば、そこを通らない限り画面へ出ない。

## 影響

- 守り手: `lib/admin/user-label.ts` の `displayUserLabel`（`visibleHuman` には足さない。
  足すと4つの出口（label/picture/avatarEmoji/name）すべてから消える）。
- 葉モジュール: `lib/settings/local-admin.ts` / `lib/auth/saml/placeholder-email.ts`。
  どちらも文字列を直書きしない理由で独立させている（綴りを変えた日に片方が黙って通すのを防ぐ）。
- 検査: `scripts/check-user-label-leak.mjs`（規則 A〜H。spread・変数経由・別ファイル関数呼び出し
  の迂回も検出）。
- 検査自身が明示する「見ていない範囲」: `userLabel={識別子}` の素通しは、**同じファイルに**
  `const/let/var` 宣言があれば右辺まで追うが、無ければ（別ファイル・関数引数由来など）追わない。
  `UserMenu` 以外の場所へメールを描く新しい経路も見ていない。実行時の値（画面での確認）も見ていない。

## 根拠

- `apps/studio/lib/admin/user-label.ts`
- `apps/studio/lib/settings/local-admin.ts`
- `apps/studio/lib/auth/saml/placeholder-email.ts`
- `apps/studio/scripts/check-user-label-leak.mjs`
- 実測（2026-08-15。`displayUserLabel` / `displayUserName` / `displayUserPicture` を関数として
  直接呼び出して測定した。**画面（ブラウザ）での確認はしていない**。Storybook はいま描画できない
  ため未確認）:
  - SAML 埋め草（`<uuid>@saml.invalid`）→ `displayUserLabel` = `null` / `displayUserName` =
    `"山田 太郎"`（残る）
  - `local-admin@localhost` → `displayUserLabel` = `null` / `displayUserName` = `null`
    （行ごと出ない）
  - 対照: 通常のメール（`taro.yamada@example.com`）→ `displayUserLabel` はそのまま出る
- `node scripts/check-user-label-leak.mjs` 実行結果（2026-08-15）: 対象214ファイル・違反0件。
  自己検査（壊し方1〜7、すべて検出）・対照検査（誤検出しない、2件とも合格）・見ていない範囲の
  診断（①別ファイルの関数経由は拾える／②別ファイルの const を素の識別子で渡す形は拾えない＝
  既知の免除）を確認した。
