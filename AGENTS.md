# AGENTS.md — OhMyCMS

> このファイルは AIエージェント(Codex / Claude Code / Cursor 等)が**毎ターン参照する常時ロードの指示書**として書いている。
> 根拠: Vercelの実測で、Skill化した知識は56%のケースで一度も呼び出されず、AGENTS.mdに直接埋め込んだ場合はBuild/Lint/Testの合格率が100%になった(Baseline 53%)。
> (出典: https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals, 2026-01-27)
> → 「調べれば分かること」でも、判断が割れやすい・事故りやすい項目はここに直接書く。Skillや別ドキュメントへの誘導だけで済ませない。
> Claude Codeは AGENTS.md を自動では読まない。CLAUDE.mdから `@AGENTS.md` でインポートする運用にすること。
> (出典: https://code.claude.com/docs/en/memory)

---

## 1. このプロジェクトは何か

OhMyCMS は **Directus を参考にした自作CMS**。最大の特徴は「GUIでコレクション(テーブル)をユーザーが増やせる」= **スキーマが実行時(ランタイム)に変わる**設計であること。

- 管理者がGUI上で「新しいコレクション」「新しいフィールド」を作ると、その場でPostgreSQLのDDL(`CREATE TABLE` / `ALTER TABLE`)が実行され、以後そのコレクションはAPI・管理画面に反映される。
- したがって「アプリ起動時に固定のスキーマがある」という前提のツール・ライブラリと構造的に相性が悪い(詳細は §3)。
- リポジトリ構成: pnpmモノレポ。`apps/studio` が Next.js 製の管理画面(Studio)本体。今後 `apps/` 配下にアプリが増える可能性がある。

## 2. スタック

| 領域 | 技術 | バージョン |
|---|---|---|
| フレームワーク | Next.js | 16.2.12 |
| UI | React | 19.2.4 |
| 言語 | TypeScript | strict モード |
| DBクエリビルダ | Knex | 3.3系 |
| DB | PostgreSQL | 17 |
| スタイリング | Tailwind CSS | v4 |
| UIコンポーネント | shadcn/ui | — |
| パッケージ管理 | pnpm | モノレポ(workspace) |

起動手順(README.md参照): `pnpm install` → `pnpm db:up`(Postgres, host port 5436) → `.env.local` 設定 → `pnpm migrate` → `pnpm dev`(http://localhost:3000)。

## 3. やってはいけないこと(絶対厳守)

### 3.1 Prisma / Drizzle を入れない

**理由**: Prisma・Drizzle はどちらも「スキーマファイルを起点に型・クライアントを生成する」静的スキーマ前提の設計。OhMyCMSはGUIでコレクションを追加すると実行時にDDLが走り、スキーマが動的に変わる。この設計と ORM の「ビルド時/コード生成時に確定したスキーマ」という前提は構造的に噛み合わない(マイグレーションのたびに生成コマンドを再実行する運用は本アプリの「GUIで即座に反映される」という要件を満たせない)。
**代わりに**: Knex(生SQL寄りのクエリビルダ)を使い続ける。動的なテーブル/カラムへのアクセスはKnexのビルダAPI(`.table(name)`, `.column(name)`など)で組み立てる。

### 3.2 `middleware.ts` を作らない。`proxy.ts` を使う

Next.js 16.0.0(2025-10-22リリース)で `middleware.ts` は `proxy.ts` に改称された。旧名は今も動くが deprecated(将来削除予定)。新規に `middleware.ts` を作らないこと。
- 関数名は `proxy`(named export または default export)。
- `proxy.ts` の runtime は **Node.js固定・変更不可**(Edge runtimeにはできない)。
- 出典: https://nextjs.org/blog/next-16 / https://nextjs.org/docs/app/getting-started/proxy

### 3.3 `next.config.ts` の `serverExternalPackages: ["knex", "pg", "sharp"]` を消さない

Knexは全DBドライバ(mysql/sqlite3/oracledb等)を動的requireするため、これが無いとバンドラが未インストールのドライバまで解決しようとしてbuildが落ちる。`apps/studio/next.config.ts` に既に設定済み。この配列を空にしたり削除したりしない。新しくNode.jsネイティブ依存を持つパッケージ(バイナリを触る系)を追加したときは、まずこの配列への追加が必要かを疑う。
出典: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages

### 3.4 SVG・HTML の配信は必ず `attachment`(XSS対策)

ユーザーがアップロードしたSVG/HTMLファイルをAPIから配信するとき、`Content-Disposition: inline` や未指定のままレスポンスすると、ブラウザがそのファイルをHTMLとして描画し、埋め込まれたスクリプトが実行されうる(SVGはXML内に`<script>`を埋め込める)。**必ず `Content-Disposition: attachment` を付け、ダウンロードとして扱わせる**。画像プレビューが必要な場合は、サーバ側でラスタライズ(PNG化)してから配信する。

### 3.5 権限はフィルタで隠すのでなく、サーバ側で拒否する

「権限が無いレコードは一覧に出さない」のようなUI側のフィルタだけで権限制御を済ませない。**アクセス権限の最終判断は必ずサーバ側(APIハンドラ or DB層)で行い、権限が無いリクエストは明示的に拒否(403/404)する**。クライアントに一度でも権限外データが渡ると、DevTools・キャッシュ・レスポンスログ経由で漏える。
(関連: 認証・セッション・Cookie設計に触れるときは `~/.claude/rules/auth-session-jwt-cookie.md` を読むこと — 認可の最終判断はmiddleware/proxyでなくServer側 or DB(RLS)で行う原則も同じ考え方)

### 3.6 `lib/` に Next.js 固有の import を持ち込まない

`apps/studio/lib/` はドメインロジック(スキーマ操作・items・権限・認証・ファイル)の置き場で、
**将来 API を別プロセス(Hono)へ切り出すときにそのまま持っていく資産**。したがって:

- `lib/` の中で `next/server`(`NextRequest` / `NextResponse`)、`next/headers`、`next/cache` を import しない
- HTTP の入出力に依存する処理は `app/api/**/route.ts` 側に置き、`lib/` には**素の値**(引数と戻り値)で渡す
- `lib/` が依存してよいのは Node.js 標準・knex・pg・sharp・aws-sdk・jose のような**フレームワーク非依存**のものだけ

この境界が守られている限り、分離は `lib/` を移すだけで済む。破ると書き直しになる。
(背景: v2 のリアルタイム機能・v3 のワークフローは常駐プロセス/WebSocket/cron を要し、
リクエスト単位で動く Next.js の route handler では素直に書けない)

### 3.7 秘密をログ・コミットに残さない

DB接続文字列、APIキー、署名鍵(`jose`を使ったJWT関連の鍵含む)を `console.log`・エラーメッセージ・コミット履歴に残さない。`.env.local` はgit管理外(`.env.example` のみコミット)。

### 3.8 UI に文言を直接書かない。必ず辞書キーを通す

**このCMSを自作した最大の理由が「全文言が自前の辞書にある」状態**であること(既存CMS 4本はここで脱落し、特に Keystone は Admin UI の `Create` / `Save` / `Delete` が英語のまま残せなかった)。したがって:

- `app/**` `components/**` の表示文言(JSXテキスト、`placeholder` / `title` / `aria-label` / `alt`、クライアントで組み立てるエラー文言)を**リテラルで書かない**。**英語のリテラルも禁止**(日本語だけ消して `Save` が残る事故を防ぐ)。
- 使い分け: **Server Component** は `import { getT, getFormat } from "@/i18n/server"` → `const t = await getT("files")`。**Client Component**(先頭に `"use client"`)は `import { useT, useFormat } from "@/i18n/client"` → `const t = useT("files")`。
- **辞書は名前空間ごとに1ファイル**: `i18n/messages/<locale>/<namespace>.json`。
  🚨 **単一の巨大 JSON に戻さないこと**(複数の作業者が同時に文言を足すと同じファイルを書き合って片方が消える。名前空間で割ってあるのはそれを防ぐため)。
- **新しい文言を足したら ja と en の両方に足す**(キー集合が一致していないと下記の検証が落ちる)。
  既存の名前空間へキーを足すだけなら `i18n/messages.ts` は触らない。**新しい名前空間を作るときだけ** ja/en に JSON を作り、`i18n/messages.ts` の import・`DICTIONARIES`・`NAMESPACES` に1行ずつ足す(登録漏れは `check-i18n-keys.mjs` が検出する)。
- **日付・数値は `getFormat()` / `useFormat()` を通す**(`toLocaleString()` を直接書かない)。
- 辞書化しないもの: サーバから返る値(`file.title` 等)、スキーマ識別子(`uuid` / `read` 等)、`htmlFor` / `name` / `href` などの属性値。
- 検証(`apps/studio` で実行):
  ```
  node scripts/check-i18n-hardcoded.mjs   # 日本語・英語のハードコード検出
  node scripts/check-i18n-keys.mjs        # ja/en のキー集合一致
  node scripts/check-i18n-usage.mjs       # コードが呼ぶキーと辞書の突き合わせ(両方向)
  ```
  🚨 **素の `grep '[ぁ-んァ-ヶ一-龠]'` で確認しないこと。** コメントを誤検出して**正しく完了したファイルでも落ち**、かつ**英語の残りを一切見逃す**(実測で両方確認済み)。

## 4. 検証の掟

作業結果を「動いた」「表示された」と報告する前に、必ず以下を守ること。

- **「curlでソースが取れた」を「表示確認」と書かない。** curlはHTMLを取得できるだけで、JSでレンダリングされる内容・実際のブラウザ描画・クライアントエラーの有無は分からない。表示確認が必要な場面では、実際にブラウザで開くかスクリーンショットを取る。
- **HTTPステータスの実測を貼る。** 「動いている」ではなく `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health` のような実測コマンドと実際の出力(例: `200`)を報告に含める。README.mdにも同様の確認コマンドが既にある。
- **「起動したまま」と書く前に、実際に200を確認する。** プロセスが立ち上がっている(ポートを掴んでいる)ことと、アプリが正常応答することは別。両方を確認してから「起動している」と言う。
- **分からないことは `unverified`(未検証)と明記する。** 推測で「おそらく動く」「たぶん大丈夫」と書かない。確認できていない事項は、確認できていないとそのまま書く。

## 5. コマンドインデックス(圧縮)

```
[OhMyCMS Commands]
|install: pnpm install
|db up:   pnpm db:up          (Postgres 17, host port 5436, docker/compose.yml)
|db down: pnpm db:down
|migrate: pnpm migrate        (apps/studio, Knex, lib/db/knexfile.ts)
|migrate rollback: pnpm --filter @ohmycms/studio migrate:rollback
|dev:     pnpm dev             → http://localhost:3000
|build:   pnpm build
|lint:    pnpm lint            (eslint, apps/studio)
|health check: curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
```

## 6. Next.js 16 固有の注意点(要点。詳細は `docs/research/nextjs16-and-agents-md.md`)

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any Next.js task — Next.js 16のAPIの一部(`"use cache"`, `cacheComponents`, `proxy.ts` 等)は、モデルの学習データの後に追加された可能性がある。記憶に頼らず、`node_modules/next` の型定義・公式ドキュメントで確認すること。

- `params` / `searchParams` は必ず `await` する(v15で非同期化、v16で同期アクセスの互換パスは完全撤廃済み)。
- Route Handlerの `GET` はデフォルトで動的(非キャッシュ)。`export const runtime = 'nodejs'` は書かなくてよい(デフォルトが`nodejs`)。
- `"use cache"` を使うなら `cacheComponents: true` を明示的に有効化する(デフォルトは無効)。有効化していないコードで `"use cache"` を書いても効かない。
- `revalidateTag()` は第2引数(`cacheLife`プロファイル)が必須。read-your-writesが要るなら `updateTag()`(Server Actions専用)を使う。
- Turbopackが dev/build ともデフォルト。webpack独自設定を追加する場合は影響を要確認。

## 7. モノレポでの拡張

`apps/` 配下にアプリが増えた場合、そのアプリ固有の指示は `apps/<app>/AGENTS.md` としてネスト配置してよい(ディレクトリツリー上で最も近いファイルが優先される。出典: https://agents.md/)。ルートのこのファイルは全アプリ共通のルールに留める。

---

## 8. 参考

| 目的 | 場所 |
|---|---|
| Next.js 16 の変更点(一次情報URL付き) | `docs/research/nextjs16-and-agents-md.md` |
| 日本語UIの寸法エビデンス | `docs/research/ja-en-ui-evidence.md` |
| 決定ログ(なぜそう決めたか) | `knowledge/decisions/` |

> Claude Code は `CLAUDE.md` から `@AGENTS.md` でこのファイルをインポートしている。
> Claude Code 固有の事柄は `CLAUDE.md` 側に書き、ここには**全エージェント共通のルールだけ**を置く。

<!-- rag-okf:start -->
[rag-okf knowledge v1|root: ./knowledge|generated: 2026-08-13|commit: eb17944|docs: 23
|STOP. このリポジトリ固有の事情はあなたの事前知識にない。下記に該当したら必ず該当ファイルを読む。
|acceptance,testing,permissions,ci→areas/acceptance.md
|apps-studio,nextjs,rest-api,architecture→areas/apps-studio.md
|design,ux,i18n,x-ui-rules→areas/design-system.md
|permissions,security,auth,items,files→areas/permissions.md
|areas:{areas/acceptance.md,areas/apps-studio.md,areas/design-system.md,areas/permissions.md}|decisions:{decisions/agents-md-as-canonical.md,decisions/cli-mcp-over-rest.md,decisions/db-postgres.md,decisions/folders-are-not-owned.md,decisions/i18n-own-implementation.md,decisions/i18n-required.md,decisions/json-as-source-of-truth.md,decisions/no-directus-fork.md,decisions/no-organization-table.md,decisions/orm-knex.md,decisions/relation-permission-boundary.md,decisions/single-nextjs-app-then-hono.md,decisions/two-tier-auth.md,decisions/ui-placement-by-frequency.md,decisions/use-proxy-not-middleware.md,decisions/v09-open-questions-answered.md}|glossary:{}|ops:{ops/hrdr-panes.md}
|検索(CLI): rag-okf search "<query>" --json
|更新: rag-okf refresh]
<!-- rag-okf:end -->
