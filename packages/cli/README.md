# @ohmycms/cli

OhMyCMS をコマンドラインから操作する CLI。コマンド名は `ohmycms`。

**`@ohmycms/sdk` 経由で REST API を HTTP で叩くだけ。DB へは直結しない。**

```bash
pnpm --filter @ohmycms/cli build
node packages/cli/dist/index.js --help
```

## 使えるようにする

グローバルに入れるには pnpm のグローバル bin ディレクトリが要る（`pnpm setup` が未実行だと
`ERR_PNPM_NO_GLOBAL_BIN_DIR` になる。`pnpm setup` は**シェルの設定ファイルを書き換える**ので、
入れるかどうかは利用者が決めること）。

リポジトリの中だけで試すならシンボリックリンクで足りる:

```bash
ln -sf ../../packages/cli/dist/index.js node_modules/.bin/ohmycms
PATH="$PWD/node_modules/.bin:$PATH" ohmycms --help
```

## 接続先とトークンの決め方

**上ほど優先**（`--help` にも同じ表がある）:

| 優先 | 出所 | 接続先 | トークン |
|---|---|---|---|
| 1 | フラグ | `--url` | `--token` |
| 2 | 環境変数 | `OHMYCMS_URL` | `OHMYCMS_TOKEN` |
| 3 | 設定ファイル | `~/.config/ohmycms/config.json` | 同左 |
| 4 | 既定値 | `http://localhost:3000` | （既定値なし） |

> 当初の仕様は「環境変数 → 設定ファイル → フラグ」だったが、`--token` で一時的に上書きできない CLI は
> 使い物にならないため**反転した**（司令塔決定・2026-08-13）。

設定ファイルは **ディレクトリ 700 / ファイル 600** で作る。`XDG_CONFIG_HOME` を尊重する。
**リポジトリ配下には保存しない**（誤ってコミットされるため）。

```
$ ls -ld ~/.config/ohmycms          drwx------
$ ls -l  ~/.config/ohmycms/config.json   -rw-------
```

## ログイン

🚨 **OhMyCMS には ID / パスワードのログイン API が無い。**
CLI は「人間が発行したエージェントトークンを預かって動く」設計になっている。

```bash
# 通常: 管理画面で発行したトークンを保存する（保存前に /api/auth/me で検証する）
ohmycms login --token <トークン> --url http://localhost:3000

# 開発時のみ: dev-login でセッションを取り、その場でトークンを発行して保存する
#（サーバ側で ALLOW_DEV_LOGIN=true かつ NODE_ENV!=production のときだけ動く）
ohmycms login --dev-login you@example.test --admin \
  --collection-capability articles:read,create,update,delete
```

### 🚨 capabilities の落とし穴

エージェントトークンの権限は **委任元ユーザーの権限 ∩ capabilities**。
`collections` と `admin` で**既定が逆**なので注意する:

| capabilities | items（行の読み書き） | 管理操作（コレクション作成・権限設定など） |
|---|---|---|
| 指定しない（null） | ✅ 委任元の権限をそのまま継承 | ❌ 全部 403 `CAPABILITY_DENIED` |
| `{admin:[...]}` だけ | ❌ **全部 403 `PERMISSION_DENIED`** | ✅ 指定した範囲だけ |
| `{admin:[...], collections:{...}}` | ✅ 列挙したコレクションだけ | ✅ 指定した範囲だけ |

**`capabilities` を一度でも指定すると、`collections` を明示しない限り items が全滅する**
（2026-08-13 実測）。CLI は admin だけを指定したとき警告を出す。

```bash
ohmycms token create --name ci-bot \
  --admin-capability schema:read,schema:write \
  --collection-capability articles:read,create
```

`--admin-capability` に指定できるのは `schema:read` / `schema:write` / `settings:read` /
`settings:write` / `all`。

## コマンド

```
ohmycms health                                  API に繋がるか
ohmycms whoami                                  いまのトークンが誰なのか（値は表示しない）
ohmycms login / logout

ohmycms collection list [--system]
ohmycms collection create <名前> [--field title:string ...] [--primary-key id]
ohmycms collection delete <名前> --yes

ohmycms field list <コレクション>
ohmycms field add <コレクション> <フィールド> --type <型> [--required] [--max-length n]

ohmycms item list <コレクション> [--filter <JSON>] [--fields a,b] [--sort -views] [--limit n] [--page n] [--count]
ohmycms item get    <コレクション> <ID>
ohmycms item create <コレクション> --data '<JSON>'
ohmycms item update <コレクション> <ID> --data '<JSON>'
ohmycms item delete <コレクション> <ID> --yes

ohmycms user list
ohmycms token create --name <名前> [--admin-capability …] [--collection-capability …]
ohmycms token list / delete <ID>
ohmycms schema snapshot [--out <ファイル>]
```

`--filter` は API と同じ記法の JSON（演算子の一覧は `packages/sdk/README.md` §3）。

## 出力

- 既定は**人間向け**（日本語の表）
- `--json` で**機械向け**（stdout には JSON だけ。注意書きは stderr へ出す）
- **トークンを表示しない。** 表示するのは `token create` の発行直後と、
  `login --dev-login --print-token` を明示したときだけ

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 成功 |
| 1 | 一般エラー（サーバの 400 / 500） |
| 2 | 引数の誤り（未知のコマンド・必須フラグ不足・型違い・JSON が壊れている） |
| 3 | 認証されていない（401・トークンが無い / 無効 / 期限切れ） |
| 4 | 権限が足りない（403） |
| 5 | 見つからない（404） |
| 6 | サーバへ接続できない（接続拒否 / タイムアウト） |

エラーは**日本語**で、サーバのエラーコードごとに「次に何をすればいいか」を1行添える。

```
$ ohmycms collection list
エラー: このcapabilityでは管理操作が許可されていません（CAPABILITY_DENIED / HTTP 403）
  → exit=4

$ ohmycms health --url http://127.0.0.1:1
エラー: GET http://127.0.0.1:1/api/health へ接続できませんでした（NETWORK_ERROR / HTTP 接続失敗）
  → 接続先を確認してください: http://127.0.0.1:1/api/health
  → exit=6
```

打ち間違えたフラグは**黙って無視せずエラーにする**（`--jsno` のつもりが人間向け出力になって、
呼び出し側のパースが静かに壊れるのを防ぐため）:

```
$ ohmycms health --jsno
エラー: health では使えないオプションです: --jsno
  → もしかして: --json（ohmycms health --help も見てください）
```

## 設計メモ

- 依存は **`@ohmycms/sdk` だけ**。引数パーサも表の描画も自前（依存を増やさない方針）
- ビルドは tsup。SDK を bundle に取り込むので、単体の `dist/index.js` だけで動く
- **引数の検証はトークンの確認より先**に行う。
  `ohmycms collection create`（名前なし）で「トークンがありません」と言われると原因を誤解するため
- `--sort -views` のように `-` で始まる値を受けるため、真偽フラグの集合を持っている
