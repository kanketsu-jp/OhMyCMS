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
- リポジトリ構成: Bun ワークスペース。`apps/studio` が Next.js 製の管理画面(Studio)本体。今後 `apps/` 配下にアプリが増える可能性がある。

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
| パッケージ管理 | Bun | ワークスペース(package.json の workspaces) |

起動手順(README.md参照): `bun install` → `bun run db:up`(Postgres, host port 5436) → `.env.local` 設定 → `bun run migrate` → `bun run dev`(http://localhost:3102)。

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

🚨 **`attachment` だけでは足りない。** ブラウザが中身を見て「HTML/SVG だ」と判断すると、`Content-Disposition` より先に描画してしまう経路が在る(SVG を `image/png` と偽って保存させる等)。これを止めるのが **`X-Content-Type-Options: nosniff`** で、**全応答の既定として `apps/studio/next.config.ts` の `headers()` に置いてある**(2026-08-17)。ファイル配信(`lib/files/service.ts` / `app/api/assets/[id]/route.ts`)と SAML metadata は、既定とは別の判断として**自前でも付けている**(既定を外した人が道連れにしないため)。**二重にはならない**(実測: 応答は 1 行)。

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

### 3.9 🚨 画面を触るなら、先に `DESIGN.md` を読む

**`app/**` `components/**` を編集する前に、リポジトリ直下の [`DESIGN.md`](./DESIGN.md) を読むこと。**
堀池さんが画面を見ながら出した指摘を規約に直したものが入っている（原文つき）。

🚨 **`.claude/rules/` には置いていない。OpenCode などが読まないため**
（出典: https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals ）。

**要点だけここに置く。詳細と原文は `DESIGN.md`。**

- 🚨 **作る前に「既に在るもの」を引く（DRY）。2 箇所以上に出るならラッパーにする**
  （置き場は `components/admin/`。中で `components/ui/` の素を使う）
- 🚨 **`components/ui/**` を単独で編集しない**（共有。`input.tsx` は 25 ファイルから参照＝実測）。
  判断の軸は「どのファイルを開くか」ではなく **「何画面に及ぶか」**
- **レイアウトは Layout に持たせる**。画面ごとに枠・余白・見出しを組み直さない
- **クロームは角丸を使わない**（平らに、隙間なく並べる）
- **パディングは親ではなく中の要素に持たせる**
- **オプションがあるなら必ずボタングループにする**（主ボタンと `▾` を隙間なく繋ぐ）
- **開くメニューに最小幅を持たせる**（日本語は 1 文字ずつ縦に潰れる）
- **アイコンは既定に落とさない**。1 件直したら、既定に落ちている項目を**全部数える**
  （🚨 数えるときは**組を全部開いてから**。閉じた組の中身は DOM に出ない）
- **中身が 0 件のとき器と線を残さない**。ただし「なぜ 0 件か」を先に測る（消すのでなく出し分け）
- 🚨 **迷ったら Directus の実物を見る**（`~/Develop/Projects/kk2/directus`・読むだけ・Vue なので写経しない）

## 4. 検証の掟

作業結果を「動いた」「表示された」と報告する前に、必ず以下を守ること。

- **「curlでソースが取れた」を「表示確認」と書かない。** curlはHTMLを取得できるだけで、JSでレンダリングされる内容・実際のブラウザ描画・クライアントエラーの有無は分からない。表示確認が必要な場面では、実際にブラウザで開くかスクリーンショットを取る。
- **HTTPステータスの実測を貼る。** 「動いている」ではなく `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3101/api/health` のような実測コマンドと実際の出力(例: `200`)を報告に含める。README.mdにも同様の確認コマンドが既にある。
- **「起動したまま」と書く前に、実際に200を確認する。** プロセスが立ち上がっている(ポートを掴んでいる)ことと、アプリが正常応答することは別。両方を確認してから「起動している」と言う。
- **分からないことは `unverified`(未検証)と明記する。** 推測で「おそらく動く」「たぶん大丈夫」と書かない。確認できていない事項は、確認できていないとそのまま書く。

## 5. コマンドインデックス(圧縮)

```
[OhMyCMS Commands]
|install: bun install
|db up:   bun run db:up          (Postgres 17, host port 5436, docker/compose.yml)
|db down: bun run db:down
|migrate: bun run migrate        (apps/studio, Knex, lib/db/knexfile.ts)
|migrate rollback: bun --filter @ohmycms/studio migrate:rollback
|first login: /login でパスワードだけ入れる (OHMYCMS_SETUP_PASSWORD。未設定なら既定 pass132)
|             入ると初期設定が始まり、そこで本来のパスワードを決める
|dev:     bun run dev             → http://localhost:3102 (開発サーバ)
|build:   bun run build
|lint:    bun run lint            (eslint, apps/studio)
|docker:  bun run docker:up       → http://localhost:3101 (本番相当)
|prod:    docker compose -f compose.yml -f compose.prod.yml up -d --build
|         (OHMYCMS_SETUP_PASSWORD を必須にする。既定値 pass132 のまま公開しない)
|health check: curl -sS -o /dev/null -w "%{http_code}" http://localhost:3101/api/health
|ports: 3101 Docker / 3102 dev / 3103 受入 / 3104 Storybook / 5436 Postgres
|       (knowledge/decisions/port-allocation.md。3000/5432/8080 等は避ける)
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

## 8. `docs/` と `knowledge/` の使い分け

**似ているので迷うが、役割が違う。** rag-okf の設計に従う
（README: 「init は既存の README・`docs/**`・git 履歴を読んで、`knowledge/` に中身のある器を作ります」）。

| | 何を置くか | 形式 | 判断のしかた |
|---|---|---|---|
| **`docs/`** | **素材・根拠・調査結果** | 自由記述 | 「**なぜそう言えるか**」の材料。出典URL・実測値・観察 |
| **`knowledge/`** | **結論・判断・領域の総覧** | **型ごとに節構成が固定**（project / area / decision / ops / glossary）。鮮度検査の対象 | 「**で、どうするのか**」 |

### 迷ったときの一言

> **「調べた結果」なら `docs/`。「だからこうする」なら `knowledge/`。**

例:
- `docs/research/ja-en-ui-evidence.md` — 日本語UIの寸法を調べた結果（出典URL付き）→ **素材**
- `docs/design/x-ui-rules.md` — X を観察した記録 → **素材**
- `knowledge/decisions/no-nested-surfaces.md` — 「面は1段まで」という**決定** → **結論**
- `knowledge/areas/permissions.md` — 権限の**総覧**（どこに何があり、何に気をつけるか）→ **結論**

🚨 **決定を `docs/` に置かない。** `knowledge/` は鮮度検査（`rokf doctor`）と索引の対象なので、
**`docs/` に置くと「古くなったこと」が検出されない**。実際に一度やって直した
（「面は1段まで」を `docs/design/` に置いていた）。

🚨 **`knowledge/` に新しいファイルを足したら `knowledge/index.md` にも1行足す。**
`rokf doctor` が `index-entries` として検出するが、**足すのは書いた人の仕事**。

🚨 **`docs/` に新しいファイルを足したら `docs/index.md` にも1行足す**（`knowledge/` と同じ）。
足し忘れ・消し忘れは **`check-docs-index`（門）が両方向で止める**。
由来: 索引が無かったころ、**18 本のうち 9 本が docs/ の外から一度も参照されない**状態だった
（**この索引を作った日に書かれたものも 1 本**）。

## 9. 参考

| 目的 | 場所 |
|---|---|
| Next.js 16 の変更点(一次情報URL付き) | `docs/research/nextjs16-and-agents-md.md` |
| 日本語UIの寸法エビデンス | `docs/research/ja-en-ui-evidence.md` |
| 決定ログ(なぜそう決めたか) | `knowledge/decisions/` |

> Claude Code は `CLAUDE.md` から `@AGENTS.md` でこのファイルをインポートしている。
> Claude Code 固有の事柄は `CLAUDE.md` 側に書き、ここには**全エージェント共通のルールだけ**を置く。

<!-- rag-okf:start -->
[rag-okf knowledge v1|root: ./knowledge|generated: 2026-08-16|commit: 9388d23|docs: 61
|STOP. このリポジトリ固有の事情はあなたの事前知識にない。下記に該当したら必ず該当ファイルを読む。
|knowledge/ が最新かつ正。docs/wiki/ は完成したものの読み物（写し）。
|acceptance,testing,permissions,ci→areas/acceptance.md
|apps-studio,nextjs,rest-api,architecture→areas/apps-studio.md
|auth,saml,sso,permissions→areas/auth-sso.md
|design,ux,i18n,x-ui-rules→areas/design-system.md
|permissions,security,auth,items,files→areas/permissions.md
|scope,acceptance,v1→areas/v1-scope.md
|areas:{areas/acceptance.md,areas/apps-studio.md,areas/auth-sso.md,areas/design-system.md,areas/permissions.md,areas/v1-scope.md}|decisions:{decisions/action-button-and-edit-mode.md,decisions/agents-md-as-canonical.md,decisions/auth-methods.md,decisions/avatar-is-emoji-not-initials.md,decisions/checks-must-declare-blind-spots.md,decisions/checks-read-the-index-not-the-worktree.md,decisions/cli-mcp-over-rest.md,decisions/db-postgres.md,decisions/deleting-a-file-is-two-deletes.md,decisions/every-element-must-earn-its-place.md,decisions/folders-are-not-owned.md,decisions/guards-keyed-by-name-break-silently.md,decisions/https-is-not-node-env.md,decisions/i18n-check-scope-is-what-reaches-the-screen.md,decisions/i18n-own-implementation.md,decisions/i18n-required.md,decisions/intentional-deviations-from-idea-md.md,decisions/json-as-source-of-truth.md,decisions/migrations-are-shared.md,decisions/never-expose-dev-server.md,decisions/no-directus-fork.md,decisions/no-nested-surfaces.md,decisions/no-organization-table.md,decisions/not-yet-allowed-is-not-logged-out.md,decisions/orm-knex.md,decisions/permanent-fixtures-are-not-junk.md,decisions/port-allocation.md,decisions/probes-clean-up-by-id.md,decisions/relation-permission-boundary.md,decisions/secrets-storage-by-recoverability.md,decisions/shared-files-are-not-left-in-the-window.md,decisions/shared-resources-are-exclusive.md,decisions/shortcuts-must-not-collide-with-editor.md,decisions/single-nextjs-app-then-hono.md,decisions/soft-deleted-names-stay-taken.md,decisions/stepwise-docs.md,decisions/storage-guard-uses-effective-config.md,decisions/storage-key-prefix-is-fixed.md,decisions/storage-local-root-is-fixed.md,decisions/synthetic-ids-are-not-contacts.md,decisions/tailwind-v4-transform-is-three-properties.md,decisions/toast-for-events-page-for-what-needs-fixing.md,decisions/trash-and-restore-ui.md,decisions/trash-purge-is-sql-first.md,decisions/tree-connector-lines.md,decisions/two-tier-auth.md,decisions/ui-placement-by-frequency.md,decisions/upload-limits-are-two-not-one.md,decisions/use-proxy-not-middleware.md,decisions/user-tables-have-one-entrance.md,decisions/v09-open-questions-answered.md,decisions/verify-the-verifier.md}|glossary:{}|ops:{ops/hrdr-panes.md}
|検索(CLI): rag-okf search "<query>" --json
|更新: rag-okf refresh]
<!-- rag-okf:end -->

