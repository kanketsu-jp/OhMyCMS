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
#   gitinfo   .git から版情報を抽出し、小さなテキストファイルだけ runner へ渡す
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
COPY --exclude=.git . .

# ---------------------------------------------------------------- gitinfo
# .git から commit / dirty / ビルド時刻を抽出する専用ステージ。
# 🚨 このステージだけが .git を扱う。抽出した値（3つの小さなテキストファイル）だけを
#    runner ステージへ渡し、.git 自体は他のどのステージ・最終イメージにもコピーしない。
#    .dockerignore は .git を除外しなくなったが、source 側は COPY --exclude=.git で
#    引き続き .git を持ち込まない。
FROM base AS gitinfo
ARG GIT_SHA=unknown
ARG GIT_DIRTY=unknown
ARG BUILD_TIME=unknown
WORKDIR /app
# dirty 判定には作業ツリーも必要なので、この一時ステージ内だけにソースと .git を置く。
# dirty の内訳は /api/health に出さず、ビルドログへだけ出す。health は認証なしで読めるため、
# ビルド機のファイル名一覧を公開面へ出さない。ログは押した人が見られ、出すのはパス名だけで内容は出さない。
#
# 🚨 **この旗が何を見ているかの実測（2026-08-15）。読む前に足さないこと。**
#    本番の commit を clean clone した文脈でこのステージを実際にビルドして測った結果:
#      🟢 綺麗なツリー                       → dirty=0
#      🔴 追跡ファイルを1行書き換える          → dirty=1（内訳もログに出る）
#      🟢 .gitignore に載るファイルを置く      → dirty=0
#      🚨 **追跡ファイルを消す                → dirty=0（＝検出できない）**
#    最後のが**既知の穴**。下の skip-worktree ループは
#    「.dockerignore で文脈から外れた追跡ファイル」を吸収するためのものだが、
#    **本当に消されたファイルとの区別が付かない**（文脈は元から「絞られた複製」なので、
#    「無い」の理由がステージの中からは分からない）。
#    → 消えたことまで見たいなら、**文脈から追跡ファイルを外すのをやめる**しかない
#      （外れているのは .claude/**=16 と .dockerignore=1 と compose.yml=1 と .gitignore=1 の
#        **合わせて 19 本**。`git ls-files -- .claude .dockerignore compose.yml .gitignore | wc -l`。
#        🚨 .gitignore を数え忘れると 18 本になる）。
#    ❌ 穴を埋めるつもりで skip-worktree を消さないこと。消すとその 19 本が全部 " D" で復活し、
#      **綺麗なツリーでも常に dirty=1** になる（＝旗が常に立ち、誰も見なくなる）。
#      （守り手: apps/studio/scripts/check-build-info-guards.mjs ／ lefthook の build-info-guards）
COPY . .
RUN set -eu; \
    if [ -e .git ]; then \
      apt-get update -qq && apt-get install -y -qq --no-install-recommends git \
        && rm -rf /var/lib/apt/lists/*; \
      DETECTED_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"; \
      if [ "$DETECTED_SHA" != "unknown" ]; then \
        git ls-files | while IFS= read -r tracked; do \
          if [ ! -e "$tracked" ]; then git update-index --skip-worktree -- "$tracked" 2>/dev/null || true; fi; \
        done; \
        if [ -n "$(git status --porcelain 2>/dev/null)" ]; then \
          DETECTED_DIRTY=1; \
          echo "=== gitinfo: dirty=1 の内訳（先頭50行） ==="; \
          git status --porcelain 2>/dev/null | head -50; \
          echo "--- gitinfo: 記号ごとの件数（?? 未追跡 /  M 変更 /  D 削除） ---"; \
          git status --porcelain 2>/dev/null | cut -c1-2 | sort | uniq -c | sort -rn; \
          echo "--- gitinfo: 権限ビットだけの変更ならここに mode change が出る ---"; \
          git diff --summary 2>/dev/null | head -20; \
          echo "=== gitinfo: 内訳ここまで ==="; \
        else \
          DETECTED_DIRTY=0; \
        fi; \
      else \
        DETECTED_DIRTY=unknown; \
      fi; \
    else \
      DETECTED_SHA=unknown; \
      DETECTED_DIRTY=unknown; \
    fi; \
    if [ "$DETECTED_SHA" != "unknown" ]; then FINAL_SHA="$DETECTED_SHA"; else FINAL_SHA="$GIT_SHA"; fi; \
    if [ "$DETECTED_DIRTY" != "unknown" ]; then FINAL_DIRTY="$DETECTED_DIRTY"; else FINAL_DIRTY="$GIT_DIRTY"; fi; \
    if [ "$DETECTED_DIRTY" != "unknown" ]; then DIRTY_SOURCE="このステージの中で判定"; \
    else DIRTY_SOURCE="判定できず → 外から渡された GIT_DIRTY をそのまま採用（この値はビルドしたツリーについて何も言っていない）"; fi; \
    echo "=== gitinfo: sha=$FINAL_SHA dirty=$FINAL_DIRTY ==="; \
    echo "=== gitinfo: dirty の出どころ = $DIRTY_SOURCE ==="; \
    if [ "$BUILD_TIME" != "unknown" ]; then FINAL_BUILT_AT="$BUILD_TIME"; else FINAL_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; fi; \
    printf '%s' "$FINAL_SHA" > /tmp/GIT_SHA; \
    printf '%s' "$FINAL_DIRTY" > /tmp/GIT_DIRTY; \
    printf '%s' "$FINAL_BUILT_AT" > /tmp/BUILD_TIME; \
    rm -rf ./.git

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
ARG GIT_SHA=unknown
# 受入ハーネスが「どの版のコードを焼いたコンテナを測ったか」を出せるようにする。
# 🚨 studio-acc は COPY . . でビルド時のコードを焼き込む（マウントではない）ので、
#    リポジトリの HEAD と中身が一致するとは限らない。だから対象側から名乗らせる。
ENV NEXT_TELEMETRY_DISABLED=1
# 🚨 ENV の継続行（\）の中では ARG が展開されなかった（実測: 空文字になる）。単独行で書く。
ENV OHMYCMS_GIT_COMMIT=$GIT_SHA
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
ARG BUILD_TIME=unknown
# どのコミットから焼いたイメージかを後から確認できるようにする。
# 「稼働中のコンテナが古くて、修正が入っていない状態を検証してしまう」事故の再発防止。
# 読み方: docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' <image>
LABEL org.opencontainers.image.revision=$GIT_SHA
LABEL app.ohmycms.git-dirty=$GIT_DIRTY
# /api/version が「どの版が動いているか」を返せるように、実行時にも渡す。
# ラベルは docker inspect でしか読めないが、これは**アプリから見える**ので
# 受入ハーネスが「測った対象の版」を出せる（sdk の依頼）。
ENV OHMYCMS_GIT_COMMIT=$GIT_SHA
# /api/health(認証不要)が「どの版が動いているか」を機械判定できるように、実行時にも渡す。
# 起動時には gitinfo が .git から抽出した値で上書き export する。
# Docker の LABEL / ENV はファイル内容を読めないため、docker inspect の LABEL は ARG 由来のまま。
# つまり /api/health は実測値、LABEL は ARG が渡された場合だけ正確、という非対称がある。
ENV OHMYCMS_GIT_DIRTY=$GIT_DIRTY
ENV OHMYCMS_BUILT_AT=$BUILD_TIME

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

# gitinfo が .git から抽出した小さな版情報ファイルだけを持ち込む。
COPY --from=gitinfo --chown=bun:bun /tmp/GIT_SHA /app/.build-info/GIT_SHA
COPY --from=gitinfo --chown=bun:bun /tmp/GIT_DIRTY /app/.build-info/GIT_DIRTY
COPY --from=gitinfo --chown=bun:bun /tmp/BUILD_TIME /app/.build-info/BUILD_TIME

# ローカルストレージ (S3 未設定時のフォールバック先)。compose でボリュームを当てる。
RUN mkdir -p /app/.storage /app/.build-info && chown -R bun:bun /app/.storage /app/.build-info

USER bun
EXPOSE 3000

# slim には curl / wget が無いので bun の fetch で叩く。
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "-c", "export OHMYCMS_GIT_COMMIT=\"$(cat /app/.build-info/GIT_SHA)\" OHMYCMS_GIT_DIRTY=\"$(cat /app/.build-info/GIT_DIRTY)\" OHMYCMS_BUILT_AT=\"$(cat /app/.build-info/BUILD_TIME)\"; exec \"$@\"", "ohmycms-entrypoint"]
CMD ["bun", "apps/studio/server.js"]
