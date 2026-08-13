#!/usr/bin/env bash
# Keycloak を SAML の IdP として設定する（検証専用・冪等）。
set -euo pipefail
KC=http://localhost:3108
REALM=ohmycms
STUDIO=${STUDIO:-http://localhost:3102}
SP_ENTITY_ID=$STUDIO/api/auth/saml/metadata
ACS=$STUDIO/api/auth/saml/acs

TOKEN=$(curl -sS -X POST "$KC/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "username=admin" \
  -d "password=verify-only-not-a-secret" -d "grant_type=password" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
[ -n "$TOKEN" ] || { echo "FAILED: no admin token"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

# realm
curl -sS -o /dev/null -w "realm create: %{http_code}\n" "${A[@]}" -X POST "$KC/admin/realms" \
  -d "{\"realm\":\"$REALM\",\"enabled\":true,\"sslRequired\":\"NONE\"}" || true

# SAML client
curl -sS -o /dev/null -w "client create: %{http_code}\n" "${A[@]}" -X POST "$KC/admin/realms/$REALM/clients" -d "{
  \"clientId\": \"$SP_ENTITY_ID\",
  \"protocol\": \"saml\",
  \"enabled\": true,
  \"redirectUris\": [\"$ACS\"],
  \"adminUrl\": \"$ACS\",
  \"frontchannelLogout\": true,
  \"attributes\": {
    \"saml.assertion.signature\": \"true\",
    \"saml.server.signature\": \"false\",
    \"saml.client.signature\": \"false\",
    \"saml.authnstatement\": \"true\",
    \"saml_name_id_format\": \"persistent\",
    \"saml_assertion_consumer_url_post\": \"$ACS\",
    \"saml_single_logout_service_url_post\": \"\",
    \"saml.signature.algorithm\": \"RSA_SHA256\"
  }
}" || true

CID=$(curl -sSG "${A[@]}" "$KC/admin/realms/$REALM/clients" --data-urlencode "clientId=$SP_ENTITY_ID" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')
echo "client uuid: $CID"

# 属性マッピング（email / firstName / lastName）
for M in \
  'email|email|http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' \
  'firstName|firstName|http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname' \
  'lastName|lastName|http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname' ; do
  NAME=${M%%|*}; REST=${M#*|}; PROP=${REST%%|*}; ATTR=${REST#*|}
  curl -sS -o /dev/null -w "mapper $NAME: %{http_code}\n" "${A[@]}" -X POST \
    "$KC/admin/realms/$REALM/clients/$CID/protocol-mappers/models" -d "{
      \"name\": \"$NAME\", \"protocol\": \"saml\",
      \"protocolMapper\": \"saml-user-property-mapper\",
      \"config\": {\"user.attribute\":\"$PROP\",\"attribute.name\":\"$ATTR\",
                   \"attribute.nameformat\":\"URI Reference\",\"friendly.name\":\"$NAME\"}
    }" || true
done

# テスト利用者
curl -sS -o /dev/null -w "user create: %{http_code}\n" "${A[@]}" -X POST "$KC/admin/realms/$REALM/users" -d '{
  "username":"saml-tester","enabled":true,"emailVerified":true,
  "email":"saml-tester@example.com","firstName":"Saml","lastName":"Tester",
  "credentials":[{"type":"password","value":"verify-only-not-a-secret","temporary":false}]
}' || true

echo "--- IdP の署名証明書 ---"
curl -sS "$KC/realms/$REALM/protocol/saml/descriptor" > /tmp/kc-descriptor.xml
echo "descriptor bytes: $(wc -c < /tmp/kc-descriptor.xml)"
