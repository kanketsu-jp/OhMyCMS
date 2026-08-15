#!/usr/bin/env bash
# packages/* の型検査。
#
# 由来: 2026-08-15。`packages/mcp` は **lefthook のどの項目からも見られていなかった**。
#   実測: packages/mcp のファイルだけを staged にして pre-commit を回すと
#         12 項目中 10 が「no matching staged files」で飛び、走るのは secrets と knowledge だけ。
#   🟢 対照: apps/studio のファイルを staged にすると 12 項目すべてが走る。
#   ＝ `root: "apps/studio"` の外（packages 36 ファイル / acceptance 22 ファイル）は実質ノーチェックだった。
#
# 🚨 **この検査は「ビルドされたツリー」でしか意味を持たない。**
#   `packages/sdk/package.json` の types は `./dist/index.d.ts` を指しているので、
#   dist が無いツリーでは `Cannot find module '@ohmycms/sdk'` が出て、
#   そこから芋づるで無関係な型エラー（暗黙 any 等）まで生える。
#   **それは「型が壊れている」ではなく「まだ何も測れていない」。**
#   実際にこれで一度誤報した（新しく切った worktree で赤くなり、共有ツリーでは緑だった）。
#   → dist が無いときは**型エラーの山を出さず、何をすべきかだけを言って落ちる**。
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$root/packages/sdk/dist" ]; then
  echo "🚨 packages/sdk/dist がありません。**この検査は何も測れていません**（型が壊れているのとは別）。"
  echo "   直し方: bun --filter './packages/*' build"
  echo "   （@ohmycms/sdk の型は dist から出るので、dist が無いと無関係な型エラーが大量に出ます）"
  exit 1
fi

cd "$root" || exit 1
exec bun --filter './packages/*' typecheck
