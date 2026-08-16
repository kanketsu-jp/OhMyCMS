#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  🚨 この台は **共有 DB（ohmycms-db :5436）に書きます。**
#     ・`directus_users` の `saml-tester@example.com` の行を**可逆に**書き換える
#     ・対照のとき **利用者が 1 人増える**（ACS を通すため）→ **後始末で id を撃って消す**
#     ・走らせる前に **予告**すること（共有資源）
#
#  何を測るか: ②の枝（**同じメールの既存利用者に相乗りする**）。
#     `upsertSamlUser` の探し順は ①同じ NameID → ②**同じメール** → ③作る。
#     ②に `provider` の条件が無いので、`local` の利用者にも当たる。
#     当たると provider が `saml` に書き換わり、**その人としてセッションが出る**。
#
#  使い方:  STUDIO=http://localhost:3103 bash acceptance/saml/probe-adoption.sh
#     空打ち: DRY=1 STUDIO=... bash acceptance/saml/probe-adoption.sh
#             → **測定を一切せず、本物の後始末だけ**を走らせて見せる
#
#  ─────────────────────────────────────────────────────────────────
#  🚨 2026-08-16 の事故（**この台で起きた。消さないこと**）
#
#  対照のために既存利用者のメールを PARKED に変えたあと、後始末が
#      delete ... where lower(email) = lower('<PARKED>')
#  を打った。🚨 **それは台が作った行ではなく、元の行だった**（＝ 元の利用者を消した）。
#
#  🚨 **なぜ気づけなかったか（ここが本当の教訓）**
#     利用者の総数は **313 → 313** のままだった。
#     **消した 1（元の行）＋ 往復が作った 1（新しい行）** で釣り合ったため。
#     確認が「**前後の総数が一致**」だったので、**緑のまま通った**。
#     ＝ 「id で撃てばいい」では終わらない。**確認のしかたが間違っていた。**
#
#  ✅ したがって、この台は 2 つとも直してある:
#     ① 削除は **id で切る**（`and id <> '<元の id>'`）
#     ② 確認は **総数ではなく「元の id が 1 件残っているか」**
#     （由来: `~/.claude/rules/count-before-you-report.md` §2-3n）
# ════════════════════════════════════════════════════════════════════════
set -uo pipefail

HERE="$(cd "$(dirname "${0}")" && pwd)"
REPO="$(cd "${HERE}/../.." && pwd)"
STUDIO=${STUDIO:-http://localhost:3103}
EMAIL=saml-tester@example.com
PARKED=zz-parked-saml-tester@example.com
TMP="${TMPDIR:-/tmp}"

psql() { docker exec ohmycms-db psql -U cms -d cms -t -A "$@"; }
row()  { psql -F' | ' -c "select id, email, provider, coalesce(external_identifier,'(null)'), status from directus_users where lower(email)=lower('$1');"; }
cnt()  { psql -c "select count(*) from directus_users;"; }

echo "════ 0. 元の状態を控える（戻すため） ════"
ORIG=$(psql -F'|' -c "select id, provider, coalesce(external_identifier,''), status from directus_users where lower(email)='${EMAIL}';")
echo "  元: ${ORIG}"
if [ -z "${ORIG}" ]; then
  echo "🚨 対象が居ません。**測れていません**（「違反なし」ではありません）"; exit 1
fi
ID=$(echo "${ORIG}" | cut -d'|' -f1)
O_PROV=$(echo "${ORIG}" | cut -d'|' -f2)
O_EXT=$(echo "${ORIG}" | cut -d'|' -f3)
O_STAT=$(echo "${ORIG}" | cut -d'|' -f4)
BEFORE_CNT=$(cnt); echo "  利用者の総数（前）: ${BEFORE_CNT}"

restore() {
  echo "════ 後始末（🚨 id で切る。メールで撃たない） ════"
  psql -c "delete from directus_users where lower(email) in (lower('${EMAIL}'), lower('${PARKED}')) and id <> '${ID}';" >/dev/null
  psql -c "update directus_users set provider='${O_PROV}',
             external_identifier=$( [ -n "${O_EXT}" ] && echo "'${O_EXT}'" || echo "null" ),
             status='${O_STAT}', email='${EMAIL}' where id='${ID}';" >/dev/null
  echo "  戻した後: $(row "${EMAIL}")"
  # 🚨 総数では見ない（消した 1 と作られた 1 が釣り合う）。**id の残存**で見る。
  echo "  🚨 元の id が残っているか: $(psql -c "select count(*) from directus_users where id='${ID}';") 件（**1 でなければ失敗**）"
  echo "  参考 利用者の総数（後）: $(cnt)  ／ 前: ${BEFORE_CNT}（**一致は根拠になりません**）"
}
trap restore EXIT

if [ "${DRY:-0}" = "1" ]; then
  echo
  echo "🚨 空打ち（DRY=1）— 測定はしません。**下の後始末は本物の restore() です**"
  exit 0
fi

# 🚨 パイプの向こうで受けると、往復の失敗が **grep の 0 行**に化ける（2026-08-16 実測）。
#    届かない台を指すと 表示 0 行・python は exit 1 で、台はそのまま次へ進み、
#    DB の値を「通した結果」として印字していた。
#
# 🚨 ただし **exit が非 0 なら止める、にはできない**。
#    停止中の枝では **往復は失敗するのが正しい**（ACS が 403 → roundtrip.py は exit 1）。
#    ＝ **403 は「届いた失敗」／接続拒否は「届かない失敗」**。同じ非 0 でも意味が違う。
# ✅ だから `status:` の行が 1 本も無いとき（＝ サーバに届いてすらいない）だけ警告する。
trip() {
  rm -f "${TMP}/adoption.txt.session"
  local log="${TMP}/adoption.log"
  STUDIO="${STUDIO}" python3 "${REPO}/acceptance/saml/roundtrip.py" "${TMP}/adoption.txt" > "${log}" 2>&1
  local rc=$?
  grep -E "^(   status:|✅|🚨)" "${log}" | sed 's/^/      /'
  echo "      往復の終了コード: ${rc}"
  if [ "$(grep -cE '^   status:' "${log}")" = "0" ]; then
    echo "      🚨 **サーバに届いていません。以降の DB の値は「通した結果」ではありません**"
    tail -3 "${log}" | sed 's/^/         /'
  fi
}

echo
echo "════ 1. 🔴 相乗り（②の枝・1 回目） ════"
psql -c "update directus_users set provider='local', external_identifier=null, status='active' where id='${ID}';" >/dev/null
echo "  🟢 対照(-) 通す前: $(row "${EMAIL}")"
trip
echo "  通した後        : $(row "${EMAIL}")"
echo "  利用者の総数    : $(cnt)（前 ${BEFORE_CNT}。**増えていなければ相乗り**）"

echo
echo "════ 2. 🔴 停止中でも provider は書き換わるか ════"
psql -c "update directus_users set provider='local', external_identifier=null, status='suspended' where id='${ID}';" >/dev/null
echo "  通す前: $(row "${EMAIL}")"
trip
echo "  通した後: $(row "${EMAIL}")  ← **provider が saml なら、403 でも書き換えは戻っていない**"

echo
echo "════ 3. 🟢 対照(+) メールが一致しなければ新しい行が増えるか ════"
psql -c "update directus_users set provider='local', external_identifier=null, status='active', email='${PARKED}' where id='${ID}';" >/dev/null
B3=$(cnt); echo "  通す前の総数: ${B3}"
trip
echo "  通した後の総数: $(cnt)  ← **増えていれば、この台は「新規」と「相乗り」を区別できる**"
