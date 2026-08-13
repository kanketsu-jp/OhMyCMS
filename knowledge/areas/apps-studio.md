---
type: area
title: apps/studio（管理画面 + REST API）
description: Next.js 16 製の単一アプリ。管理画面GUIとREST APIの両方を持ち、旧PJ ai-native-cms から移植された。lib/ はドメイン層として next/* に依存しない境界を持つ。
tags: [apps-studio, nextjs, rest-api, architecture]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://apps/studio/package.json"
  - resource: "repo://apps/studio/next.config.ts"
  - resource: "repo://.temp/2026-08-13/specs/00-phase-plan-and-contract.md"
stale_after: 2027-02-09
x_rag_okf:
  id: areas/apps-studio
  source_commit: 1603f6a
  authorship: agent
---

# apps/studio（管理画面 + REST API）

## 責務

`apps/studio`（package名 `@ohmycms/studio`）は **Next.js 16.2.12 の単一アプリ**で、
管理画面（GUI）と REST API の両方を1つのプロセスで提供する。旧PJ `ai-native-cms`
（TS/TSX 119本・検証済み）から移植したもので、`.temp/2026-08-13/decisions-log.md` D-003
「v0.9 は Next.js 1本、分離時は Hono」を実装している当のコードである。

v0.9 MVP の時点ではこのアプリが唯一のプロダクトコードで、`packages/`（sdk・cli・mcp）は
まだ存在しない（2026-08-13 実測）。

## 主要なファイル

ディレクトリの責務は次のとおり（実測: 2026-08-13）。

| パス | 責務 |
|---|---|
| `app/api/**/route.ts` | APIの入口。**薄い**（下記「実在するエンドポイント」参照）。ドメインロジックは持たず `lib/` を呼ぶ想定 |
| `app/(admin)/**` | 管理画面（route group）。`layout.tsx` と `admin/{page.tsx, files, folders, collections}` |
| `app/admin/actions/**` | フォーム送信用のプロキシ route（例: `app/admin/actions/logout/route.ts`）。中身は `fetch` で `/api/**` を叩き、Cookie を引き継いでリダイレクトする。`app/api/**` の REST 契約とは別枠（JS 無効環境でも動くフォーム送信の入口） |
| `app/login/page.tsx` | ログイン画面 |
| `lib/schema` | コレクション/フィールドのスキーマ定義・検証・イントロスペクション（`api.ts` `errors.ts` `introspect.ts` `models.ts` `service.ts` `types.ts` `validate.ts`） |
| `lib/items` | アイテム（レコード）CRUD・フィルタ・リレーション解決・クエリ組み立て |
| `lib/permissions` | 権限変数解決・ポリシー評価（`resolve.ts` `variables.ts`） |
| `lib/auth` | 認証コンテキスト・Cookie・セッション・Google OAuth・暗号（`context.ts` は D-007 の `Actor = HumanActor \| AgentActor` を実装） |
| `lib/files` | ファイル関連サービス。配信は必ず `/api/assets/<id>` を通す（署名付き URL を出さない）。アップロード時に**配信用の圧縮版**と**読み込み中に出すぼかし**を作る（[[storage-key-prefix-is-fixed]]） |
| `lib/storage` | S3互換ストレージのアダプタ（`driver.ts` `s3.ts` `local.ts` `index.ts`。D-001 の「S3互換アダプタ方式」を実装）。**エンドポイントは環境変数で外から与える**（R2 / GCS / AWS S3 / MinIO のどれでも同じコード）。読み出しと削除は **`directus_files.storage` に記録された保管先**で行う（今の設定で読むと、S3 へ切り替えた瞬間に過去のファイルが読めなくなる） |
| `lib/db` | Knex 接続（`knex.ts`）と `knexfile.ts`、`db/migrations`（2026-08-14 時点で 26 本）。🚨 DB は全ペインで1つなので、migrate は**他人の未適用分ごと**走る（[[migrations-are-shared]]） |
| `lib/admin` | **管理画面専用のクライアントヘルパ**。`api.ts`（68行）`forms.ts`（32行）`permissions-api.ts`（356行）。ここだけ `next/*` を import してよい |
| `components/ui` `components/admin` | UI コンポーネント |

起動・マイグレーションのコマンドは `apps/studio/package.json` の scripts:
`dev` / `build` / `start` / `lint` / `migrate`（`knex migrate:latest`）/
`migrate:rollback` / `migrate:status`（**打つ前に他人の未適用分を見る**）/
`verify:s3`（S3 互換の実測・MinIO 相手）/ `verify:compress`（圧縮とぼかしの実測）/
`migrate:storage`（ローカル → S3 の移行。既定は下見で、`--apply` で実行）。

## 他の領域との関係

- **将来の `packages/sdk` `packages/cli` `packages/mcp` から見た「サーバ」**。
  D-004（CLI/MCPはREST経由）により、これらは `app/api/**` を HTTP で叩く想定で、
  DB を直接触らない。
- **`lib/` のドメイン層は `next/*` を import しない**という境界がある（D-003 の保険）。
  2026-08-13 実測（`grep -rl "from ['\"]next" apps/studio/lib`）: `next/*` を import
  しているのは `lib/admin/api.ts` と `lib/admin/forms.ts` のみで、
  `lib/{schema,items,permissions,auth,files,storage,db}` は該当なし。つまり境界は
  現状クリーンに保たれている。この境界が壊れていないことは、将来 API を Hono へ
  切り出すコスト（=分離できるかどうか）に直結するため、`lib/admin` 以外へ `next/*` の
  import を増やさないよう注意する。
- **既存 REST API のURL・メソッドは「変更しない・追加のみ」の契約**下にある
  （`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §2-1）。これは v0.9 MVP を
  3トラック（infra / sdk-cli-mcp / studio）並列で進めるための共有契約で、破壊的変更が
  必要な場合は司令塔が全トラックを止めてから行う運用。

## 注意点（Gotchas）

- `next.config.ts` に `serverExternalPackages: ["knex", "pg", "sharp"]` が必須
  （D-002）。Knex は全 DB ドライバを動的 `require` するため、これが無いと build が
  落ちる。`output: "standalone"` も設定済み（Docker 用の最小 runner イメージのため）。
- `app/admin/actions/**` は `app/api/**` と役割が違う。前者はフォーム送信のプロキシ
  （JS無効環境向け・Cookie引き継ぎ）、後者が凍結対象の REST API 契約そのもの。
  この2系統を混同しない。
- i18n 契約（D-009）は F1 完了までは未施行。UI に直書きされた日本語/英語文言が
  残っている可能性がある（2026-08-13時点で個別ファイルまでは未確認）。
- `.env.local`（`apps/studio/.env.local`）は開かない・コピーしない・出力しない
  （リポジトリ共通の規律。ルートの `.env.example` が正本のテンプレート）。

## 実在する API エンドポイント（実測: 2026-08-13、`find app/api -name route.ts`）

| パス | メソッド |
|---|---|
| `/api/health` | GET |
| `/api/auth/me` | GET |
| `/api/auth/logout` | POST |
| `/api/auth/dev-login` | POST |
| `/api/auth/google` | GET |
| `/api/auth/google/callback` | GET |
| `/api/auth/agents` | GET, POST |
| `/api/auth/agents/[id]` | DELETE |
| `/api/collections` | GET, POST |
| `/api/collections/[collection]` | GET, PATCH, DELETE |
| `/api/fields` | GET |
| `/api/fields/[collection]` | GET, POST |
| `/api/fields/[collection]/[field]` | GET, PATCH, DELETE |
| `/api/items/[collection]` | GET, POST |
| `/api/items/[collection]/[id]` | GET, PATCH, DELETE |
| `/api/relations` | GET, POST |
| `/api/relations/[many_collection]/[many_field]` | GET, PATCH, DELETE |
| `/api/permissions` | GET, POST |
| `/api/permissions/[id]` | GET, PATCH, DELETE |
| `/api/policies` | GET, POST |
| `/api/policies/[id]` | GET, PATCH, DELETE |
| `/api/roles` | GET, POST |
| `/api/roles/[id]` | GET, PATCH, DELETE |
| `/api/access` | GET, POST |
| `/api/access/[id]` | DELETE |
| `/api/users` | GET |
| `/api/files` | GET, POST |
| `/api/files/[id]` | GET, PATCH, DELETE |
| `/api/folders` | GET, POST |
| `/api/folders/[id]` | GET, PATCH, DELETE |
| `/api/assets/[id]` | GET |

このURL・メソッドの一覧は `.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §2-1 の
「変更しない・追加のみ」契約の対象そのもの。新しいエンドポイントの追加は自由。

## 起動方法

```bash
pnpm install
pnpm db:up                                 # Postgres 17（ホスト 5436）を起動（docker/compose.yml）
cp .env.example apps/studio/.env.local     # 値を埋める
pnpm migrate                                # apps/studio/lib/db/migrations を適用
pnpm dev                                    # http://localhost:3000
```

動作確認: `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health`
が 200 なら DB 接続まで OK（実装は `db.raw("SELECT 1")` で疎通確認するのみ）。

ルートの `package.json` scripts: `dev` `build` `lint`
（いずれも `pnpm --filter @ohmycms/studio` 経由）、`db:up` `db:down`
（`docker compose -f docker/compose.yml`）、`migrate`。

## 根拠

- 実測: `find apps/studio -maxdepth 3 -type d`、`find apps/studio/app/api -name route.ts`
  （2026-08-13）
- 実測: `grep -rl "from ['\"]next" apps/studio/lib` / 同 `apps/studio/lib/admin`（2026-08-13）
- `apps/studio/next.config.ts`
- `apps/studio/package.json`、ルート `package.json`
- `README.md`
- `.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §2-1, §2-2
- `knowledge/decisions/db-postgres.md`、`orm-knex.md`、
  `single-nextjs-app-then-hono.md`、`cli-mcp-over-rest.md`、`two-tier-auth.md`
