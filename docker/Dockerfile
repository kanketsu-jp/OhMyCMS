# syntax=docker/dockerfile:1
#
# OhMyCMS Studio (Next.js 16 / pnpm モノレポ) のマルチステージビルド。
#
# ベースイメージに slim (Debian / glibc) を選んでいる理由:
#   sharp と pg はネイティブ依存を持つ。alpine は musl のため prebuilt binary の
#   取り違えが起きやすい。ホストの Node が v24 系なので同じ系統に揃える。
#
# ステージ:
#   base    共通 (Node + pnpm)
#   deps    lockfile だけを使った依存インストール (キャッシュ層)
#   source  deps + ソース。ここから builder と migrate が分岐する
#   builder next build (output: 'standalone')
#   migrate knex マイグレーション実行専用 (tsx と devDependencies が要るため runner とは別)
#   runner  本番実行イメージ。standalone の成果物だけを持つ

ARG NODE_VERSION=24-slim
ARG PNPM_VERSION=10.33.0

# ---------------------------------------------------------------- base
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /app

# ---------------------------------------------------------------- deps
# package.json / lockfile だけを先に入れて、ソース変更で再インストールされないようにする。
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/studio/package.json ./apps/studio/package.json
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------- source
FROM base AS source
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/studio/node_modules ./apps/studio/node_modules
COPY . .

# ---------------------------------------------------------------- builder
FROM source AS builder
# lib/db/knex.ts が module 直下で DATABASE_URL を読むため、build 中の import で落ちる。
# ここで渡すのはビルドを通すためだけのダミーで、接続はしないし成果物にも残らない。
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
RUN pnpm --filter @ohmycms/studio build

# ---------------------------------------------------------------- sharp
# sharp は serverExternalPackages に入れてある（= バンドルせず実行時 require する）ため、
# next build のファイルトレースだけでは runner に正しく入らない。実測した壊れ方:
#   - /app/apps/studio から require("sharp") が Cannot find module になる
#   - .pnpm には Next 自身が抱える sharp@0.34.5 と libvips 1.2.4 (libvips-cpp.so.8.17.3) だけが入り、
#     アプリが使う sharp@0.35.3 が要求する libvips 1.3.2 (libvips-cpp.so.8.18.3) が無い
#   → ファイルのアップロードと画像変換が 500 になる
# そこで npm で「そのプラットフォーム向けの sharp 一式」を別に作り、runner へ丸ごと入れる。
# バージョンは apps/studio/package.json から読むので二重管理にならない。
FROM source AS sharpdeps
RUN mkdir -p /sharp && cd /sharp \
    && npm init -y > /dev/null \
    && npm install --omit=dev --no-audit --no-fund \
       "sharp@$(node -p "require('/app/apps/studio/package.json').dependencies.sharp")" \
    && node -e "const s=require('/sharp/node_modules/sharp'); console.log('sharp OK / libvips', s.versions.vips)"

# ---------------------------------------------------------------- migrate
# マイグレーションは tsx (devDependency) と lib/db/migrations/*.ts が要るので、
# standalone の runner では実行できない。専用イメージとして分ける。
FROM source AS migrate
USER node
CMD ["pnpm", "--filter", "@ohmycms/studio", "migrate"]

# ---------------------------------------------------------------- runner
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_ROOT=/app/.storage
WORKDIR /app

# node ユーザー (uid 1000) は公式イメージに同梱済み。非 root で実行する。
# standalone は pnpm モノレポの都合でルート基準の構造 (apps/studio/server.js) になる。
COPY --from=builder --chown=node:node /app/apps/studio/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/studio/.next/static ./apps/studio/.next/static
COPY --from=builder --chown=node:node /app/apps/studio/public ./apps/studio/public

# sharp 一式（上の sharpdeps ステージ参照）。standalone の .pnpm と同じ階層へ足す。
COPY --from=sharpdeps --chown=node:node /sharp/node_modules ./node_modules

# Next は sharp を .pnpm 側のパスから require するが、そのトレース結果には
# **共有ライブラリ本体が入っていない**（実測）:
#   .pnpm/@img+sharp-libvips-linux-arm64@1.3.2/.../lib/ に index.js はあるが libvips-cpp.so.8.18.3 が無い
#   （バインディングの .node は運ばれるのに、それがリンクする .so は運ばれない）
#   → require 時に ERR_DLOPEN_FAILED になり、アップロードと画像変換が 500 になる
# 上でクリーンに入れた @img の中身を、**バージョンが完全一致する .pnpm 側のディレクトリにだけ**
# 上書きコピーして埋める。名前でもアーキテクチャでも決め打ちしないので amd64 でも同じ処理で通る。
# バージョン一致を条件にしているのは、Next 自身が抱える別バージョン(例 libvips 1.2.4)を壊さないため。
RUN set -u; \
    for src in /app/node_modules/@img/*; do \
      name="$(basename "$src")"; \
      ver="$(node -p "require('$src/package.json').version")"; \
      dst="/app/node_modules/.pnpm/@img+$name@$ver/node_modules/@img/$name"; \
      if [ -d "$dst" ]; then \
        cp -R "$src"/. "$dst"/; \
        echo "共有ライブラリを補完: $dst"; \
      fi; \
    done; \
    chown -R node:node /app/node_modules

# ローカルストレージ (S3 未設定時のフォールバック先)。compose でボリュームを当てる。
RUN mkdir -p /app/.storage && chown -R node:node /app/.storage

USER node
EXPOSE 3000

# slim には curl / wget が無いので Node の fetch で叩く。
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/studio/server.js"]
