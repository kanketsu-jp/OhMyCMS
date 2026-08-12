# OhMyCMS

AI ネイティブな CMS。pnpm モノレポ構成で、`apps/studio` が Next.js 製の管理画面（Studio）本体。

## 起動 A: Docker だけで全部立てる（DB もアプリも）

```bash
cp .env.example .env
pnpm docker:up          # = docker compose -f docker/compose.yml --env-file .env up -d --build
```

`http://localhost:3000` が Studio、`http://localhost:3000/api/health` が 200 になれば完了。
マイグレーションは使い捨ての `migrate` サービスが自動で流し、成功してから `studio` が起動する。

| コマンド | 内容 |
|---|---|
| `pnpm docker:up` | ビルドして起動 |
| `pnpm docker:logs` | studio のログを追う |
| `pnpm docker:down` | 停止（データは残る） |
| `pnpm docker:reset` | 停止してボリュームごと削除（DB とアップロード済みファイルが消える） |

> ⚠ **`--env-file .env` を省略すると `.env` は読まれない。**
> `docker compose -f docker/compose.yml ...` の形だと compose のプロジェクトディレクトリが
> `docker/` になり、探されるのは `docker/.env` でリポジトリルートの `.env` ではない（実測）。
> `.env` を省いても既定値で起動はするので、**値を変えたのに反映されない**という形で気づきにくい。
> ルートの `.env` を使うなら必ず `pnpm docker:up`（＝`--env-file .env` 付き）を使う。

## 起動 B: ホストで開発する（DB だけ Docker）

```bash
pnpm install
pnpm db:up        # Postgres (localhost:5436) だけを起動
cp .env.example apps/studio/.env.local   # 値を埋める
pnpm migrate
pnpm dev          # http://localhost:3000
```

A と B は 3000 番ポートを取り合うので同時には動かせない。

## 構成

```
cms/
├─ apps/
│  └─ studio/     Next.js 管理画面 (@ohmycms/studio)
├─ docker/
│  ├─ Dockerfile  Studio 本体（multi-stage: deps → source → builder / migrate / runner）
│  └─ compose.yml db + migrate + studio（compose プロジェクト名 = ohmycms）
├─ .dockerignore  秘密（.env 系）と node_modules をイメージへ入れないための除外
├─ package.json   ルート（pnpm workspace）
└─ pnpm-workspace.yaml
```

### 環境変数の入り口が 2 つある理由

| 使う場所 | ファイル | DB の接続先 |
|---|---|---|
| Docker（起動 A） | ルートの `.env` | `db:5432`（compose が `POSTGRES_*` から組み立てる） |
| ホスト（起動 B） | `apps/studio/.env.local` | `localhost:5436` |

コンテナ内の `localhost` は自分自身を指すため、ホスト用の `DATABASE_URL` はコンテナでは使えない。
`.env` の `DATABASE_URL` は起動 B 用として残してある。

## 動作確認

`curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health` が 200 なら DB 接続まで OK。

詳細なドキュメントは今後 `knowledge/` に置く。
