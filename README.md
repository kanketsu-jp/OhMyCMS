# OhMyCMS

AI ネイティブな CMS。pnpm モノレポ構成で、`apps/studio` が Next.js 製の管理画面（Studio）本体。

## 起動

実質は install / db:up / dev の3ステップで起動できる。

```bash
pnpm install
pnpm db:up        # Postgres (localhost:5436) を起動
cp .env.example apps/studio/.env.local   # 値を埋める
pnpm migrate
pnpm dev          # http://localhost:3000
```

## 構成

```
cms/
├─ apps/
│  └─ studio/     Next.js 管理画面 (@ohmycms/studio)
├─ docker/
│  └─ compose.yml Postgres 17 (host 5436)
├─ package.json   ルート（pnpm workspace）
└─ pnpm-workspace.yaml
```

## 動作確認

`curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health` が 200 なら DB 接続まで OK。

詳細なドキュメントは今後 `knowledge/` に置く。
