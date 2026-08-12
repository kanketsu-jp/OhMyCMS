#!/usr/bin/env bash
# ナレッジ索引の鮮度検査。**絶対にコミットを止めない**（常に exit 0）。
#
# 止めない理由: 索引の鮮度は後から直せるが、コミットできないと作業そのものが止まる。
#               落とすなら CI が適切。
# rokf は npm 未公開でこのPCのローカル導入のため、入っていない環境では黙ってスキップする
# （Node のバージョンを切り替えると PATH から消えることがある）。
set -uo pipefail

if ! command -v rokf > /dev/null 2>&1; then
  exit 0
fi

if ! out="$(rokf doctor 2>&1)"; then
  echo "⚠ ナレッジ索引が古くなっています（コミットは通します）:" >&2
  echo "$out" | sed 's/^/    /' >&2
  echo "    直すには: rokf refresh" >&2
fi

exit 0
