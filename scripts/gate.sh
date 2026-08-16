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
# 🚨 押すのは止めないが、**必ず件数を出す**枠。使うのは「既知で・直す先が決まっていて・
#    止めると門ごと回避される」ものだけ。使ったら必ず**外す条件**を隣に書くこと。
warnonly(){ n=$1; shift; ( cd "$S" && "$@" >"$LOGD/out.log" 2>&1 ); c=$?
  if [ "$c" -ne 0 ]; then
    # 🚨 件数は**検査自身が出している行**をそのまま見せる。自分で数え直すと、
    #    出力の形が変わった瞬間に「違反 0」と出て、**警告が嘘になる**（実際に一度なった）。
    v=$(grep -E '違反|件 /|箇所' "$LOGD/out.log" 2>/dev/null | grep -vE '囮|自己検査|✅|対象を拾えて' | head -2 | tr -s ' ' | tr '\n' ' ')
    [ -z "$v" ] && v="🚨 件数を取り出せませんでした（出力の形が変わった可能性）"
    # 🚨 `$c（` と書くと、全角の括弧まで変数名として読まれて "unbound variable" になる。
    #    多バイト文字の直前では必ず ${} で閉じること（2026-08-16 実測で踏んだ）。
    log "  🚨 $n exit=${c} — **押すのは止めない** ／ ${v}"
  else log "  ✅ $n （🚨 0 になりました。gate.sh の warnonly を run へ戻してください）"; fi; }
runroot(){ n=$1; shift; ( cd "$WT" && "$@" >"$LOGD/out.log" 2>&1 ); c=$?
  if [ "$c" -ne 0 ]; then log "  ❌ $n exit=$c"; sed -n '1,8p' "$LOGD/out.log" | sed 's/^/      /'; FAIL=1
  else log "  ✅ $n"; fi; }

run tsc              ./node_modules/.bin/tsc --noEmit
run lint             bun run lint
# 🚨 i18n の 3 本はここから外した（2026-08-16）。lefthook の `i18n` job は
#    **4 本まとめ**（hardcoded / keys / usage ＋ **placeholders**）で、下の導出がそれを走らせる。
#    ＝ ここに 3 本書いていたときは、**placeholders が門に無かった**。
run aschild          node scripts/check-aschild-single-child.mjs
run submit-once      node scripts/check-submit-once.mjs
run user-label-leak  node scripts/check-user-label-leak.mjs
# 🚨 ここから先は **lefthook.yml から実行のたびに導出**する。
#    理由（2026-08-16 に 2 回踏んだ）:
#      ① この門は当初 lefthook の 22 本のうち **5 本**しか見ておらず、
#         「門が緑」と報告しながら 17 本は一度も走っていなかった
#      ② 手で 17 本を書き足した直後に、design が lefthook 側で
#         `no-api-message` → `raw-api-message` へ差し替えた。
#         🚨 **書き写した一覧は、その瞬間から腐る。**
#    lefthook を丸ごと呼ぶ案は使えない（隔離した worktree では next/link・lucide-react・
#    @tiptap/* がモジュール解決できず **偽の赤**が出る。実測）。名前だけ借りて個別に呼ぶ。
# 🚨 **job 名で突き合わせる**（2026-08-16 に作り直した）。
#    それまでの導出は `grep -oE 'node scripts/check-[a-z0-9-]+\.mjs'` で、
#    🚨 **書き方が違う job を丸ごと落としていた**（base2 が実測して 7 本を名指し）:
#      `node apps/studio/scripts/…`（7 本）／`cd apps/studio && node …`（3 本）
#      `bun scripts/….ts`／`bun run …`／`bash .lefthook/*.sh`（4 本）／`bun x eslint`／`bun x tsc`
#    ＝ **38 本のうち 26 本しか見ずに「🟢 全て緑」と出していた**。
#    実害: CI が落ちた `shortcuts-manifest` は、**押す前の門で一度も走っていなかった**。
# 🚨 **対応表は作らない。** 検査のファイル名と job 名は両側で違う
#    （`breadcrumba11y` ↔ `check-breadcrumb-a11y.mjs` 等）が、**表は名前を変えた人が直さないと腐る**。
#    → **その job の `run:` をそのまま実行する**。比べる対象を **job 名だけ**にする。
JOBS=$(python3 "$WT/scripts/lib/lefthook-jobs.py" "$WT/lefthook.yml") || { log "🚨 lefthook の job を導出できませんでした"; exit 1; }
NJOBS=$(printf '%s\n' "$JOBS" | grep -c . || true)
# 🚨 空 / 極端に少ないときは「全部通った」ではなく **失敗**（空の期待は「照合していない」）。
if [ "$NJOBS" -lt 30 ]; then log "🚨 lefthook の job が ${NJOBS} 本しか取れません（30 本未満）。**導出が壊れています**"; exit 1; fi

# 🚨 **走らせないものは、必ず理由を隣に書く**（既存の決定。黙って外さない）。
#    `|` 区切りで「job 名|理由」。**ここに無い job は必ず走る**。
SKIP_JOBS="
secrets|{staged_files} を lefthook が埋める形。門には staged が無い
syntax|同上（{staged_files}）
lint|同上。門は上で 'bun run lint' を走らせている
typecheck|門は上で tsc --noEmit を走らせている（同じもの）
packages-typecheck|門は下で build+typecheck を走らせている（順序が違うだけ）
knowledge|rokf（外部コマンド）に依存。隔離ツリーでは PATH に無いことが在る
"
RAN=0; SKIPPED=0
log "  lefthook の job ${NJOBS} 本を導出（job 名で突き合わせる）"
# 🚨 区切りは `\x1f`。**TAB を使うと、`root` が空の行で列がずれる**
#    （TAB は空白なので `read` が連続区切りを潰す。2026-08-16 に実測で踏んだ:
#     root 無しの 7 本が全部 `cd $WT/node` になって落ちた）
printf '%s\n' "$JOBS" | while IFS="$(printf '\037')" read -r job root cmd; do
  [ -z "$job" ] && continue
  why=$(printf '%s\n' "$SKIP_JOBS" | grep -E "^${job}\|" | cut -d'|' -f2- || true)
  if [ -n "$why" ]; then log "  ⏭ ${job}（${why}）"; continue; fi
  dir="$WT"; [ -n "$root" ] && dir="$WT/$root"
  # 🚨 **job ごとに別のログへ出す**（1 本の out.log を使い回すと、
  #    どの出力がどの job のものか分からなくなる。2026-08-16 に実際に読み違えた）
  jlog="$LOGD/job-${job}.log"
  ( cd "$dir" && bash -c "$cmd" >"$jlog" 2>&1 ); c=$?
  if [ "$c" -ne 0 ]; then log "  ❌ ${job} exit=$c"; tail -n 8 "$jlog" | sed 's/^/      /'; echo 1 >> "$LOGD/fail.flags"
  else log "  ✅ ${job}"; fi
done
# 🚨 while はサブシェルなので、失敗はファイルで受ける（変数だと消える）
[ -s "$LOGD/fail.flags" ] && FAIL=1
# 🚨 **走らせた本数と除外の本数を出す**（「差 0」が「一致」か「比べていない」かを分ける）
NSKIP=$(printf '%s\n' "$SKIP_JOBS" | grep -c '|' || true)
log "  job ${NJOBS} 本 ＝ 走らせた $((NJOBS - NSKIP)) 本 ＋ 理由つきで除外 ${NSKIP} 本（**差 0**）"

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
