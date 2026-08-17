#!/usr/bin/env bash
# migration の up → down → up を、**使い捨ての Postgres** で確かめる（2026-08-16・設問288 A）。
#
# 🚨 **なぜ共有 DB で down を打たないのか。**
#    共有 DB（docker/compose.yml の :5436）は**全ペインが同時に使っている**。
#    そこで `migrate:rollback` を打つと、**他の人の画面から列や表が消える**。
#    さらに司令塔ルールで `migrate:rollback` は**許可制**になった。
#    受入の型に許可制の操作が入っていると、**毎回止まる ＝ そのうち省略される**。
#    → **構造で外す**。使い捨ての DB なら、誰にも断らずに何度でも down を打てる。
#
# 🚨 **これで確かめられないこと（必ず併せて測ること）。**
#    使い捨ての DB で down が通っても、**共有 DB の状態は 1 バイトも見ていない**。
#    共有 DB へ `up` したあとは、**行数が前後で同じ**を別途測ること
#    （「down が通る」≠「共有で up が正しく効いた」）。
#
# 使い方:
#   bash scripts/verify-migrations-roundtrip.sh          # 既定ポート 55436
#   PROBE_PORT=55437 bash scripts/verify-migrations-roundtrip.sh
#
# 終了コード: 0 = 通った / 1 = 期待と違う / 2 = 前提が整っていない（docker が無い等）
set -uo pipefail

PROBE_PORT="${PROBE_PORT:-55436}"
CONTAINER="ohmycms-migrate-probe-${PROBE_PORT}"
PROBE_URL="postgres://postgres:probe@127.0.0.1:${PROBE_PORT}/postgres"

cd "$(dirname "$0")/.." || exit 2

# 🚨 共有 DB のポートを踏んでいたら、**何もせずに止まる**。
#    ここを守らないと、この仕組み自体が「共有 DB で down を打つ道具」になる。
if [ "$PROBE_PORT" = "5436" ]; then
  echo "🚨 PROBE_PORT が共有 DB のポート(5436)です。使い捨ての DB でしか動かしません。"
  exit 2
fi

command -v docker >/dev/null 2>&1 || { echo "🚨 docker が見つかりません（前提が整っていない）"; exit 2; }

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== 使い捨ての Postgres を立てる（:${PROBE_PORT}）=="
cleanup
docker run --rm -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=probe -e POSTGRES_DB=postgres \
  -p "127.0.0.1:${PROBE_PORT}:5432" postgres:17 >/dev/null || { echo "🚨 起動できません"; exit 2; }

# 🚨 **`pg_isready` を待ち条件にしない**（2026-08-17・shell が機構を測った）。
#    postgres の image は初期化中に**一時サーバ**を立てるが、それは
#    `listen_addresses=''` ＝ **unix socket にしか出ない**。
#    `docker exec` は container の中から叩くので、**その一時サーバが見えてしまい**、
#    `pg_isready` は「使えないサーバ」を ready と言う。
#    実測（auth）… ready の直後に `database "cms" does not exist` →
#                  `the database system is shutting down`（＝ 初期化の途中だった）
#    実測（shell）… 窓は **0.16 秒前後**（`POSTGRES_DB` を指定すると +38%）
#    🚨 **回数を増やしても直らない**（見ているものが同じなので）。**見る対象を変える。**
for _ in $(seq 1 60); do
  docker exec -e PGPASSWORD=probe "$CONTAINER" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
docker exec -e PGPASSWORD=probe "$CONTAINER" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1 \
  || { echo "🚨 60 秒待ってもクエリが通りません"; exit 2; }

# public スキーマの表の名前を、並べ替えて 1 行ずつ返す。
表一覧() {
  docker exec -e PGPASSWORD=probe "$CONTAINER" psql -U postgres -d postgres -At -c \
    "select table_name from information_schema.tables where table_schema='public' order by 1"
}

# 🚨 `PROBE_MIGRATIONS_DIR` は**この検査自身を赤くするため**に在る。
#    「通った」しか見ていない検査は、**壊れていても通ったように見える**。
#    down を書き忘れた migration を別ディレクトリに置いて食わせ、
#    **exit 1 になること**を確かめる（共有ツリーの migrations には 1 本も置かない）。
走る() {
  if [ -n "${PROBE_MIGRATIONS_DIR:-}" ]; then
    DATABASE_URL="$PROBE_URL" bun node_modules/knex/bin/cli.js "$@" \
      --knexfile lib/db/knexfile.ts --migrations-directory "$PROBE_MIGRATIONS_DIR"
  else
    DATABASE_URL="$PROBE_URL" bun node_modules/knex/bin/cli.js "$@" --knexfile lib/db/knexfile.ts
  fi
}

echo "== ① up =="
走る migrate:latest >/tmp/rt-up1.log 2>&1 || { echo "🚨 up が落ちました"; tail -20 /tmp/rt-up1.log; exit 1; }
up1=$(表一覧); n1=$(printf '%s\n' "$up1" | grep -c .)
echo "  表 = ${n1} 個"

# 🟢 対照(+): 1 個も出来ていないなら、**この検査は何も測っていない**。
#    「down で全部消えた」は、**最初から空でも同じ見た目**になる。
if [ "$n1" -lt 2 ]; then
  echo "🚨 up のあと表が ${n1} 個しかありません（＝この検査は何も測れていません）"
  exit 1
fi

echo "== ② down（すべて巻き戻す）=="
走る migrate:rollback --all >/tmp/rt-down.log 2>&1 || { echo "🚨 down が落ちました"; tail -20 /tmp/rt-down.log; exit 1; }
down=$(表一覧); n2=$(printf '%s\n' "$down" | grep -c .)
echo "  表 = ${n2} 個（knex 自身の管理表だけが残るはず）"

# 🚨 対照(-): 減っていないなら、down は**書いてあるだけで効いていない**。
if [ "$n2" -ge "$n1" ]; then
  echo "🚨 down のあとも表が ${n2} 個（${n1} 個から減っていません）＝ down が効いていません"
  exit 1
fi

# 🚨 変数名は ASCII にする。bash は**非 ASCII の変数名を受け付けない**
#    （zsh では通るので、手元で試すと気づけない。2026-08-16 実際に踏んだ）。
rest=$(printf '%s\n' "$down" | grep -v '^knex_migrations' || true)
if [ -n "$rest" ]; then
  echo "🚨 down のあとに残った表があります（down の書き漏れ）:"
  printf '    %s\n' "$rest"
  exit 1
fi

echo "== ③ up（もう一度）=="
走る migrate:latest >/tmp/rt-up2.log 2>&1 || { echo "🚨 2 回目の up が落ちました"; tail -20 /tmp/rt-up2.log; exit 1; }
up2=$(表一覧); n3=$(printf '%s\n' "$up2" | grep -c .)
echo "  表 = ${n3} 個"

if [ "$up1" != "$up2" ]; then
  echo "🚨 1 回目と 3 回目で表が違います（down が中途半端に戻している）:"
  diff <(printf '%s\n' "$up1") <(printf '%s\n' "$up2") | head -20
  exit 1
fi

echo
echo "✅ up → down → up が 1:1 で戻りました（表 ${n1} 個 → ${n2} 個 → ${n3} 個）"
echo "🚨 これは**使い捨ての DB**の結果です。**共有 DB の状態は見ていません。**"
echo "   共有 DB へ up したあとは、**行数が前後で同じ**を別途測ってください。"
