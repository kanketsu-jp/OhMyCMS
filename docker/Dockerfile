# syntax=docker/dockerfile:1
#
# OhMyCMS Studio (Next.js 16 / Bun ワークスペース) のマルチステージビルド。
#
# ベースイメージは oven/bun:1-slim（Debian 13 / glibc）。
#   - node は同梱されていない。ビルドも実行も bun が行う
#   - slim(glibc) にしているのは sharp と pg のネイティブ依存。musl は prebuilt の取り違えが起きやすい
#
# ステージ:
#   base      共通 (bun のみ)
#   deps      lockfile だけを使った依存インストール (キャッシュ層)
#   source    deps + ソース。ここから builder と migrate が分岐する
#   builder   next build (output: 'standalone')
#   migrate   knex マイグレーション実行専用
#   runner    本番実行イメージ。standalone の成果物だけを持ち、bun で起動する

ARG BUN_VERSION=1-slim
# devserver ステージ専用。出荷物には入らない（理由は devserver ステージのコメント参照）。
ARG NODE_FOR_DEV=24-slim

# ---------------------------------------------------------------- base
FROM oven/bun:${BUN_VERSION} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------- deps
# package.json / lockfile だけを先に入れて、ソース変更で再インストールされないようにする。
# ワークスペースの package.json は全部要る（無いと bun がワークスペースを解決できない）。
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/studio/package.json ./apps/studio/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/mcp/package.json ./packages/mcp/package.json
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------- source
FROM base AS source
# 🚨 bun は依存をルートへ hoist せず、**ワークスペースごとの node_modules** に置く
#    （実測: root は lefthook のみ / apps/studio/node_modules に next などが入る）。
#    ルートだけコピーすると next が見つからずビルドが落ちるので、/app ごと持ってくる。
COPY --from=deps /app ./
COPY . .

# ---------------------------------------------------------------- sharp
# sharp は serverExternalPackages に入れてある（= バンドルせず実行時 require する）ため、
# next build のファイルトレースだけでは runner に正しく入らない。
# node_modules の配置方式が変わっても壊れないよう、対象プラットフォーム向けの sharp を
# 別に入れ直して runner へ丸ごと持ち込む。バージョンは apps/studio/package.json から読む。
FROM base AS sharpdeps
COPY apps/studio/package.json /tmp/studio-package.json
RUN mkdir -p /sharp && cd /sharp \
    && echo '{"name":"sharpdeps","private":true}' > package.json \
    && bun add "sharp@$(bun -e 'console.log(require("/tmp/studio-package.json").dependencies.sharp)')" \
    && bun -e 'const s=require("/sharp/node_modules/sharp"); console.log("sharp OK / libvips", s.versions.vips)'

# ---------------------------------------------------------------- builder
FROM source AS builder
# lib/db/knex.ts が module 直下で DATABASE_URL を読むため、build 中の import で落ちる。
# ここで渡すのはビルドを通すためだけのダミーで、接続はしないし成果物にも残らない。
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
# 🚨 next build の externalImport が bun のシンボリックリンク越しに sharp を読めず落ちる
#    （bun -e 'require("sharp")' は通るのに、ビルド中の externalImport だけが
#      Could not load the "sharp" module ... になる）。
#    実体を apps/studio/node_modules 直下へ置いて、リンクを辿らせない。
COPY --from=sharpdeps /sharp/node_modules/sharp ./apps/studio/node_modules/sharp
COPY --from=sharpdeps /sharp/node_modules/@img ./apps/studio/node_modules/@img
RUN cd apps/studio && bun run build

# ---------------------------------------------------------------- devserver
# 受入ハーネス(studio-acc)が使う `next dev` 専用ステージ。**出荷物ではない。**
#
# 🚨 なぜ Node が要るのか（実測）:
#   `next dev`（Turbopack）は serverExternalPackages(knex/pg/sharp) を
#   **ハッシュ付きの内部名**で externalRequire する:
#     Failed to load external module knex-6f520bbc368ae347:
#       Cannot find package 'knex-6f520bbc368ae347'
#   Node ならこの名前を実体へ解決できるが、**bun のリゾルバは解決できない**。
#   本番ビルド(runner)は next build のファイルトレースが実体を運ぶので影響を受けない。
#   → **壊れるのは `next dev` を bun で動かしたときだけ。**
#
# したがってここだけ Node を載せる。**最終イメージ(runner)は oven/bun のままで、Node は入らない**
# （受入基準6b は最終イメージに対する基準）。bun へ寄せる意図は保っている。
FROM node:${NODE_FOR_DEV} AS devserver
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=source /app ./

# ---------------------------------------------------------------- migrate
# マイグレーションは tsx (devDependency) と lib/db/migrations/*.ts が要るので、
# standalone の runner では実行できない。専用イメージとして分ける。
FROM source AS migrate
USER bun
CMD ["bun", "--filter", "@ohmycms/studio", "migrate"]

# ---------------------------------------------------------------- runner
FROM oven/bun:${BUN_VERSION} AS runner
ARG GIT_SHA=unknown
ARG GIT_DIRTY=unknown
# どのコミットから焼いたイメージかを後から確認できるようにする。
# 「稼働中のコンテナが古くて、修正が入っていない状態を検証してしまう」事故の再発防止。
# 読み方: docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' <image>
LABEL org.opencontainers.image.revision=$GIT_SHA
LABEL app.ohmycms.git-dirty=$GIT_DIRTY

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_ROOT=/app/.storage
WORKDIR /app

# bun ユーザー (uid 1000) は公式イメージに同梱済み。非 root で実行する。
# standalone はワークスペースの都合でルート基準の構造 (apps/studio/server.js) になる。
COPY --from=builder --chown=bun:bun /app/apps/studio/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/apps/studio/.next/static ./apps/studio/.next/static
COPY --from=builder --chown=bun:bun /app/apps/studio/public ./apps/studio/public

# sharp 一式（上の sharpdeps ステージ参照）。
COPY --from=sharpdeps --chown=bun:bun /sharp/node_modules ./node_modules

# ローカルストレージ (S3 未設定時のフォールバック先)。compose でボリュームを当てる。
RUN mkdir -p /app/.storage && chown -R bun:bun /app/.storage

USER bun
EXPOSE 3000

# slim には curl / wget が無いので bun の fetch で叩く。
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "apps/studio/server.js"]
