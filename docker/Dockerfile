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

# ローカルストレージ (S3 未設定時のフォールバック先)。compose でボリュームを当てる。
RUN mkdir -p /app/.storage && chown -R node:node /app/.storage

USER node
EXPOSE 3000

# slim には curl / wget が無いので Node の fetch で叩く。
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/studio/server.js"]
