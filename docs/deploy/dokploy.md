# Dokploy へのデプロイ手順（OhMyCMS）

> このリポジトリ（`kanketsu-jp/OhMyCMS`・public）を Dokploy が clone してビルド・起動するまでの手順。
> `clone → build → HTTP 200` はローカルで実測済み（`git archive HEAD` から焼いて 237 本の import 解決・欠落0）。
> Dokploy が clone できれば、この手順どおりでデプロイが通る。

## 0. 前提

| 項目 | 値 |
|---|---|
| デプロイ元リポジトリ | `github.com/kanketsu-jp/OhMyCMS`（public・鍵なしで clone 可） |
| ブランチ | `main` |
| デプロイ方式 | **Docker Compose**（`compose.yml` + `compose.prod.yml`） |
| 公開ポート | `3101`（`STUDIO_PORT`。Traefik/ドメインを前段に置くならそのまま内部で使う） |
| ヘルスチェック | `GET /api/health` → `200` |

- **Dokploy が VPS に入っていること**が前提。未導入なら公式手順（`curl -sSL https://dokploy.com/install.sh | sh`）で入れる。
- public リポジトリなので **GitHub App 連携や deploy key は不要**（Dokploy の「Git」ソースに URL を入れるだけ）。

## 1. Dokploy でアプリを作る（Compose）

1. Dokploy の管理画面 → **Create Service → Compose**。
2. **Source**: `Git` を選び、Repository URL に `https://github.com/kanketsu-jp/OhMyCMS.git`、Branch `main`。
3. **Compose Path**: `compose.yml`。**Additional Compose Files** に `compose.prod.yml` を追加（`OHMYCMS_SETUP_PASSWORD` を必須にする上書き）。
   - Dokploy が複数ファイル指定に対応していない場合は、`compose.yml` を指定し、環境変数で `OHMYCMS_SETUP_PASSWORD` を必ず埋める（`compose.prod.yml` の役割はこれを強制するだけ）。

## 2. 環境変数（Dokploy の Environment に設定）

🚨 **`.env` はリポジトリに含まれない**（git 管理外）。値は Dokploy 側で設定する。

### 必須

| 変数 | 説明 | 例 |
|---|---|---|
| `OHMYCMS_SETUP_PASSWORD` | 初回ログインのパスワード。🚨 **`pass132` のまま公開しない。必ず変更する** | `<強いランダム値>` |
| `OHMYCMS_PUBLIC_URL` | このデプロイの公開 URL。SAML の ACS URL 組み立てに使う。プロキシ配下で必須 | `https://cms.example.com` |
| `POSTGRES_PASSWORD` | 同梱 Postgres のパスワード（既定 `cms` のまま公開しない） | `<強いランダム値>` |

- `DATABASE_URL` は **compose が内部で組み立てる**（`postgres://cms:...@db:5432/cms`）ので、Dokploy 側で手動設定は不要。外部 DB を使う場合のみ上書きする。
- `STUDIO_PORT`（既定 `3101`）/ `POSTGRES_USER` `POSTGRES_DB`（既定 `cms`）は必要に応じて。

### 任意（使う機能だけ）

| 変数 | いつ要るか |
|---|---|
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | ストレージを R2 / GCS / S3 にするとき（4つ揃わないとローカルFSにフォールバック。`S3_REGION=auto` は R2） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth ログインを使うとき |
| `OHMYCMS_UPDATE_FEED_URL` | 更新確認フィードを使うとき |

- SAML(SSO)・メール OTP は **GUI（設定画面）から** IdP メタデータ / SMTP を登録する。環境変数ではない（`OHMYCMS_PUBLIC_URL` だけ要る）。

### 🚨 設定してはいけない

| 変数 | 理由 |
|---|---|
| `ALLOW_DEV_LOGIN` | 開発用バックドア。本番で設定すると認証を素通りできる。**絶対に入れない** |

## 3. デプロイ → 確認

1. Dokploy で **Deploy**。compose が `db`（Postgres 17）→ `migrate`（Knex マイグレーション）→ `studio` の順に起動する。
2. **ドメイン**を割り当て（Dokploy の Domains で `OHMYCMS_PUBLIC_URL` と同じホストを HTTPS で）。
3. **ヘルスチェック**：`https://<ドメイン>/api/health` が `200` を返すこと。
   ```
   curl -sS -o /dev/null -w "%{http_code}" https://<ドメイン>/api/health   # → 200
   ```

## 4. 初回ログイン

1. `https://<ドメイン>/login` を開く。
2. `OHMYCMS_SETUP_PASSWORD` に設定した値を入力。
3. 入るとオンボーディングが始まり、テナント・ロゴ・本来の管理者・SSO などをここで決める。
4. オンボーディングが終わると **この入口は閉じる**（以後は作った管理者でログイン）。

## 5. デプロイ後のセキュリティ確認

- [ ] `OHMYCMS_SETUP_PASSWORD` を `pass132` から変えたか
- [ ] `POSTGRES_PASSWORD` を `cms` から変えたか
- [ ] `ALLOW_DEV_LOGIN` を設定していないか（本番で dev-login が 404 になることを確認）
- [ ] 全ページに `X-Robots-Tag: noindex, nofollow` が返るか（`curl -I` で確認。検索インデックス防止）
- [ ] `OHMYCMS_PUBLIC_URL` が実ドメインと一致しているか（SAML の往復がずれないため）

## 6. 更新（再デプロイ）

`main` に push すると Dokploy が再ビルドする（Auto Deploy を有効にした場合）。`compose` は `migrate` を毎回流すので、新しいマイグレーションも自動で当たる。
