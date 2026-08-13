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

## 本番（VPS / Dokploy）へ出すとき

```bash
docker compose -f compose.yml -f compose.prod.yml up -d --build
```

`compose.prod.yml` は **`OHMYCMS_SETUP_PASSWORD` を必須にする**だけの上書き。
未設定なら compose が起動を拒否する。

> 🚨 **既定値 `pass132` のまま公開しない。**
> `pass132` はリポジトリと `.env.example` に平文で書いてある**公開値**で、秘密ではない。
> 2026-08-13 に、公開中の URL へ焼き直した結果 **外から `pass132` だけで管理者になれた**（実事故）。
> 公開する前に `.env` の `OHMYCMS_SETUP_PASSWORD` をランダム値へ変えること。

> 🚨 **公開する前に、その URL で実際に認証を1回試す。**
> 「本番ビルドだから安全」では判定できない（上の事故は本番ビルドで起きた）。
> 見るのは「どのビルドか」ではなく「**実際に入れてしまわないか**」。
> また **公開したまま焼き直さない**。焼き直すなら先にトンネルを落とす。

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

### 最初のログイン

Docker（起動 A）ではルートの `.env`、ホスト（起動 B）では `apps/studio/.env.local` に `OHMYCMS_ADMIN_EMAIL` と `OHMYCMS_ADMIN_PASSWORD` を設定する。設定して起動すると、そのメールアドレスとパスワードで管理画面に入れる（Google の設定は不要）。

既に同じメールアドレスのユーザーが居れば何もしない。後から環境変数を変えても既存ユーザーは変わらない。2人目以降は管理画面から追加する（signup は無い）。

ログイン失敗はアカウント単位で5回→15分ロック。IP単位のレート制限は入れていない（プロキシ・Dockerで送信元が潰れるため。前段の構成を決めてから導入する）

失敗回数はユーザー行（DB）に持つため複数レプリカでも共有されるが、同時実行数の上限（scrypt 4並列・待ち32まで）はプロセス内メモリなのでレプリカ間で共有されない

CPU アーキテクチャが変わったときは scrypt のコストを測り直す。現在の値は arm64 / Apple Silicon のコンテナ内実測で、amd64 では1.5〜2倍遅くなりうる。

```bash
docker exec ohmycms-studio bun -e '
const { scryptSync, randomBytes } = require("node:crypto");
const salt = randomBytes(16); const maxmem = 256*1024*1024;
for (const logN of [14,15,16,17]) {
  const N = 2**logN; const t0 = performance.now();
  for (let i=0;i<5;i++) scryptSync("bench", salt, 64, { N, r:8, p:1, maxmem });
  console.log(`N=2^${logN}`, ((performance.now()-t0)/5).toFixed(1)+"ms");
}'
```

1回の照合が100ms前後になるNを選び、`lib/auth/password.ts` の `N` を書き換える。既存のハッシュは保存文字列にパラメータが入っているので、そのまま検証できる（作り直し不要）。

## 動作確認

`curl -sS -o /dev/null -w "%{http_code}" http://localhost:3101/api/health` が 200 なら DB 接続まで OK。

詳細なドキュメントは今後 `knowledge/` に置く。
