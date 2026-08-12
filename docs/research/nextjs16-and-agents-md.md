# OhMyCMS 一次調査: AGENTS.md 運用 と Next.js 16 知識ベース

- 調査日: 2026-08-13
- 対象リポジトリ: `/Users/horiikekazuma/Develop/Projects/kk2/cms`(OhMyCMS。pnpm モノレポ、`apps/studio` が Next.js 16.2.12 / React 19.2.4 / TypeScript strict の管理画面本体)
- 方針: 一次情報のみを事実として記載する。確認できなかったことは「未確認」と明記する。バージョン番号と日付を必ず併記する。

---

## 1. TL;DR — このPJが従うべきルール(出典付き)

1. **`middleware.ts` は作らない。`proxy.ts` を使う。** v16.0.0(2025-10-22リリース)で改称。旧名は動くが deprecated で将来削除予定。([nextjs.org/blog/next-16](https://nextjs.org/blog/next-16))
2. **`proxy.ts` の runtime は Node.js 固定・変更不可。** Edge runtime が必要な機能は proxy.ts では書けない(今のところ middleware.ts のまま残す以外の回避策なし)。([nextjs.org/docs/app/getting-started/proxy](https://nextjs.org/docs/app/getting-started/proxy))
3. **改称の移行は codemod で機械的に行える**: `npx @next/codemod@latest middleware-to-proxy .`。ファイル名・エクスポート関数名・`experimental.middlewarePrefetch` 等の config キー名を一括変換する。([nextjs.org/docs/app/guides/upgrading/codemods](https://nextjs.org/docs/app/guides/upgrading/codemods))
4. **`params` / `searchParams` は必ず `await` してから使う。** v15(2024年リリース)で非同期化され、v16では同期アクセスの互換コードが完全撤廃済み。同期アクセスはビルドエラーになる。([nextjs.org/docs/app/guides/upgrading/version-16](https://nextjs.org/docs/app/guides/upgrading/version-16))
5. **`next.config.ts` の `serverExternalPackages: ["knex", "pg", "sharp"]` を消さない。** Knex は全DBドライバを動的requireするため、これが無いとバンドラが未インストールドライバまで解決しようとしてbuildが落ちる(リポジトリの実装コメントと一致する公式挙動)。仕様の出典: [nextjs.org/docs/.../serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)。
6. **`"use cache"` を使うなら `cacheComponents: true` を明示的に有効化する。** デフォルトは無効(オプトイン)。有効化は「リネームだけでは済まない」変更で、`<Suspense>` 外の未キャッシュデータでビルドエラーが出うる。([nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents))
7. **`unstable_cache` は新規に使わない。** v16で `"use cache"` に置き換えられた扱いで、公式ドキュメントに移行推奨の注記がある(廃止はされていないが非推奨)。([nextjs.org/docs/app/api-reference/functions/unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache))
8. **Route Handler の `GET` はデフォルトで動的(非キャッシュ)。** v15.0.0-RC(2024年)以降この挙動で、v16でも変更なし。`export const runtime = 'nodejs'` は書かなくてよい(デフォルトが `nodejs`)。静的化したい時だけ `export const dynamic = 'force-static'` を書く。([nextjs.org/docs/app/api-reference/file-conventions/route-segment-config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config))
9. **Turbopack は dev/build ともデフォルト(v16.0.0〜)。** webpackを使いたい場合のみ `--webpack` で明示オプトアウトする。webpack独自設定がある状態で素の `next build` を叩くとビルド失敗する仕様。([nextjs.org/blog/next-16](https://nextjs.org/blog/next-16))
10. **Node.js 20.9+ / TypeScript 5.1+ が最低要件。** v16.0.0で引き上げ。Node.js 18は非サポート。([nextjs.org/blog/next-16](https://nextjs.org/blog/next-16))
11. **`revalidateTag()` は第2引数(`cacheLife`プロファイル)必須になった。** read-your-writes が必要なら新API `updateTag()`(Server Actions専用)を使う。([nextjs.org/docs/app/guides/upgrading/version-16](https://nextjs.org/docs/app/guides/upgrading/version-16))
12. **standalone出力(`output: 'standalone'`)でDocker化する場合、`next start` は使わない。** `.next/standalone/server.js` を直接 `node` で起動し、`public/` と `.next/static/` を手動でコピーする。([nextjs.org/docs/.../output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output))
13. **AGENTS.md を書くなら「常時ロードされる索引」として使う。** Vercelの実測で、Skillsは56%のケースで一度も呼ばれず、AGENTS.mdに直接埋め込んだ場合はビルド/リント/テストの合格率が100%だった(Baseline 53%)。([vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals), 2026-01-27公開)
14. **Claude Code は `AGENTS.md` を自動では読まない。** `CLAUDE.md` からの `@AGENTS.md` インポート(または symlink)が公式の回避策。([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory))
15. **`CLAUDE.md` は1ファイル200行未満を目安にし、複数手順の作業や一部ディレクトリにしか関係ない指示は Skill か `.claude/rules/` の path-scoped ルールに逃がす。** これは公式ドキュメントの推奨。([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory))
16. **モノレポでは AGENTS.md をネストして配置できる。** ディレクトリツリー上で最も近いファイルが優先される(agents.md公式サイトの記載)。OhMyCMSなら将来 `apps/studio/AGENTS.md` を作る選択肢がある(現時点では未導入)。([agents.md](https://agents.md/))

---

## 2. AGENTS.md の調査結果(調査1)

### 2.1 Vercelブログ: "AGENTS.md outperforms Skills in our agent evals"

- 出典: https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- 公開日: **2026年1月27日**、著者 Jude Gao

**比較対象**: Next.js 16 を題材に、以下4パターンを比較した。

| 構成 | 内容 |
|---|---|
| Baseline | ドキュメントなし |
| Skill(デフォルト動作) | Next.js docs を Skill 化し、エージェントの自発呼び出しに任せる |
| Skill + explicit instructions | 「Explore project first, then invoke skill」という明示指示を追加 |
| AGENTS.md docs index | 8KB に圧縮した docs インデックスを `AGENTS.md` に直接埋め込み |

対象API: モデルの学習データにまだ含まれていない(=知識カットオフ後に追加された)Next.js 16 の新API群 — `connection()`、`'use cache'`、`cacheLife()`、`cacheTag()`、`forbidden()`、`unauthorized()`、`proxy.ts`、非同期 `cookies()`/`headers()`、`after()`、`updateTag()`、`refresh()`。

**Eval**: Build / Lint / Test の3カテゴリで測定。「with retries to rule out model variance」との記述はあるが、**具体的なリトライ回数・使用モデル名・タスク総数(N)は記事中に明記されていない(未確認)**。

**結果(記事の原文数値)**:

| 構成 | Pass Rate(総合) | Build | Lint | Test |
|---|---|---|---|---|
| Baseline | 53% | 84% | 95% | 63% |
| Skill(デフォルト) | 53% | 84% | 89% | 58% |
| Skill + explicit instructions | 79% | 95% | 100% | 84% |
| **AGENTS.md** | **100%** | **100%** | **100%** | **100%** |

追加の重要データ(原文引用):
> "In 56% of eval cases, the skill was never invoked."
> "This improved the trigger rate to 95%+ and boosted the pass rate to 79%."(explicit instructions追加後)

指示文言による挙動差(原文の表内容): 「"You MUST invoke the skill"」という強い文言だと docs を先読みしてパターンに引きずられ、プロジェクト固有の文脈を見落とす。逆に「"Explore project first, then invoke skill"」の方が良い結果だった。

**AGENTS.mdが優位だった理由(記事の仮説、原文引用)**:
> "No decision point. With AGENTS.md, there's no moment where the agent must decide 'should I look this up?' The information is already present."
> "Consistent availability. Skills load asynchronously and only when invoked. AGENTS.md content is in the system prompt for every turn."
> "No ordering issues. Skills create sequencing decisions (read docs first vs. explore project first). Passive context avoids this entirely."

**具体的な作法(記事内の全文抜き出し)**:

- セットアップコマンド: `npx @next/codemod@canary agents-md`
  - 原文: "This command does three things: 1. Detects your Next.js version 2. Downloads matching documentation to .next-docs/ 3. Injects the compressed index into your AGENTS.md"
- 圧縮インデックスのフォーマット例:
  ```
  [Next.js Docs Index]|root: ./.next-docs
  |IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning
  |01-app/01-getting-started:{01-installation.mdx,...}
  ```
- 埋め込む重要指示文: "IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any Next.js tasks."
- Skillを併用するなら指示文言は "Explore project first, then invoke skill" が良い(「invoke first」的な文言だと `next.config.ts` の変更見落としなど結果にばらつきが出た)。

**Skillsが有利なケース(原文引用)**:
> "Skills work better for vertical, action-specific workflows that users explicitly trigger, like 'upgrade my Next.js version,' 'migrate to the App Router,' or applying framework best practices."

補足裏取り(二次情報、参考程度): aihola.com、jpcaparas.medium.com が同じ数値(53%/79%/100%、56%)を報じている。

### 2.2 agents.md の仕様

- 出典: https://agents.md/ / 公式GitHub: https://github.com/agentsmd/agents.md

**フォーマット**: 標準的なMarkdownのみ。特別なフロントマターは不要。

**配置場所・スコープ・ネストルール**:
- 基本はリポジトリルート。
- モノレポでは「Large monorepo? Use nested AGENTS.md files for subprojects」— サブプロジェクトごとにネスト配置可能。
- 優先順位: 「Agents automatically read the nearest file in the directory tree, so the closest one takes precedence」— ディレクトリツリー上で最も近いファイルが優先。

**対応ツール一覧(公式サイト記載を転記)**: OpenAI Codex、Google Jules、Factory、Aider、goose、opencode、Zed、Warp、VS Code、Devin(Cognition)、UiPath Autopilot & Coded Agents、JetBrains Junie、Amp、Cursor、RooCode、Google Gemini CLI、Kilo Code、Phoenix、Semgrep、GitHub Copilot Coding agent、Ona、Cognition Windsurf、Augment Code。

**この一覧に Claude Code(Anthropic)は含まれていない**(§2.3参照)。

**策定・公開の背景**:
- agents.md公式サイト: 「AGENTS.md emerged from collaborative efforts across the AI software development ecosystem, including OpenAI Codex, Amp, Jules from Google, Cursor, and Factory.」
- 標準としての正式化は2025年8月、OpenAI主導・Google/Cursor/Factory参加(複数の一次情報から裏取り)。
- **2025年12月9日**、Linux Foundation傘下の新財団「Agentic AI Foundation(AAIF)」が発足し、AGENTS.md は MCP(Anthropic提供)・goose(Block提供)と並ぶ基幹プロジェクトとして寄贈された。出典: [Linux Foundation公式](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) / [OpenAI公式](https://openai.com/index/agentic-ai-foundation/) / [Block公式ブログ](https://block.xyz/inside/block-anthropic-and-openai-launch-the-agentic-ai-foundation)(タイトルに "Block, Anthropic, and OpenAI Launch the Agentic AI Foundation" とあり、**Anthropicも共同ローンチに関与**)。発足時点で150社以上が参加。

### 2.3 Claude Code と CLAUDE.md / AGENTS.md の関係

- 出典(公式): https://code.claude.com/docs/en/memory

**結論: Claude Code は AGENTS.md をネイティブには読まない(2026-08-13時点)。**

公式ドキュメントの一節(原文):
> "Claude Code reads `CLAUDE.md`, not `AGENTS.md`. If your repository already uses `AGENTS.md` for other coding agents, create a `CLAUDE.md` that imports it so both tools read the same instructions without duplicating them. You can also add Claude-specific instructions below the import."

つまり CLAUDE.md と AGENTS.md は自動併読・自動優先順位にはならない。公式に案内されている回避策:

1. `CLAUDE.md` に `@AGENTS.md` の import 一行を書き、その下に Claude 固有指示を追記:
   ```markdown
   @AGENTS.md

   ## Claude Code
   Use plan mode for changes under `src/billing/`.
   ```
2. シンボリックリンク `ln -s AGENTS.md CLAUDE.md`(Windowsは管理者権限が必要なため import 推奨)。

補足: `/init` コマンドに `CLAUDE_CODE_NEW_INIT=1` を設定すると、`AGENTS.md`・`.devin/rules/`・`.windsurf/rules/`・`.clinerules` 等も読み取って `CLAUDE.md` 生成に取り込む。`/import` コマンド(**Claude Code v2.1.213以降**)で他ツールの設定ファイルを一度きり `CLAUDE.md` に取り込むことも可能。

コミュニティ要望(未実装、参考情報):
- GitHub Issue [#6235](https://github.com/anthropics/claude-code/issues/6235)「Support AGENTS.md」(2025-08-21作成、Open)
- GitHub Issue [#34235](https://github.com/anthropics/claude-code/issues/34235)(2026-03-14作成、Open、#6235のduplicate扱い)
- いずれもAnthropicスタッフの公式コメントは確認できず(**未確認**: コメント欄の完全取得はできていない可能性あり)。

**CLAUDE.md の仕様(公式ドキュメント要点)**:

配置場所とロード順(広い順):

| スコープ | 配置場所 | 用途 |
|---|---|---|
| Managed policy | 各OSの管理者領域 | 組織全体の強制指示 |
| User instructions | `~/.claude/CLAUDE.md` | 全プロジェクト共通の個人設定 |
| Project instructions | `./CLAUDE.md` または `./.claude/CLAUDE.md` | チーム共有のプロジェクト指示 |
| Local instructions | `./CLAUDE.local.md` | 個人用・`.gitignore`対象 |

- 作業ディレクトリから上位に向かって探索し、発見した全ファイルを**連結(上書きでなく合算)**。サブディレクトリの CLAUDE.md はオンデマンドロード。
- import構文 `@path/to/file`(相対/絶対両対応、再帰は**最大4階層**まで)。コードブロック内の `@path` はインポートされない。
- プロジェクト外を指す external import は初回に承認ダイアログが出る。
- ベストプラクティス(原文): 「target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence.」
- 「CLAUDE.md content is delivered as a user message after the system prompt, not as part of the system prompt itself.」— CLAUDE.mdはシステムプロンプトの一部ではなく、セッション開始時にユーザーメッセージとして投入される。この技術的位置づけは Vercel記事の「AGENTS.mdは毎ターンのsystem promptに存在する」という説明とは厳密には異なる表現である点に注意。
- Skillsとの役割分担(原文): 「If an entry is a multi-step procedure or only matters for one part of the codebase, move it to a skill or a path-scoped rule instead.」。Skillsは「only load when you invoke them or when Claude determines they're relevant to your prompt」(条件付きロード)。

---

## 3. Next.js 16 の変更点表(調査2)

| # | 項目 | v15までの状態 | v16(16.2.12まで)の状態 | 移行の要否 | 出典 |
|---|---|---|---|---|---|
| 1 | middleware.ts | `middleware.ts` + `export function middleware`、Edge runtime | `proxy.ts` + `export function proxy` に改称。v16.0.0-beta.0(2025-10-10)で発表、v16.0.0(2025-10-22)で正式導入。runtimeは**Node.js固定・変更不可**。middleware.tsは今も動くがdeprecated、将来削除予定。Edge runtimeが必要なら当面middleware.tsのまま | 要(codemod `middleware-to-proxy` あり) | [next-16](https://nextjs.org/blog/next-16) / [proxy docs](https://nextjs.org/docs/app/getting-started/proxy) / [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| 2 | `"use cache"` | v15.0.0(2024年)でexperimental導入 | v16.0.0でCache Components機能とともに有効化。**`cacheComponents: true` の明示的opt-inが必要**(デフォルトfalse)。有効化するとPPRがApp Routerのデフォルト挙動になる | 要(オプトイン判断) | [use-cache](https://nextjs.org/docs/app/api-reference/directives/use-cache) / [cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) |
| 3 | `unstable_cache` | v14.0.0で導入、v15まで主要手段 | 非推奨。ドキュメント冒頭: 「This API has been replaced by `use cache` in Next.js 16.」削除はされていない | 推奨(新規コードでは使わない) | [unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) |
| 4 | `experimental.dynamicIO` / `experimental.useCache` / `experimental.ppr` / `experimental_ppr` | 個別フラグ | v16.0.0で削除、`cacheComponents` に統合(codemod `remove-experimental-ppr` あり) | 要 | [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| 5 | `revalidateTag()` | 単一引数(タグ名のみ) | v16.0.0で**第2引数(`cacheLife`プロファイル)が実質必須**の破壊的変更。read-your-writesには新API `updateTag()`(Server Actions専用) | 要 | [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| 6 | `params` / `searchParams` | v15.0.0で同期→非同期(Promise)化(**破壊的変更**、一時的な同期互換パスあり) | v16で同期アクセスの互換パスを完全撤廃。`opengraph-image`等の画像生成関数の`params`/`id`、`sitemap`の`id`もPromise化 | 要(codemod `next-async-request-api`) | [v15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15) / [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| 7 | `serverExternalPackages` | v15.0.0で `experimental.serverComponentsExternalPackages` から改称・安定化 | v16で変更なし(v15.0.0仕様のまま維持) | 不要(v15で完了済み) | [serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages) |
| 8 | Route Handler `GET` のキャッシュ | v15.0.0-RCで「デフォルト静的→デフォルト動的」に変更 | v16でも同じ(デフォルト動的)。`runtime`のデフォルトは`'nodejs'`(`edge`はdeprecated) | 不要(v15で完了済み) | [route.js](https://nextjs.org/docs/app/api-reference/file-conventions/route) / [route-segment-config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config) |
| 9 | Turbopack(dev) | 段階的導入(v13〜) | v16.0.0(2025-10-22)で**安定・デフォルト** | 不要(既定で有効) | [next-16](https://nextjs.org/blog/next-16) |
| 10 | Turbopack(build) | experimental | v16.0.0で**安定・デフォルト**。webpack独自設定があると素の`next build`は失敗、`--webpack`で明示オプトアウトが必要 | 要確認(webpack設定の有無) | [next-16](https://nextjs.org/blog/next-16) / [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| 11 | Turbopack File System Caching | なし | v16.0.0でbeta導入。dev/build双方でデフォルト有効の方向に進行中(`turbopackFileSystemCache`で制御) | 任意 | [next-16](https://nextjs.org/blog/next-16) |
| 12 | `adapterPath` | なし | v16.0.0でalpha導入、**v16.2.0でトップレベル安定オプション**に昇格 | 任意 | cacheComponents docs内記載 |
| 13 | Node.js最小要件 | 18.18以降(旧要件) | **20.9.0(LTS)以降**。Node.js 18非サポート | 要 | [next-16](https://nextjs.org/blog/next-16) |
| 14 | TypeScript最小要件 | — | **5.1.0以降** | 要確認(本PJはtypescript ^5でOK) | [next-16](https://nextjs.org/blog/next-16) |
| 15 | AMP support | 対応 | **完全削除**(`useAmp`等) | 該当時のみ | [next-16](https://nextjs.org/blog/next-16) |
| 16 | `next lint` | 提供 | **削除**。Biome/ESLint直接利用へ(codemod `next-lint-to-eslint-cli`) | 要確認(本PJはeslint直呼びなので影響小) | [next-16](https://nextjs.org/blog/next-16) |
| 17 | `serverRuntimeConfig` / `publicRuntimeConfig` | 提供 | **削除**。`.env`環境変数を使用 | 要 | [next-16](https://nextjs.org/blog/next-16) |
| 18 | `next/legacy/image` | 提供 | 非推奨。`next/image`推奨 | 推奨 | [next-16](https://nextjs.org/blog/next-16) |
| 19 | `images.domains` | 提供 | 非推奨。`images.remotePatterns`推奨 | 推奨 | [next-16](https://nextjs.org/blog/next-16) |
| 20 | `images.minimumCacheTTL`既定値 | 60秒 | **4時間(14400秒)** | 要確認(挙動変化) | [next-16](https://nextjs.org/blog/next-16) |
| 21 | `images.qualities`既定値 | `[1..100]`全許容 | **`[75]`のみ** | 要確認 | [next-16](https://nextjs.org/blog/next-16) |
| 22 | `images.dangerouslyAllowLocalIP` | — | ローカルIP最適化を既定でブロック(SSRF対策) | 該当時のみ | [next-16](https://nextjs.org/blog/next-16) |
| 23 | `unstable_rootParams()` | 提供 | **削除**。`next/root-params`を使用(v16 upgrade guide原文で代替明記) | 該当時のみ | [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| 24 | `unstable_`プレフィックスAPI群 | 提供 | 多くが `unstable_` を外した正式名に(例: `unstable_cacheTag`→`cacheTag`。codemod `remove-unstable-prefix`あり) | 該当時のみ | [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| 25 | Parallel Routes `default.js` | 任意 | **全スロットで必須**(無いとビルド失敗) | 該当時のみ | [next-16](https://nextjs.org/blog/next-16) |
| 26 | React最小バージョン | React 18/19 | `next@16.2.12`のpeerDependencies実測: `"react": "^18.2.0 \|\| 19.0.0-rc-de68d2f4-20241204 \|\| ^19.0.0"`。App Router新機能(View Transitions, `useEffectEvent`, `Activity`)にはReact 19.2系Canaryが必要 | 本PJは19.2.4で満たす | npm registry実測 / [next-16](https://nextjs.org/blog/next-16) |
| 27 | Server Actions呼称 | Server Action | 公式は「Server Function」を上位概念とし、mutation用途を「Server Action」と呼ぶ整理に | 用語変更のみ | [mutating-data](https://nextjs.org/docs/app/getting-started/mutating-data) |
| 28 | `useFormState` | 提供 | React19で`useActionState`に置換。`useFormState`はまだ動くがdeprecated | 推奨 | [v15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15) |

---

## 4. セルフホスト / Docker の手順

出典: [next.config.js output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) / [deploying](https://nextjs.org/docs/app/getting-started/deploying) / [self-hosting](https://nextjs.org/docs/app/guides/self-hosting) / 公式サンプル [`vercel/next.js/tree/canary/examples/with-docker`](https://github.com/vercel/next.js/tree/canary/examples/with-docker)(2026-08-13時点canaryブランチ実測)

### 4.1 `output: 'standalone'` の挙動

公式原文:
> "Next.js can automatically create a `standalone` folder that copies only the necessary files for a production deployment including select files in `node_modules`... This will create a folder at `.next/standalone` which can then be deployed on its own without installing `node_modules`. Additionally, a minimal `server.js` file is also output which can be used **instead of `next start`**."

- standalone出力を使う場合、`next start` ではなく `node .next/standalone/server.js` を実行する。
- `public/` と `.next/static/` はデフォルトでコピーされない(CDN配信前提のため)。手動コピーが必要:
  ```bash
  cp -r public .next/standalone/
  cp -r .next/static .next/standalone/.next/
  ```

### 4.2 Dockerfile(公式サンプルの要点転記)

3ステージビルド(dependencies → builder → runner)、非root `node` ユーザーで実行:

```dockerfile
ARG NODE_VERSION=24.13.0-slim
FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN ... npm ci / yarn install --frozen-lockfile / pnpm install --frozen-lockfile ...

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build / yarn build / pnpm build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME="0.0.0.0"
COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir .next && chown node:node .next
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

OhMyCMSはpnpmモノレポ(`apps/studio`配下がNext.js本体)のため、そのまま流用する場合は `WORKDIR`/`COPY`のパスを `apps/studio` 基準に調整し、pnpm workspaceのインストール(`pnpm install --frozen-lockfile`をルートで実行してから `pnpm --filter @ohmycms/studio build`)に置き換える必要がある。**この「pnpmモノレポでのstandalone配置調整」自体は公式サンプルに直接の記載がなく未確認**(標準的なNext.jsのmonorepo docs [`nextjs.org/docs/app/guides/multi-zones`など]の追加確認が必要)。

### 4.3 セルフホストの注意点(`guides/self-hosting`原文ベース)

- リバースプロキシ推奨: 「it's recommended to use a reverse proxy (like nginx) in front of your Next.js server rather than exposing it directly to the internet.」
- Image Optimizationは`next start`でゼロコンフィグ動作。glibc系Linuxでは`sharp`のメモリ設定に追加調整が必要な場合がある。
- Proxy(旧middleware)も`next start`利用時はゼロコンフィグ。**static exportでは非サポート**。
- キャッシュ: デフォルトはファイルシステム(ディスク)キャッシュ。複数インスタンス/エフェメラルコンピュートでは`cacheHandler`のカスタム実装(Redis例が公式にあり)が必要。
- マルチインスタンス: Server Functionsの暗号化キー(`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`)を全インスタンスで統一する必要がある(でないと"Failed to find Server Action"エラー)。`deploymentId`設定でバージョンスキュー対策。
- Cache Componentsは「works by default with Next.js and is not a CDN-only feature. This includes deployment as a Node.js server (through `next start`) and when used with a Docker container.」— Dockerでも問題なく動作する旨が明記。

---

## 5. 未確認事項

- Vercel eval記事: 使用モデル名、タスク総数(N)、正確なリトライ回数(記事に記載なし)
- Anthropic公式が「Claude CodeでAGENTS.mdをネイティブサポートする予定があるか」の表明(2026-08-13時点で見つからず。GitHub Issue #6235 / #34235 は Open だがスタッフの公式回答は確認できていない。コメント欄を完全取得できていない可能性もあり)
- agents.md公式GitHubリポジトリのREADME原文の完全逐語引用(公式サイト本文からの引用は取得済みだが、GitHub上のREADME.md原文そのものとの完全一致は未照合)
- middleware.tsを使い続けた場合に**ビルド/実行時に実際に非推奨警告ログが出力されるか**の一次情報記述(見つからず)
- v16.1.0(2025-12-18)・v16.2.0(2026-03-18)個別リリースのコミット単位の変更点精査(大枠の把握に留まる)
- serverExternalPackagesの自動検出パッケージリストの2026-08-13時点での完全一致確認(ドキュメントスナップショットは2025-12-05時点)
- **本PJ(pnpmモノレポ)でstandalone出力のDocker化を行う際の、公式モノレポ対応ドキュメントとの突き合わせ**(§4.2末尾)
- Turbopack File System Cachingがv16.2.12時点で「betaのまま」か「安定化済み」かの明確なステータス文言(進行中である旨は確認できたが確定ステータスの一次記述は未確認)

---

## 6. 参考URL一覧

### AGENTS.md / Claude Code 関連
- https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals (2026-01-27)
- https://agents.md/
- https://github.com/agentsmd/agents.md
- https://code.claude.com/docs/en/memory
- https://github.com/anthropics/claude-code/issues/6235
- https://github.com/anthropics/claude-code/issues/34235
- https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation
- https://openai.com/index/agentic-ai-foundation/
- https://block.xyz/inside/block-anthropic-and-openai-launch-the-agentic-ai-foundation

### Next.js 16 関連
- https://nextjs.org/blog/next-16
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://nextjs.org/docs/app/guides/upgrading/version-15
- https://nextjs.org/docs/app/guides/upgrading/codemods
- https://nextjs.org/docs/app/getting-started/proxy
- https://nextjs.org/docs/app/api-reference/file-conventions/route
- https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
- https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
- https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
- https://nextjs.org/docs/app/api-reference/directives/use-cache
- https://nextjs.org/docs/app/api-reference/functions/unstable_cache
- https://nextjs.org/docs/app/getting-started/mutating-data
- https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- https://nextjs.org/docs/app/getting-started/deploying
- https://nextjs.org/docs/app/guides/self-hosting
- https://github.com/vercel/next.js/releases
- https://github.com/vercel/next.js/releases/tag/v16.0.0
- https://github.com/vercel/next.js/tree/canary/examples/with-docker
