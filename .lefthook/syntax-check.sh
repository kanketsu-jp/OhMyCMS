#!/usr/bin/env bash
# ✅ 守り: **構文が壊れた .mjs / .cjs はコミットできない。**（1 行で言える形）
#
# 🚨 なぜ注意書きでは足りないか（2026-08-15 実測）
#   テンプレートリテラルの中にバッククォートを書いて文字列が途中で終わる事故を、
#   私は **今日 4 回**踏んだ。design は **1 回目のあと注意書きを足した上で、2 回目・3 回目を踏んだ**。
#   → **「〜しないこと」は守りではない。** 通らない形にする。
#
# 🚨 なぜ eslint では足りないか（実測・同日）
#   lefthook の lint は `root: apps/studio` なので、**そこから出たファイルは 1 つも見ない**。
#   直接当てても eslint 自身が拒否する:
#     bun x eslint ../../acceptance/checks/10-mcp-verify.mjs
#       → `0:0  warning  File ignored because outside of base path` / **exit 0**
#   実測の内訳（git ls-files）: apps/studio 32 / **acceptance 24 / packages 5 = 29 ファイルが無防備**。
#   （apps/studio の 32 は eslint が構文エラーで落とすことを対照で確認済み:
#     壊した .mjs を scripts/ に置く → `Parsing error` で exit 1 / 置かなければ exit 0）
#
# 🚨 この検査が見ていない範囲
#   ・**構文だけ**。型・未定義変数・実行時の誤りは見ない（eslint / tsc の代わりではない）
#   ・`.js` は見ない（ESM/CJS の判定がファイル単体では決まらないため。
#     apps/studio の .js は eslint が見ている）
#   ・`node --check` は **import 先を解決しない**ので、存在しないモジュールを import しても通る
set -euo pipefail

if [ "$#" -eq 0 ]; then
  # 🚨 0 件は「異常が無い」ではなく「見ていない」。lefthook の glob で 1 件も来なければ
  #    そもそもこのコマンドは呼ばれないが、手で呼んだときに黙って緑にしない。
  echo "syntax-check: 🚨 対象ファイルが 0 件で呼ばれました。**何も検査していません**。" >&2
  exit 1
fi

failed=0
checked=0
for f in "$@"; do
  [ -f "$f" ] || continue   # ステージ済みでも削除されたファイルは来る
  checked=$((checked + 1))
  if ! node --check "$f" 2>/tmp/syntax-check-$$.err; then
    failed=$((failed + 1))
    echo "🚨 構文が壊れています: $f" >&2
    sed -n '1,6p' /tmp/syntax-check-$$.err >&2
  fi
done
rm -f /tmp/syntax-check-$$.err

if [ "$checked" -eq 0 ]; then
  echo "syntax-check: 🚨 実在するファイルが 0 件でした。**何も検査していません**。" >&2
  exit 1
fi

if [ "$failed" -gt 0 ]; then
  echo "" >&2
  echo "構文エラー ${failed} 件 / 検査 ${checked} 件。**コミットを止めました**。" >&2
  echo "よくある原因: テンプレートリテラル（\` \`）の中にバッククォートを書いて文字列が途中で終わった。" >&2
  exit 1
fi

echo "syntax-check: ${checked} ファイル（構文のみ。型・未定義は見ていません）"
