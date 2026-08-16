#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  🚨 この台は **共有 DB（ohmycms-db :5436）に書きます。**
#     ・`directus_users` の `saml-tester@example.com` の行を**可逆に**書き換える
#     ・対照のとき **利用者が 1 人増える**ことがある → **後始末で id を撃って消す**
#     ・走らせる前に **予告**すること（共有資源）
#
#  何を測るか: ①の枝（**同じ IdP・同じ NameID ＝ 2 回目以降**）で、
#     `verify.ts` の `...(identity.email ? { email: identity.email } : {})` が
#     **DB 側の email を IdP の値で上書きするか**。
#
#  使い方:  STUDIO=http://localhost:3102 bash acceptance/saml/probe-email-overwrite.sh
#     空打ち: DRY=1 STUDIO=... bash acceptance/saml/probe-email-overwrite.sh
#
#  ─────────────────────────────────────────────────────────────────
#  🚨 v1 で測り損ねた（**この形は残す価値が在る**）
#     保存されていた NameID は **別の台（別ポート）のもの**だった。
#     persistent の NameID は **SP ごとに違う**ので `byNameId` が当たらず、
#     ②（メール一致）も外れて、**新しい行ができただけ**（313→314）。
#     🚨 画面上は「**上書きされませんでした**」と読める形で結果が出る。
#        ＝ **「変わらなかった」と「そこを通っていない」が同じ顔で出る。**
#     ✅ だから v2 は **まず 1 回通して、その台の NameID を採ってから**①を狙う。
#        対照(+)（NameID を消すと上書きされず新規行ができる）も置いてある。
#
#  🚨 後始末の作法は `probe-adoption.sh` の先頭に書いた事故が由来。
#     **削除は id で切る／確認は総数ではなく id の残存**。
# ════════════════════════════════════════════════════════════════════════
set -uo pipefail

HERE="$(cd "$(dirname "${0}")" && pwd)"
REPO="$(cd "${HERE}/../.." && pwd)"
STUDIO=${STUDIO:-http://localhost:3102}
IDP_EMAIL=saml-tester@example.com     # IdP（Keycloak）が送ってくる値
VICTIM=zz-victim-original@example.test # DB 側に入れておく「元のメール」
TMP="${TMPDIR:-/tmp}"

psql() { docker exec ohmycms-db psql -U cms -d cms -t -A "$@"; }
show() { psql -F' | ' -c "select email, provider, coalesce(external_identifier,'(null)') from directus_users where id='$1';"; }
# 🚨 `probe-adoption.sh` の `trip()` と同じ理由（2026-08-16 実測）。
#    パイプの向こうで受けると、往復の失敗が **grep の 0 行**に化ける。
#    ここは表示を 4xx/5xx に絞っているので、**通常運転でも 0 行になりうる**。
#    ＝ 🚨 **「0 行」で判断できない。だから `status:` の有無を別に見る。**
trip() {
  rm -f "${TMP}/overwrite.txt.session"
  local log="${TMP}/overwrite.log"
  STUDIO="${STUDIO}" python3 "${REPO}/acceptance/saml/roundtrip.py" "${TMP}/overwrite.txt" > "${log}" 2>&1
  local rc=$?
  grep -E "^(   status: 4|   status: 5|✅|🚨 IdP)" "${log}" | sed 's/^/      /'
  echo "      往復の終了コード: ${rc}"
  if [ "$(grep -cE '^   status:' "${log}")" = "0" ]; then
    echo "      🚨 **サーバに届いていません。以降の DB の値は「通した結果」ではありません**"
    tail -3 "${log}" | sed 's/^/         /'
  fi
}

echo "════ 0. 元の状態を控える ════"
ORIG=$(psql -F'|' -c "select id, email, provider, coalesce(external_identifier,'') from directus_users where lower(email)='${IDP_EMAIL}';")
[ -z "${ORIG}" ] && { echo "🚨 対象が居ません。**測れていません**"; exit 1; }
ID=$(echo "${ORIG}" | cut -d'|' -f1); O_MAIL=$(echo "${ORIG}" | cut -d'|' -f2)
O_PROV=$(echo "${ORIG}" | cut -d'|' -f3); O_EXT=$(echo "${ORIG}" | cut -d'|' -f4)
echo "  元: ${ORIG}"
BEFORE=$(psql -c "select count(*) from directus_users;"); echo "  総数（前）: ${BEFORE}"

restore() {
  echo "════ 後始末（🚨 id で切る） ════"
  psql -c "delete from directus_users where lower(email) in (lower('${IDP_EMAIL}'),lower('${VICTIM}')) and id <> '${ID}';" >/dev/null
  psql -c "update directus_users set email='${O_MAIL}', provider='${O_PROV}',
             external_identifier=$( [ -n "${O_EXT}" ] && echo "'${O_EXT}'" || echo "null" ) where id='${ID}';" >/dev/null
  echo "  🚨 元の id が残っているか: $(psql -c "select count(*) from directus_users where id='${ID}';") 件（**1 が正**）"
  echo "  参考 総数（後）: $(psql -c "select count(*) from directus_users;")  ／ 前: ${BEFORE}（**一致は根拠になりません**）"
  echo "  最終: $(show "${ID}")"
}
trap restore EXIT

if [ "${DRY:-0}" = "1" ]; then
  echo
  echo "🚨 空打ち（DRY=1）— 測定はしません。**下の後始末は本物の restore() です**"
  exit 0
fi

echo
echo "════ 1. この台（${STUDIO}）の NameID を採る ════"
psql -c "delete from directus_users where lower(email)=lower('${IDP_EMAIL}') and id <> '${ID}';" >/dev/null
psql -c "update directus_users set email='${IDP_EMAIL}', provider='local', external_identifier=null where id='${ID}';" >/dev/null
trip
NOW_EXT=$(psql -c "select coalesce(external_identifier,'') from directus_users where id='${ID}';")
echo "  この台の NameID: ${NOW_EXT}"
echo "  🚨 控えてあった NameID: ${O_EXT}"
echo "  🟢 対照 2 つは同じか: $( [ "${NOW_EXT}" = "${O_EXT}" ] && echo '同じ' || echo '**違う（SP ごとに別）**' )"
[ -z "${NOW_EXT}" ] && { echo "🚨 NameID を採れていません。**測れていません**。中止"; exit 1; }

echo
echo "════ 2. 🔴 ①の枝を狙う: NameID はそのまま、DB の email だけ別の値にする ════"
psql -c "update directus_users set email='${VICTIM}' where id='${ID}';" >/dev/null
echo "  🟢 対照(-) 通す前: $(show "${ID}")"
B2=$(psql -c "select count(*) from directus_users;")
trip
echo "  通した後          : $(show "${ID}")"
echo "  総数              : $(psql -c "select count(*) from directus_users;")（前 ${B2}）"
echo "  🚨 email が ${IDP_EMAIL} になっていれば、**IdP が既存の email を上書きしている**"
