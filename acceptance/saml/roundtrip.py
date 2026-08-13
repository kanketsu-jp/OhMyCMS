#!/usr/bin/env python3
"""Keycloak との SAML 往復を1回通す（🚨 モックではない。実際の IdP の応答を使う）。

出力する SAMLResponse は、後段の否定形の検査（署名改竄・リプレイ）でも使い回す。
"""
import http.cookiejar, urllib.request, urllib.parse, re, sys, json, pathlib

import os
STUDIO = os.environ.get("STUDIO", "http://localhost:3102")
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("/tmp/saml-response.txt")

class LocalhostIsSecure(http.cookiejar.DefaultCookiePolicy):
    """`http://localhost` を**安全な文脈**として扱う（= ブラウザと同じ挙動）。

    🚨 これはテスト側を実物へ寄せるための処置であって、製品の緩和ではない。
       Keycloak は Cookie に `Secure` を付ける。Chrome / Firefox は
       **localhost に限り** 平文 HTTP でも Secure 付き Cookie を送るが、
       Python の cookiejar はそうしない。素のままだと
       IdP が『Restart login cookie not found』を返し、
       **製品の不具合ではないのに SAML が通らない**（実測で踏んだ）。
    """

    def return_ok_secure(self, cookie, request):
        host = http.cookiejar.request_host(request)
        if host in ("localhost", "127.0.0.1"):
            return True
        return super().return_ok_secure(cookie, request)


jar = http.cookiejar.CookieJar(policy=LocalhostIsSecure())
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op_noredir = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)

def get(url, opener=op):
    try:
        r = opener.open(urllib.request.Request(url))
        return r.getcode(), r.read().decode("utf-8", "replace"), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), {k.lower(): v for k, v in e.headers.items()}

def post(url, data, opener=op):
    body = urllib.parse.urlencode(data).encode()
    try:
        r = opener.open(urllib.request.Request(url, data=body))
        return r.getcode(), r.read().decode("utf-8", "replace"), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), {k.lower(): v for k, v in e.headers.items()}

print("== 1. /api/auth/saml/login が IdP へ 302 するか ==")
code, body, hdr = get(f"{STUDIO}/api/auth/saml/login", op_noredir)
print("   status:", code)
loc = hdr.get("location", "")
print("   Location:", loc[:110], "...")
assert code == 302, f"302 でない: {code} {body[:200]}"
assert loc.startswith("http://localhost:3108/"), "IdP へ向いていない"
assert "SAMLRequest=" in loc, "AuthnRequest が入っていない"
import base64, zlib
_q = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)
_xml = zlib.decompress(base64.b64decode(urllib.parse.unquote(_q["SAMLRequest"][0])), -15).decode()
REQUEST_ID = re.search(r'\sID="([^"]+)"', _xml).group(1)
print("   AuthnRequest ID:", REQUEST_ID)

print("== 2. IdP のログイン画面を取る ==")
code, body, _ = get(loc)
print("   status:", code)
# 🚨 素の action="..." で拾わない。ページには他の form もあり、
#    そちらを掴むと Keycloak が 400 を返す（実測で踏んだ）。id で特定する。
form = re.search(r'<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"', body)
assert form, "ログインフォームが見つからない"
action = form.group(1).replace("&amp;", "&")

print("== 3. IdP へ資格情報を出す（実際のログイン）==")
code, body, hdr = post(action, {"username": "saml-tester", "password": "verify-only-not-a-secret"})
print("   status:", code)
m = re.search(r'name="SAMLResponse" value="([^"]+)"', body)
if not m:
    print("   本文:", body[:600]); sys.exit(1)
saml_response = m.group(1).replace("&#13;", "").replace("&amp;", "&")
relay = re.search(r'name="RelayState" value="([^"]*)"', body)
print("   🚨 IdP が SAMLResponse を返した: bytes =", len(saml_response))
_resp_xml = base64.b64decode(saml_response).decode("utf-8", "replace")
_irt = re.search(r'InResponseTo="([^"]*)"', _resp_xml)
print("   InResponseTo   :", _irt.group(1) if _irt else "(なし)")
print("   🚨 送った ID と一致するか:", bool(_irt) and _irt.group(1) == REQUEST_ID)
OUT.write_text(saml_response)

import os
if os.environ.get("SKIP_ACS"):
    # 🚨 ACS を叩くと、検証が失敗したときライブラリが InResponseTo の台帳の行を消す。
    #    そのあとで原因を調べると「InResponseTo が無い」という**二次的な症状**しか見えない。
    #    一次の原因を見たいときはここで止める。
    print("== 4. ACS は叩かない（SKIP_ACS）。応答だけ保存した ==")
    sys.exit(0)

print("== 4. ACS へ渡す → セッションが出るか ==")
code, body, hdr = post(f"{STUDIO}/api/auth/saml/acs",
                       {"SAMLResponse": saml_response,
                        "RelayState": relay.group(1) if relay else "/admin"},
                       op_noredir)
print("   status:", code)
print("   Location:", hdr.get("location"))
setc = hdr.get("set-cookie", "")
print("   Set-Cookie:", re.sub(r'session=[^;]+', 'session=<伏せ>', setc))
if code != 302:
    print("   本文:", body[:600]); sys.exit(1)
assert "session=" in setc, "セッション Cookie が出ていない"
token = re.search(r'session=([^;]+)', setc).group(1)
pathlib.Path(str(OUT) + ".session").write_text(token)
print("\n✅ 往復が通りました（実物の Keycloak）")
