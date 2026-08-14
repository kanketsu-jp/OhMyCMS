# AI ガイド型オンボーディング（ストレージ/Cloudflare 設定の自動化）

> 由来: 2026-08-14 堀池指示。原文:
> 「オンボーディングで OhMyCMS の MCP と連携したら Cloudflare の設定などの手順も教えてくれるように
> なるようにして。もちろんページとしても用意するが、Cloudflare の権限などの設定をしてもらって
> Cloudflare の MCP との連携ができたら、その LLM が OhMyCMS に設定したりを全てできる。」
>
> これは **docs（設計素材）**。決定に落ちたら `knowledge/decisions/` へ要点を移す。

## 何を作るか

OhMyCMS のオンボーディングを **「AI がユーザーの隣で外部サービス設定を案内し、権限が揃えば代わりに設定まで済ませる」** 形にする。最初の対象は **ストレージ（Cloudflare R2）**。

3 つの提供形態を並べる:

1. **読み物ページ（常に用意）** — 誰でも手で辿れる手順ページ（LLM 無しでも完結する）。
2. **OhMyCMS MCP 連携時の対話ガイド** — LLM が OhMyCMS の MCP に繋がると、オンボーディングの
   現在地（未設定の項目）を読み取り、**次にやる手順を会話で教える**（例: R2 トークンの作り方）。
3. **Cloudflare MCP 連携時の自動設定** — ユーザーが Cloudflare 側の権限を与え、Cloudflare の MCP が
   繋がったら、**LLM が R2 バケット作成〜資格情報発行〜OhMyCMS への設定投入までを代行**する。

## 手作業の参照フロー（2026-08-14 に実際に踏んだ手順＝自動化の元ネタ）

この機能は、今回のデプロイで人間＋Claude が手でやった手順をそのまま製品化するもの。順序と落とし穴が既に実測済み:

1. Cloudflare ダッシュボード → R2 → **Create Account API token**（User でなく Account。本番で有効なため）
2. 権限: **Object Read & Write** では**バケット作成ができない**（`AccessDenied`）。
   バケットまで作らせるなら **Admin Read & Write** が要る（実測で確認）。
3. 発行画面の **Access Key ID / Secret Access Key / Endpoint（Default）** を取得（＝S3 資格情報）。
   アカウント ID はダッシュボード URL から取れる（`dash.cloudflare.com/<ACCOUNT_ID>/...`・秘密ではない）。
4. **バケット `ohmycms` を作成**（Admin トークンなら S3 `CreateBucket` で可能。無ければ dashboard で1クリック）。
5. OhMyCMS の env へ写像:
   `S3_ENDPOINT=https://<ACCT>.r2.cloudflarestorage.com` / `S3_REGION=auto` / `S3_BUCKET=ohmycms`
   / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`（4つ揃わないとローカルFSにフォールバック）。
6. **実効性検証**（`@aws-sdk/client-s3`）: `ListBuckets`（認証）→ `CreateBucket`（or 既存）→
   `PutObject`/`GetObject`/`DeleteObject`（読み書き権限）。「動いた」は必ずこの往復で確かめる。

## 設計上の注意（今回の実運用で確定した制約）

- 🚨 **秘密を LLM の文脈（サーバー）に載せない。** 資格情報は「発行画面 → 保管庫（1Password 等）」へ
  ユーザーが直接貼り、LLM は**参照 ID とラベルだけ**を扱う。自動設定するときも**値は表示せず**
  パイプで渡す（`op read | ...`）。OhMyCMS 側の設定投入 API も、値がレスポンス/ログに出ない設計にする。
- 🚨 **最小権限を既定にする。** バケット作成の一度だけ Admin が要るなら、**作成後に Object R&W へ絞る**
  導線を用意する（Admin トークンを常用させない）。
- **冪等に。** 既にバケットがある/設定済みなら「作成済み(OK)」として進める（再実行で壊れない）。
- **検証を必ず内蔵する。** 設定投入したら `PutObject`→`GetObject`→`DeleteObject` の自己テストを走らせ、
  結果をオンボーディングに表示する（`AGENTS.md §4`「curl を表示確認と書かない」と同じ規律）。
- **フォールバックを説明する。** 4 変数が揃わない/検証に落ちたら、ローカルFS のまま進める道を残す。

## スコープ / 段階

- **V1 では手作業**（このデプロイで確立済み）。本機能は **V1 後**。
- 最初の対象を **R2/ストレージ**に絞る。うまくいったら SSO(SAML)・OAuth・SMTP など
  「外部サービスの権限設定 → OhMyCMS へ反映」を同じ型で増やす。
- OhMyCMS 側は既に **MCP を持つ**（F3-F5）。この MCP に「オンボーディングの現在地取得」「設定投入」
  「設定の自己検証」ツールを足すのが実装の入口。

## 関連

- `docs/deploy/dokploy.md`（デプロイ手順）／ `.env.example`（S3_* の意味）
- `knowledge/decisions/secrets-storage-by-recoverability.md`（秘密の置き場）
- `~/.claude/skills/1password-cli/SKILL.md`（秘密を文脈に出さない op 運用・R2 テンプレート）
