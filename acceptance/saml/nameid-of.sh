#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  NameID だけを採る（**ACS を叩かない**ので、利用者の行は 1 行も動かない）
#
#  ✅ この台は **共有 DB に書きません**（`SKIP_ACS=1` で `upsertSamlUser` が呼ばれない）。
#     同じディレクトリの他の 2 本は**書きます**。先頭の注意書きを読むこと。
#
#  使い方: bash acceptance/saml/nameid-of.sh <ポート>
#     例:  bash acceptance/saml/nameid-of.sh 3102
#
#  何が採れるか: SAMLResponse の NameID / Audience / Issuer。
#  🚨 **persistent の NameID は SP（entityId）ごとに違う。**
#     `ohmycms_saml_config.sp_entity_id` が空だと、entityId は
#     リクエストの host から組み立てられる（route.ts:29/90）ので、
#     **ポートを変えると NameID が変わる**（2026-08-16 実測）。
# ════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "${0}")" && pwd)"
REPO="$(cd "${HERE}/../.." && pwd)"
PORT=${1:?ポートを指定してください（例 3102）}
OUT="${TMPDIR:-/tmp}/nameid-of-${PORT}.txt"
LOG="${TMPDIR:-/tmp}/nameid-of-${PORT}.log"
rm -f "${OUT}"

SKIP_ACS=1 STUDIO="http://localhost:${PORT}" \
  python3 "${REPO}/acceptance/saml/roundtrip.py" "${OUT}" > "${LOG}" 2>&1
RC=$?

if [ ! -s "${OUT}" ]; then
  # 🚨 「NameID が無い」ではなく「**採れていない**」。区別して出す。
  echo "  🚨 :${PORT} … **測れませんでした**（応答を採れていない・exit=${RC}）"
  grep -E "status:|本文|Error|error" "${LOG}" | head -4 | sed 's/^/      /'
  exit 0
fi

python3 - "${OUT}" "${PORT}" <<'PY'
import sys, base64, re
raw = open(sys.argv[1]).read().strip()
try:
    xml = base64.b64decode(raw).decode("utf-8", "replace")
except Exception as e:
    print(f"  🚨 :{sys.argv[2]} … 復号できません: {e}")
    raise SystemExit
nid = re.search(r"<saml:NameID[^>]*>([^<]+)</saml:NameID>", xml) or re.search(r"<NameID[^>]*>([^<]+)</NameID>", xml)
iss = re.search(r"<saml:Issuer[^>]*>([^<]+)</saml:Issuer>", xml)
aud = re.search(r"<saml:Audience[^>]*>([^<]+)</saml:Audience>", xml)
print(f"  :{sys.argv[2]}")
print(f"      NameID   : {nid.group(1) if nid else '🚨 取れず'}")
print(f"      Audience : {aud.group(1) if aud else '(なし)'}   ← SP として誰宛か")
print(f"      Issuer   : {iss.group(1) if iss else '(なし)'}")
PY
