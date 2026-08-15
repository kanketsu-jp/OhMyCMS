#!/usr/bin/env bash
# packages/* の型検査。
#
# 由来: 2026-08-15。`packages/mcp` は **lefthook のどの項目からも見られていなかった**。
#   実測: packages/mcp のファイルだけを staged にして pre-commit を回すと
#         12 項目中 10 が「no matching staged files」で飛び、走るのは secrets と knowledge だけ。
#   🟢 対照: apps/studio のファイルを staged にすると 12 項目すべてが走る。
#   ＝ `root: "apps/studio"` の外（packages 36 ファイル / acceptance 22 ファイル）は実質ノーチェックだった。
#   🟢 対照: 見られている側は apps **400 ファイル**（node_modules/.git/.next/dist/.temp/.claude/docs/knowledge を除外）。
#            **36 と 22 は、この 400 と並べて初めて「取り残されている」と読めます。**
#
# 🚨 **この項目に掛かってよい時間**（この行が無いと、次の人が判断できない）:
#   `lefthook.yml` の方針は「pre-commit に置くのは**速いもの**だけ。遅いと必ず `--no-verify` される」。
#
#   🚨 **数字は「どの条件で測ったか」とセットでないと嘘になる**（2026-08-16 に自分で踏んだ）。
#   最初この行には **890ms** とだけ書いてあり、あとで lefthook の出力に
#   **`✔️ packages-typecheck (37.01 seconds)`** が出て、**桁が違う**と混乱した。
#   測り直した結果（同じ日・同じ機械）:
#
#     ① このスクリプト単体・**dist 在り**   … **901ms / 1014ms**（2 回）  ← 890ms はこれ
#     ② このスクリプト単体・**dist 無し**   … **24ms**（早期 exit。66ms もこれ）
#        （② は共有ツリーを壊さないよう、**新しい clone** で測った）
#     ③ 🚨 **lefthook 経由**（12 項目が並列・lint 26s / knowledge 14s と同時） … **37.01 秒**
#
#   → **①②はこのスクリプトの費用。③は「混雑した pre-commit 全体の中での待ち時間」**で、別のもの。
#   🚨 **③ を「この検査が遅い」と読まないこと。** 逆に、**①だけを見て「1 秒だから安い」とも読まないこと**
#      （並列で走る他の項目と資源を取り合うので、体感は③に近づく）。
#   → **ここに検査を足すなら、①の桁を大きく超えないこと。**
#     超えるものは pre-commit ではなく受入ハーネス側へ置く（今日 verify.mjs をそちらへ回したのと同じ判断）。
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
