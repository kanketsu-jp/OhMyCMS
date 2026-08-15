#!/usr/bin/env bash
# 押す前の門。**検査だけ**を行い、緑なら 0・赤なら 1 で終わる。
#
# 🚨 このファイルは「押す」ことをしない。押す処理を混ぜないこと。
#    混ぜると、誰かが監査のつもりで走らせて本番へ出てしまう。
#    押す側（promote）はリポジトリの外に置いてある。
#
# 🚨 なぜリポジトリの中に在るのか（2026-08-16）:
#    この門はもともと `.temp/{日付}/autopilot.sh` に在った。`.temp/` は .gitignore 済みで、
#    **消えることを前提にした置き場**（実際に恒久スクリプトを失った前例がある）。
#    つまり「いま push を止められる唯一の門が、消える場所に在り、消えても誰も気づけない」
#    状態だった。門が消えてもコミットは通る。**緑になるだけ**で、
#    「門が守っている」がある日から静かに嘘になる。
#    → 検査の側だけをここへ出し、**誰でも突き合わせられる**ようにした。
#
# 使い方:
#   bash scripts/gate.sh          # HEAD を検査
#   bash scripts/gate.sh <ref>    # 任意の ref を検査
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1
REF="${1:-HEAD}"
SHA=$(git rev-parse "$REF") || exit 1
log(){ echo "[$(date '+%H:%M:%S')] $*"; }

# 🚨 共有ツリーを stash しない。2026-08-15 に、退避したまま残して
#    「同じファイルの版が 2 つある」状態を作り、進行中の作業を飲み込みかけた。
#    代わりに隔離した worktree へ ref を取り出して測る。共有ツリーには一切触れない。
# 🚨 worktree の名前は毎回変える（複数人が同時に走らせても衝突しないため）。
WT="${TMPDIR:-/tmp}/ohmycms-gate-$$-${SHA:0:8}"
rm -rf "$WT"
git worktree add --detach "$WT" "$SHA" -q 2>/dev/null || { log "🚨 worktree を作れない"; exit 1; }
cleanup(){ git worktree remove --force "$WT" >/dev/null 2>&1; }
trap cleanup EXIT

ln -s "$REPO/node_modules" "$WT/node_modules" 2>/dev/null
ln -s "$REPO/apps/studio/node_modules" "$WT/apps/studio/node_modules" 2>/dev/null
# 🚨 packages/* の依存は**その配下**に入っている（root の node_modules に tsup は無い・実測）。
#    ここを繋がないと `tsup: command not found` で **偽の赤**になり、門が「コードのせい」に見える。
for p in sdk mcp cli; do
  ln -s "$REPO/packages/$p/node_modules" "$WT/packages/$p/node_modules" 2>/dev/null
done

S="$WT/apps/studio"
log "検証 ${SHA:0:8}（共有ツリーには触れていない）"

FAIL=0
# 🚨 ログを /tmp の固定名に置かない。/tmp は全ペイン共有で、短い名前は黙って上書きされる
#    （2026-08-16 実測: 別ペインの `> /tmp/kb.txt` が他ペインの測定を消していた）。
LOGD="$WT/.gate"; mkdir -p "$LOGD"
run(){ n=$1; shift; ( cd "$S" && "$@" >"$LOGD/out.log" 2>&1 ); c=$?
  if [ "$c" -ne 0 ]; then log "  ❌ $n exit=$c"; sed -n '1,8p' "$LOGD/out.log" | sed 's/^/      /'; FAIL=1
  else log "  ✅ $n"; fi; }
runroot(){ n=$1; shift; ( cd "$WT" && "$@" >"$LOGD/out.log" 2>&1 ); c=$?
  if [ "$c" -ne 0 ]; then log "  ❌ $n exit=$c"; sed -n '1,8p' "$LOGD/out.log" | sed 's/^/      /'; FAIL=1
  else log "  ✅ $n"; fi; }

run tsc              ./node_modules/.bin/tsc --noEmit
run lint             bun run lint
run i18n:hardcoded   node scripts/check-i18n-hardcoded.mjs
run i18n:keys        node scripts/check-i18n-keys.mjs
run i18n:usage       node scripts/check-i18n-usage.mjs
run aschild          node scripts/check-aschild-single-child.mjs
run submit-once      node scripts/check-submit-once.mjs
run user-label-leak  node scripts/check-user-label-leak.mjs
# 🚨 packages/* は 2026-08-16 まで範囲外だった（CI が初回で TS2307 を出して教えてくれた）。
#    sdk は "types": "./dist/index.d.ts" なので **build しないと型が存在しない**。
#    build を先に置く（CI の build ジョブは順序が逆で落ちた）。
runroot packages     bash -c "bun --filter './packages/*' build && bun --filter './packages/*' typecheck"

# 🚨 この門が見ていない範囲（書かないと「全部見た」と読まれる）:
#    - `next build` … worktree では symlink した node_modules を Turbopack が拒否するので回していない
#    - 受入 V1-E    … Docker と共有ポートを使う。共有環境を壊さないことを確かめてから載せる
#    - 本番のデプロイ … 🚨 この門は push を止めるだけ。**CI も本番も止めない**（実測済み・
#                      CI が赤でも本番は焼ける。時刻で確認: CI 18:40:04→18:46:19 failure ／
#                      本番 builtAt 18:40:31）
#    - lefthook に載っている検査のうち、ここに列挙していないもの
if [ "$FAIL" != "0" ]; then log "🚨 赤があります"; exit 1; fi
log "🟢 全て緑 (${SHA:0:8})"
exit 0
