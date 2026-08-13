# OhMyCMS

AI ネイティブな CMS。Bun ワークスペース構成で、**`apps/studio`** が Next.js 製の管理画面（Studio）本体です。

このページだけを読めば、clone した状態から**起動してログインする**ところまで到達できます。

## 前提条件

始める前に、次の4つを用意してください。

- **Docker**（`docker compose` が使えること）
- **Bun**（開発環境で動かす場合のみ。起動だけなら不要）
- **空いているポート**: **3101**（Studio）/ **5436**（PostgreSQL）
  - 開発環境も動かす場合は **3102** も空けてください
  - 割り当ての一覧は `knowledge/decisions/port-allocation.md` にあります
- **Google の設定は不要です。** SSO を使わなくてもログインできます

## ステップ 1 — Docker で起動する

1. リポジトリのルートで、環境変数のファイルを作ります。

   ```bash
   cp .env.example .env
   ```

2. 起動します。DB もアプリも同時に立ち上がります。

   ```bash
   docker compose up -d --build
   ```

3. **`http://localhost:3101/api/health`** を開き、`200` が返れば起動は完了です。

   ```bash
   curl -sS -o /dev/null -w "%{http_code}" http://localhost:3101/api/health
   ```

マイグレーションは使い捨ての **`migrate`** サービスが自動で流し、成功してから **`studio`** が起動します。

| コマンド | 内容 |
|---|---|
| `bun run docker:up` | ビルドして起動（`docker compose up -d --build`） |
| `bun run docker:logs` | studio のログを追う |
| `bun run docker:down` | 停止（データは残る） |
| `bun run docker:reset` | 停止してボリュームごと削除（**DB とアップロード済みファイルが消える**） |

**注：** `compose.yml` をリポジトリのルートに置いているのは、`.env` を読ませるためです。compose は `.env` を「プロジェクトディレクトリ＝compose ファイルのある場所」から読みます。`docker/compose.yml` に置いて `-f docker/compose.yml` で叩くと、探されるのは `docker/.env` になり、ルートの `.env` は**黙って無視されます**（既定値で起動してしまうため気づきにくい）。

## ステップ 2 — 最初のログイン

初回は**パスワード1つだけ**で入ります。メールアドレスは要りません。

1. **`http://localhost:3101/login`** を開きます。
2. **`OHMYCMS_SETUP_PASSWORD`** の値を入力します。`.env.example` をコピーしただけなら既定値の **`pass132`** です。
3. 入ると**初期設定**の画面になります。**表示言語**と**サービス名**を決めて、**はじめる**を押してください。
4. 管理画面（**`/admin`**）に入れます。

パスワードを変えるには、`.env` の **`OHMYCMS_SETUP_PASSWORD`** に好きな値を入れて起動し直します。

**重要：** 既定値の **`pass132`** のまま**公開しない**でください。`pass132` はこのリポジトリと `.env.example` に平文で書かれている**公開値**であり、秘密ではありません。2026-08-13 に、公開中の URL へ焼き直した結果、**外から `pass132` だけで管理者になれました**（実際に起きた事故です）。公開する前に `.env` の値をランダムな文字列へ変えてください。

**注：** ログインに続けて失敗すると、一定時間入れなくなります。IP 単位のレート制限は入れていません（プロキシや Docker を挟むと送信元が潰れて正しく数えられないため。前段の構成を決めてから導入します）。同時実行数の上限はプロセス内で持っているので、**複数レプリカに分けると共有されません**。

## ステップ 3 — 開発環境で動かす（任意）

DB だけ Docker で立て、アプリはホストで動かします。ステップ 1 と**同時に動かせます**（ポートが違うため）。

```bash
bun install
bun run db:up                              # PostgreSQL (localhost:5436) だけを起動
cp .env.example apps/studio/.env.local     # 値を埋める
bun run migrate
bun run dev                                # http://localhost:3102
```

**注：** 起動 A（Docker）は **3101**、開発環境は **3102** を使います。

## 本番へ出すとき

```bash
docker compose -f compose.yml -f compose.prod.yml up -d --build
```

`compose.prod.yml` は **`OHMYCMS_SETUP_PASSWORD` を必須にする**だけの上書きです。未設定なら compose が起動を拒否します。

**重要：** 公開する前に、その URL で**実際に認証を1回試してください**。「本番ビルドだから安全」では判定できません（上記の事故は本番ビルドで起きました）。見るのは「どのビルドか」ではなく「**実際に入れてしまわないか**」です。また、**公開したまま焼き直さない**でください。焼き直すなら先にトンネルを落とします。

## 環境変数の入り口が 2 つある理由

| 使う場所 | ファイル | DB の接続先 |
|---|---|---|
| Docker（ステップ 1） | ルートの **`.env`** | `db:5432`（compose が `POSTGRES_*` から組み立てる） |
| ホスト（ステップ 3） | **`apps/studio/.env.local`** | `localhost:5436` |

コンテナ内の `localhost` は自分自身を指すため、ホスト用の `DATABASE_URL` はコンテナでは使えません。`.env` の `DATABASE_URL` はステップ 3 用として残してあります。

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

## パスワードのハッシュを測り直す

CPU のアーキテクチャが変わったときは、scrypt のコストを測り直してください。現在の値は **arm64 / Apple Silicon** のコンテナ内で実測したもので、**amd64 では 1.5〜2 倍遅くなりえます**。

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

1回の照合が **100ms 前後**になる `N` を選び、**`apps/studio/lib/auth/password.ts`** の `N` を書き換えます。既存のハッシュは保存されている文字列にパラメータが入っているので、**そのまま検証できます**（作り直しは不要です）。

## 困ったときは

- **起動したのに 200 が返らない**: `bun run docker:logs` でログを確認してください。DB の起動待ちで数秒かかることがあります。
- **ログイン画面でパスワードが通らない**: `.env` の **`OHMYCMS_SETUP_PASSWORD`** と、実際にコンテナへ渡っている値が一致しているか確認してください。

  ```bash
  docker exec ohmycms-studio printenv OHMYCMS_SETUP_PASSWORD
  ```

- **設計の背景を知りたい**: 判断の記録は **`knowledge/decisions/`**、領域ごとの総覧は **`knowledge/areas/`** にあります。
- **上記で解決しない**: **実行したコマンド**・**`curl` で得た HTTP ステータス**・**`bun run docker:logs` の出力**を添えて報告してください。この3つが無いと、環境の違いなのか不具合なのかを切り分けられません。
