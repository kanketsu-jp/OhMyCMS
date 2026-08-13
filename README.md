# OhMyCMS

AI ネイティブな CMS。Bun ワークスペース構成で、`apps/studio` が Next.js 製の管理画面（Studio）本体。

## 起動 A: Docker だけで全部立てる（DB もアプリも）

```bash
cp .env.example .env
docker compose up -d --build
```

`http://localhost:3101` が Studio、`http://localhost:3101/api/health` が 200 になれば完了。
マイグレーションは使い捨ての `migrate` サービスが自動で流し、成功してから `studio` が起動する。

| コマンド | 内容 |
|---|---|
| `bun run docker:up` | ビルドして起動（`docker compose up -d --build`） |
| `bun run docker:logs` | studio のログを追う |
| `bun run docker:down` | 停止（データは残る） |
| `bun run docker:reset` | 停止してボリュームごと削除（DB とアップロード済みファイルが消える） |

> 📌 **`compose.yml` をリポジトリルートに置いているのは、`.env` を読ませるため。**
> compose は `.env` を「プロジェクトディレクトリ＝compose ファイルのある場所」から読む。
> `docker/compose.yml` に置いて `-f docker/compose.yml` で叩くと、探されるのは `docker/.env` で、
> ルートの `.env` は**黙って無視される**（既定値で起動してしまうため気づきにくい）。
> ルートに置けばフラグ無しの `docker compose up -d` だけで `.env` が効く。

## 起動 B: ホストで開発する（DB だけ Docker）

```bash
bun install
bun run db:up        # Postgres (localhost:5436) だけを起動
cp .env.example apps/studio/.env.local   # 値を埋める
bun run migrate
bun run dev          # http://localhost:3101
```

起動 A は 3101、起動 B は 3102 を使うので同時に動かせる（ポート割り当ては knowledge/decisions/port-allocation.md）。

## 構成

```
cms/
├─ apps/
│  └─ studio/     Next.js 管理画面 (@ohmycms/studio)
├─ docker/
│  └─ Dockerfile  Studio 本体（multi-stage: deps → source → builder / migrate / runner）
├─ compose.yml    db + migrate + studio（compose プロジェクト名 = ohmycms）
├─ .dockerignore  秘密（.env 系）と node_modules をイメージへ入れないための除外
├─ package.json   ルート（Bun workspaces）
└─ bun.lock
```

### 環境変数の入り口が 2 つある理由

| 使う場所 | ファイル | DB の接続先 |
|---|---|---|
| Docker（起動 A） | ルートの `.env` | `db:5432`（compose が `POSTGRES_*` から組み立てる） |
| ホスト（起動 B） | `apps/studio/.env.local` | `localhost:5436` |

コンテナ内の `localhost` は自分自身を指すため、ホスト用の `DATABASE_URL` はコンテナでは使えない。
`.env` の `DATABASE_URL` は起動 B 用として残してある。

## 動作確認

`curl -sS -o /dev/null -w "%{http_code}" http://localhost:3101/api/health` が 200 なら DB 接続まで OK。

詳細なドキュメントは今後 `knowledge/` に置く。
