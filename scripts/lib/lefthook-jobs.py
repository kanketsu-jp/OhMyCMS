#!/usr/bin/env python3
r"""
`lefthook.yml` の pre-commit から **(job 名, root, run)** を取り出す（TAB 区切り）。

■ なぜ要るか（2026-08-16）
  `scripts/gate.sh` は `grep -oE 'node scripts/check-[a-z0-9-]+\.mjs'` で検査を導出していた。
  🚨 lefthook の実体には **当たらない書き方**が在る:
     `node apps/studio/scripts/…`（7 本） / `cd apps/studio && node …`（3 本）
     `bun scripts/…ts` / `bun run …` / `bash .lefthook/*.sh`（4 本） / `bun x eslint` / `bun x tsc`
  ＝ 🚨 **38 本のうち 26 本しか見ておらず、門は「全て緑」と出していた**
     （CI で落ちた `shortcuts-manifest` は、門では**一度も走っていなかった**）。

■ 🚨 job 名で突き合わせる（**対応表を持たない**）
  検査スクリプトのファイル名と job 名は**両側で違う**（`breadcrumba11y` / `check-breadcrumb-a11y.mjs` 等）。
  対応表を作ると **名前を変えた人が表を直す義務を知らない**ので腐る。
  → **門は「その job の `run:` を実行する」**形にして、**比べる対象を job 名だけ**にする。

■ 🚨 見ていない範囲
  ・`pre-commit` だけ（`pre-push` 等は見ない）
  ・`run:` が 1 行で書かれている前提（複数行の `script:` は拾わない）
  ・`glob` / `exclude` は見ない（**走らせるかどうかは gate.sh 側の判断**）
"""
import re, sys
src = open(sys.argv[1]).read()
if "pre-commit:" not in src:
    sys.stderr.write("🚨 pre-commit: が見つかりません。**この 0 本は「見ていない 0」です**\n")
    sys.exit(2)
i = src.index("pre-commit:")
body = src[i:]
cur = None; root = ""; out = []
for line in body.split("\n"):
    m = re.match(r'^    ([a-z0-9][a-z0-9-]*):\s*$', line)
    if m:
        cur = m.group(1); root = ""; continue
    if cur is None: continue
    mr = re.match(r'^      root:\s*"([^"]+)"', line)
    if mr: root = mr.group(1); continue
    mrun = re.match(r'^      run:\s*(.+)$', line)
    if mrun:
        out.append((cur, root, mrun.group(1).strip())); cur = None
if not out:
    sys.stderr.write("🚨 job を 1 本も取れませんでした。**導出が壊れています**\n")
    sys.exit(2)
print("\n".join("\t".join(x) for x in out))
