#!/bin/sh
# POSTGRES_PASSWORD を決めてから、postgres 公式の entrypoint へ渡す。
#
# 🚨 順番は「明示 → 種から導出 → どちらも無ければ止める」。
#    明示が勝つのは、既存のボリューム（initdb 済み）を壊さないため。
#    initdb はパスワードを初回にしか焼かないので、導出値へ勝手に変えると本番が繋がらなくなる。
set -eu

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
	if [ -n "${OHMYCMS_SEED:-}" ]; then
		# 種から決める。studio 側（lib/config/derive.ts）と同じ手順:
		#   SHA-256( SEED + "|ohmycms|" + purpose )
		POSTGRES_PASSWORD=$(printf '%s|ohmycms|db-password' "$OHMYCMS_SEED" | sha256sum | cut -d' ' -f1)
		export POSTGRES_PASSWORD
	elif [ -z "${POSTGRES_HOST_AUTH_METHOD:-}" ] && [ -z "${POSTGRES_PASSWORD_FILE:-}" ]; then
		# 🚨 ここで止めないと、postgres 側の「パスワードが無い」エラーになり、
		#    種を設定すればよいことが読み取れない。値は出さない（変数名だけ）。
		echo "OHMYCMS_SEED か POSTGRES_PASSWORD のどちらかを設定してください" >&2
		exit 1
	fi
fi

exec docker-entrypoint.sh "$@"
