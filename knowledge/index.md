---
type: index
title: Knowledge Index
description: Repository knowledge bundle index.
tags: []
status: draft
generated:
  by: rag-okf
  at: 2026-08-16
verified: []
sources: []
stale_after: 2027-02-08
x_rag_okf:
  id: index
  source_commit: 9388d23
  source_digest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  authorship: deterministic
---

# Knowledge Index

## Entries
- [受入ハーネス（acceptance）](./areas/acceptance.md) — `areas/acceptance`
- [apps/studio（管理画面 + REST API）](./areas/apps-studio.md) — `areas/apps-studio`
- [SAML（SSO）の現状](./areas/auth-sso.md) — `areas/auth-sso`
- [デザインの規約（design-system）](./areas/design-system.md) — `areas/design-system`
- [権限と認可（permissions）](./areas/permissions.md) — `areas/permissions`
- [v1 として何を約束しているか（V1-A〜E）](./areas/v1-scope.md) — `areas/v1-scope`
- [アクションボタンは1つ。表示モードと編集モードを分ける](./decisions/action-button-and-edit-mode.md) — `decisions/action-button-and-edit-mode`
- [指示書は AGENTS.md を正本にする](./decisions/agents-md-as-canonical.md) — `decisions/agents-md-as-canonical`
- [認証は SAML → メール OTP → パスワードの順に使う](./decisions/auth-methods.md) — `decisions/auth-methods`
- [アバターは絵文字にする。メールの頭文字を出さない](./decisions/avatar-is-emoji-not-initials.md) — `knowledge/decisions/avatar-is-emoji-not-initials.md`
- [検査は「何を見ていないか」を言えて初めて検査になる](./decisions/checks-must-declare-blind-spots.md) — `decisions/checks-must-declare-blind-spots`
- [検査は索引を見る。ただし「走査」と「照合」で直し方が違う](./decisions/checks-read-the-index-not-the-worktree.md) — `decisions/checks-read-the-index-not-the-worktree`
- [CLI と MCP は REST API 経由（DB 直接アクセス禁止）](./decisions/cli-mcp-over-rest.md) — `decisions/cli-mcp-over-rest`
- [落ちた走行は、跡ではなく記録で見つける](./decisions/crashed-runs-are-found-by-record-not-by-leftovers.md) — `decisions/crashed-runs-are-found-by-record-not-by-leftovers`
- [DB は PostgreSQL（Cloudflare D1 は撤回）](./decisions/db-postgres.md) — `decisions/db-postgres`
- [ファイルの削除は 2 回消す。順番は「実体 → 行」](./decisions/deleting-a-file-is-two-deletes.md) — `knowledge/decisions/deleting-a-file-is-two-deletes.md`
- [画面に置くものには理由が要る（枠・常設・背景・寸法）](./decisions/every-element-must-earn-its-place.md) — `decisions/every-element-must-earn-its-place`
- [フォルダは「誰かの持ち物」にしない](./decisions/folders-are-not-owned.md) — `decisions/folders-are-not-owned`
- [フォルダは独立した画面を持たない（ファイルの中に畳む）](./decisions/folders-live-inside-files.md) — `decisions/folders-live-inside-files`
- [欄の名前で効く守りは、名前を変えた瞬間に黙って外れる](./decisions/guards-keyed-by-name-break-silently.md) — `decisions/guards-keyed-by-name-break-silently`
- [通信路が HTTPS かどうかを NODE_ENV で決めない](./decisions/https-is-not-node-env.md) — `decisions/https-is-not-node-env`
- [文言検査の範囲は「画面に届くか」で決める。lib/ を丸ごと足さない](./decisions/i18n-check-scope-is-what-reaches-the-screen.md) — `decisions/i18n-check-scope-is-what-reaches-the-screen`
- [i18n はライブラリを使わず自前実装にする](./decisions/i18n-own-implementation.md) — `decisions/i18n-own-implementation`
- [i18n は必須（旧PJの方針を反転）](./decisions/i18n-required.md) — `decisions/i18n-required`
- [原典（idea.md）から意図的に外した 3 件](./decisions/intentional-deviations-from-idea-md.md) — `decisions/intentional-deviations-from-idea-md`
- [設定・スキーマの正本は JSON](./decisions/json-as-source-of-truth.md) — `decisions/json-as-source-of-truth`
- [一覧は「画面」ではなく「切り替えられる表示形式」にする](./decisions/list-views-are-switchable-layouts.md) — `decisions/list-views-are-switchable-layouts`
- [多層で守ると、層ごとの退行が外から見えなくなる](./decisions/layers-hide-each-others-regressions.md) — `decisions/layers-hide-each-others-regressions`
- [migration を足す人は、直前に「他人の未適用分」を確認する](./decisions/migrations-are-shared.md) — `decisions/migrations-are-shared`
- [開発サーバを外部へ公開しない（公開するのは本番ビルドだけ）](./decisions/never-expose-dev-server.md) — `decisions/never-expose-dev-server`
- [Directus をフォークしない](./decisions/no-directus-fork.md) — `decisions/no-directus-fork`
- [面（Surface）は1段まで。入れ子を構造的に禁止する](./decisions/no-nested-surfaces.md) — `decisions/no-nested-surfaces`
- [組織テーブルを作らない](./decisions/no-organization-table.md) — `decisions/no-organization-table`
- [「まだ許可されていない」は、ログイン画面へ送らない](./decisions/not-yet-allowed-is-not-logged-out.md) — `decisions/not-yet-allowed-is-not-logged-out`
- [範囲違いで画面を増やさない／1 件のページは「出すものが在るか」で決める](./decisions/one-list-per-subject-not-one-per-scope.md) — `decisions/one-list-per-subject-not-one-per-scope`
- [ORM は Knex（Prisma / Drizzle は不採用）](./decisions/orm-knex.md) — `decisions/orm-knex`
- [検証用に見えるデータを、名乗りが無いという理由で消さない](./decisions/permanent-fixtures-are-not-junk.md) — `decisions/permanent-fixtures-are-not-junk`
- [ポートは 31xx 帯に寄せ、よく使うポートを避ける](./decisions/port-allocation.md) — `decisions/port-allocation`
- [台が作った利用者は、作った人が id で消す](./decisions/probes-clean-up-by-id.md) — `decisions/probes-clean-up-by-id`
- [リレーションを辿るときも、相手側コレクションの権限を必ず通す](./decisions/relation-permission-boundary.md) — `decisions/relation-permission-boundary`
- [秘密の置き場所は「復元可能性」で決める（ハッシュ化できるものだけ GUI 可）](./decisions/secrets-storage-by-recoverability.md) — `decisions/secrets-storage-by-recoverability`
- [設定は DB が正。env は初期値でしかない](./decisions/settings-db-beats-env.md) — `decisions/settings-db-beats-env`
- [共有ファイルは、窓に自分の行を置かない](./decisions/shared-files-are-not-left-in-the-window.md) — `decisions/shared-files-are-not-left-in-the-window`
- [共有資源（受入ハーネス・Docker・node_modules）は同時に1つしか使わない](./decisions/shared-resources-are-exclusive.md) — `decisions/shared-resources-are-exclusive`
- [ショートカットはエディタのキーバインドと衝突しない](./decisions/shortcuts-must-not-collide-with-editor.md) — `decisions/shortcuts-must-not-collide-with-editor`
- [v0.9 は Next.js 単一アプリ、分離時は Hono](./decisions/single-nextjs-app-then-hono.md) — `decisions/single-nextjs-app-then-hono`
- [ゴミ箱に入れた権限は、許可を出さない（入り口より先に読み手を塞ぐ）](./decisions/soft-deleted-permissions-must-not-grant.md) — `decisions/soft-deleted-permissions-must-not-grant`
- [ゴミ箱に在るものの名前は、空けない](./decisions/soft-deleted-names-stay-taken.md) — `decisions/soft-deleted-names-stay-taken`
- [手順ドキュメントはステップ式で書く。前提を独立させ、スクリーンショットを使わない](./decisions/stepwise-docs.md) — `decisions/stepwise-docs`
- [保管先の安全装置は「実装が実際に使う値」で判定する](./decisions/storage-guard-uses-effective-config.md) — `knowledge/decisions/storage-guard-uses-effective-config.md`
- [保管先のキー設計を固定する（接頭辞は後から変えない）](./decisions/storage-key-prefix-is-fixed.md) — `decisions/storage-key-prefix-is-fixed`
- [保管先の根（STORAGE_LOCAL_ROOT）は環境変数に残す（GUI へ移さない）](./decisions/storage-local-root-is-fixed.md) — `knowledge/decisions/storage-local-root-is-fixed.md`
- [合成 ID は画面に出さない](./decisions/synthetic-ids-are-not-contacts.md) — `decisions/synthetic-ids-are-not-contacts`
- [Tailwind v4 は transform を translate / scale / rotate の 3 つに割った](./decisions/tailwind-v4-transform-is-three-properties.md) — `decisions/tailwind-v4-transform-is-three-properties`
- [通知は「終わったこと」だけトーストへ。直す必要があるものはその場に残す](./decisions/toast-for-events-page-for-what-needs-fixing.md) — `decisions/toast-for-events-page-for-what-needs-fixing`
- [ゴミ箱と復元の画面（箱の形は決める。中に何が並ぶかは未決）](./decisions/trash-and-restore-ui.md) — `decisions/trash-and-restore-ui`
- [90 日の掃除は SQL が正本。TypeScript は薄い口で、ファイルだけが例外](./decisions/trash-purge-is-sql-first.md) — `decisions/trash-purge-is-sql-first`
- [ツリーの接続線は「肘」と「通し線」を分けて描く](./decisions/tree-connector-lines.md) — `decisions/tree-connector-lines`
- [二階建て認証（人間とエージェントを分ける）](./decisions/two-tier-auth.md) — `decisions/two-tier-auth`
- [UI の置き場所は「操作の頻度」で決める](./decisions/ui-placement-by-frequency.md) — `decisions/ui-placement-by-frequency`
- [アップロードの上限は 2 つある。同じ文言で語らない](./decisions/upload-limits-are-two-not-one.md) — `knowledge/decisions/upload-limits-are-two-not-one.md`
- [middleware.ts でなく proxy.ts を使う](./decisions/use-proxy-not-middleware.md) — `decisions/use-proxy-not-middleware`
- [利用者の表は 1 本の入口から開き、内部列はコード側で断る](./decisions/user-tables-have-one-entrance.md) — `decisions/user-tables-have-one-entrance`
- [v0.9 時点で堀池が決めた 6 件](./decisions/v09-open-questions-answered.md) — `decisions/v09-open-questions-answered`
- [否定形の検証は「検出できること」を先に確かめる](./decisions/verify-the-verifier.md) — `decisions/verify-the-verifier`
- [hrdr による多ペイン運用（司令塔 + トラックA/B/C）](./ops/hrdr-panes.md) — `ops/hrdr-panes`
- [cms](./project.md) — `project`

## 根拠アーカイブについて（このリポジトリには入っていない）

`knowledge/decisions/*` の `## 根拠` は、前身プロジェクトの知見アーカイブ
`.temp/2026-08-13/knowledge-historys/`（ai-native-cms / directus-mscl / izukurasan）を
参照していることがある。**このアーカイブは意図的にコミットしていない。**

理由: 過去のセッションログを含み、そこに**調査用の管理トークンが平文で残った実例がある**ため
（`directus-mscl/README.md` に記録あり）。秘密が混入しうるものをチーム共有のリポジトリへ入れない。

- 判断の**中身**は各 decision ファイル本文へ転記済みなので、アーカイブが無くても読める
- アーカイブ本体は堀池のローカル（`.temp/`）にのみ存在する
