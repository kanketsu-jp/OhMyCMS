#!/usr/bin/env bash
# ステージされたファイルに秘密が混ざっていないかを見る。
# .gitignore の .env* が効いている限り普通は到達しないが、`git add -f` で強制されると素通りするので、
# ここで最後の歯止めをかける。
set -uo pipefail

bad=()
for f in "$@"; do
  base="$(basename "$f")"
  case "$base" in
    .env.example) continue ;;                       # これだけは追跡してよい
    .env|.env.*|*.pem|*.p12|*.key) bad+=("$f") ;;
  esac
  case "$f" in
    */chat-user-token.json|*/oauth-desktop-client.json) bad+=("$f") ;;
  esac
done

if [ "${#bad[@]}" -gt 0 ]; then
  echo "✖ 秘密が混入している可能性のあるファイルがステージされています:" >&2
  for f in "${bad[@]}"; do echo "    $f" >&2; done
  echo "" >&2
  echo "  外すには: git restore --staged <ファイル>" >&2
  echo "  .env は .gitignore 済みです。git add -f で強制した場合はここで止まります。" >&2
  exit 1
fi

exit 0
