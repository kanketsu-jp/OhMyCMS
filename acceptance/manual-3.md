# 受入基準3 — ブラウザだけで一通り完結することの手順書

> `pnpm acceptance` はこの項目を **MANUAL** として出す。機械では判定しない。
> 理由: ブラウザ自動操作（Playwright 等）を足すと依存とメンテが増え、
> MVP の判定より先にハーネス自体の面倒を見ることになるため（F9h §4）。

**この手順書は「見えたら合格」を各ステップに書いてある。** 迷ったら「合格の見え方」だけ見ればよい。
1つでも合格の見え方にならなかったら、その時点で **基準3 は FAIL**。どこで落ちたかを記録すること。

---

## 0. 事前準備

| 項目 | 値 |
|---|---|
| 対象 | `http://localhost:3999`（受入ハーネスが立てる開発ビルドの studio） |
| 起動 | `pnpm acceptance --only 8` を一度走らせると studio-acc が立つ。または `docker compose -f compose.yml -f acceptance/compose.acceptance.yml up -d studio-acc` |
| 停止 | `node acceptance/run.mjs --down` |
| ログイン | 開発用ログイン（`ALLOW_DEV_LOGIN=true`）を使う |

**作るものには必ず `acc-` を付ける。** 最後に §7 で消す。

> 🚨 本番ビルド（`docker compose up` の studio・3000 や 3777）には開発用ログインが無い。
> ブラウザで確認するときは Google ログインを使うか、この手順書どおり 3999 を使うこと。

---

## 1. ログインできる

1. `http://localhost:3999/login` を開く
2. 「開発用ログイン」欄にメールアドレスを入れる: `acc-manual@example.com`
3. 「管理者権限でログイン」にチェックを入れて送信する

**合格の見え方**: `/admin` へ遷移し、左サイドバーに「コレクション」「ファイル」「フォルダ」「設定 / ロール」…が並ぶ。
右上に `acc-manual@example.com` が出る。

---

## 2. コレクションを作る

1. サイドバーの「コレクション」を開く
2. 「新規作成」欄のコレクション名に `acc_manual_articles` を入れて「作成」

**合格の見え方**: 下の一覧表に `acc_manual_articles` の行が増える。フィールド数は `0`。

**ここで落ちたら**: PostgreSQL に `CREATE TABLE` が飛んでいない。
`docker compose logs studio-acc` と `/api/collections` のレスポンスを見る。

---

## 3. フィールドを追加する

1. `acc_manual_articles` の行の「フィールド」を押す
2. フィールドを2つ足す:
   - `title` / 型 `string`
   - `body` / 型 `text`

**合格の見え方**: フィールド一覧に `title` と `body` が並ぶ。
コレクション一覧に戻ると、`acc_manual_articles` のフィールド数が `0` から増えている。

---

## 4. リレーションを張る

1. もう1つコレクションを作る: `acc_manual_authors`（§2 と同じ手順）
2. `acc_manual_authors` に `name` / 型 `string` を足す
3. `acc_manual_articles` に、`acc_manual_authors` を指すフィールドを足す

**合格の見え方**: `acc_manual_articles` のフィールド一覧に、関連先が
`acc_manual_authors` であることが分かる形で表示される。

**ここで落ちたら**: リレーション UI は F2 の担当範囲。
「UI が無い」のか「UI はあるが保存できない」のかを分けて記録すること。

---

## 5. 権限を設定する

1. サイドバー「設定 / ポリシー」→ 新規作成: `acc-manual-policy`（管理者権限は **オフ**）
2. そのポリシーに `acc_manual_articles` の `read` 権限を足す
3. サイドバー「設定 / ユーザー」→ 別のユーザーにこのポリシーを割り当てる

**合格の見え方**: ポリシー詳細に `acc_manual_articles / read` の行が出る。
ユーザー一覧で、割り当てたユーザーに `acc-manual-policy` が表示される。

**🚨 否定形もここで見る**: 別のブラウザ（またはシークレットウィンドウ）で
そのユーザーとしてログインし、**`acc_manual_authors`（権限を与えていない方）が
サイドバーに出ない／開けない**ことを確認する。
権限を与えた `acc_manual_articles` は**開ける**ことも同時に確認する。
——片方だけでは意味がない（「何も見えない」だけかもしれない）。

---

## 6. アイテムを登録してファイルを添付する

1. サイドバー「コンテンツ」の `acc_manual_articles` を開く
2. 「新規作成」で `title` に `acc-manual-1`、`body` に適当な文章を入れて保存
3. サイドバー「ファイル」を開き、画像を1枚アップロードする（ファイル名を `acc-manual.png` にする）
4. アップロードした画像の詳細を開く

**合格の見え方**:
- アイテム一覧に `acc-manual-1` の行が出る。開くと入力した値が入っている
- ファイル一覧に `acc-manual.png` のサムネイルが出る
- 詳細画面で画像がプレビューされる

**🚨 ここで SVG も試す**: `.svg` ファイルをアップロードして詳細を開く。
**画像として描画されず、ダウンロード扱いになる**こと（受入基準9 の目視確認）。
機械での判定は `pnpm acceptance --only 9` が行う。

---

## 7. 後片付け

作ったものを消す。**消し忘れると次回の判定が汚れる。**

1. `acc_manual_articles` と `acc_manual_authors` を削除する
2. `acc-manual.png` と SVG を削除する
3. `acc-manual-policy` を削除する
4. **ユーザー行は API に削除の入口が無い**ので消せない。
   `acc-manual@example.com` と §5 で作ったユーザーが残ることを記録しておく

---

## 記録の書き方

報告するときは、この形で書く。

```
基準3 の目視確認  実施日: 2026-__-__  対象: http://localhost:3999  HEAD=_______
 1 ログイン            OK / NG（NG の場合: 何が見えたか）
 2 コレクション作成    OK / NG
 3 フィールド追加      OK / NG
 4 リレーション        OK / NG
 5 権限（肯定形/否定形）OK / NG
 6 アイテム＋ファイル  OK / NG
 7 後片付け            完了 / 残ったもの: ______
判定: PASS / FAIL（FAIL ならどのステップか）
```
