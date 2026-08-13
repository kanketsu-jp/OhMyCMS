#!/usr/bin/env bash
# .temp/artifacts/ の HTML を、軽量なコンテナで配信する。
#
# 目的: ngrok で外へ出して **モバイルから見られるようにする**こと。
# Artifact（claude.ai）は認証が要るので、その場で人に見せたいときはこちらを使う。
#
#   起動:  bash .temp/artifacts/serve.sh
#   停止:  bash .temp/artifacts/serve.sh stop
#   一覧:  http://localhost:8080/
#
# 🚨 このディレクトリは .gitignore（.temp/）配下。HTML をリポジトリへコミットしない。
# 🚨 配信するのは静的ファイルだけ。秘密を含む HTML をここへ置かない。
set -euo pipefail

NAME="artifact-server"
PORT="${ARTIFACT_PORT:-8080}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-start}" in
  stop)
    docker rm -f "$NAME" >/dev/null 2>&1 && echo "停止しました: $NAME" || echo "動いていません"
    exit 0
    ;;
  start)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" \
      -p "${PORT}:80" \
      -v "$DIR:/usr/share/nginx/html:ro" \
      nginx:alpine >/dev/null

    # 起動確認（「立てた」で終わらせず、実際に 200 を見る）
    for _ in $(seq 1 20); do
      code=$(curl -sS -o /dev/null -m 2 -w '%{http_code}' "http://localhost:${PORT}/" || true)
      [ "$code" = "200" ] && break
      sleep 0.5
    done
    echo "http://localhost:${PORT}/  → ${code}"
    echo
    echo "配信中の HTML:"
    find "$DIR" -maxdepth 1 -name '*.html' -exec basename {} \; | sed 's/^/  - /'
    echo
    echo "モバイルから見るには ngrok を通す（空いている予約ドメインの選び方は Skill: ngrok-domain）:"
    echo "  ngrok http ${PORT} --domain <空いている予約ドメイン>"
    ;;
  *)
    echo "使い方: serve.sh [start|stop]" >&2; exit 2 ;;
esac
