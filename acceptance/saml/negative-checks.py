#!/usr/bin/env python3
"""SAML の 🔴 否定形を、**必ず 🟢 の対照と対にして**確かめる。

🚨 否定形だけを並べると「常に 4xx を返す実装」でも全部通る。
   各項目の直前に『同じ手順で正しい応答を1回通す』を置き、
   **弾く側と通す側の両方が動いていること**を示す。
"""
import base64, re, subprocess, sys, urllib.parse, urllib.request, os

import os
STUDIO = os.environ.get("STUDIO", "http://localhost:3102")
HERE = os.path.dirname(os.path.abspath(__file__))
results = []


def fresh_response():
    """Keycloak から本物の SAML 応答を1つ取る（ACS は叩かない）。"""
    out = subprocess.run(
        [sys.executable, os.path.join(HERE, "roundtrip.py"), "/tmp/neg-saml.txt"],
        env={**os.environ, "SKIP_ACS": "1"}, capture_output=True, text=True)
    if "SAMLResponse を返した" not in out.stdout:
        print(out.stdout, out.stderr); sys.exit(1)
    return open("/tmp/neg-saml.txt").read().strip()


def post_acs(saml_response, relay="/admin"):
    body = urllib.parse.urlencode({"SAMLResponse": saml_response, "RelayState": relay}).encode()
    req = urllib.request.Request(f"{STUDIO}/api/auth/saml/acs", data=body)

    class NR(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    try:
        r = urllib.request.build_opener(NR).open(req)
        code, body_text, hdr = r.getcode(), r.read().decode(), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        code, body_text, hdr = e.code, e.read().decode(), {k.lower(): v for k, v in e.headers.items()}
    return code, body_text, hdr.get("set-cookie", "")


def record(label, ok, detail):
    results.append((ok, label, detail))
    print(f"  {'✅' if ok else '❌'} {label}: {detail}")


print("🟢 対照 1: 正しい応答は通る（これが無いと、以下の 🔴 は何も証明しない）")
code, body, cookie = post_acs(fresh_response())
record("正しい応答", code == 302 and "session=" in cookie, f"status={code} session={'あり' if 'session=' in cookie else 'なし'}")

print()
print("🔴 1. 署名を改竄した応答は弾かれる")
raw = base64.b64decode(fresh_response()).decode()
# 属性値を1文字だけ書き換える（署名の対象なので、検証が生きていれば必ず落ちる）
tampered = raw.replace("saml-tester@example.com", "attacker@example.com")
assert tampered != raw, "改竄が入っていない（測定器が壊れている）"
code, body, cookie = post_acs(base64.b64encode(tampered.encode()).decode())
record("改竄した応答", code == 401 and "session=" not in cookie,
       f"status={code} session={'🚨あり' if 'session=' in cookie else 'なし'} body={body[:80]}")

print()
print("🔴 2. 署名要素を丸ごと外した応答は弾かれる")
raw = base64.b64decode(fresh_response()).decode()
unsigned = re.sub(r"<dsig:Signature.*?</dsig:Signature>", "", raw, flags=re.S)
assert "dsig:Signature" not in unsigned and unsigned != raw, "署名が外れていない（測定器が壊れている）"
code, body, cookie = post_acs(base64.b64encode(unsigned.encode()).decode())
record("署名なしの応答", code == 401 and "session=" not in cookie,
       f"status={code} session={'🚨あり' if 'session=' in cookie else 'なし'}")

print()
print("🔴 3. 同じ応答は2回使えない（リプレイ）")
once = fresh_response()
c1, _, k1 = post_acs(once)
c2, b2, k2 = post_acs(once)
record("1回目", c1 == 302 and "session=" in k1, f"status={c1}（通るのが正しい）")
record("2回目", c2 != 302 and "session=" not in k2, f"status={c2} body={b2[:80]}")

print()
print("🔴 3b. 🚨 リプレイ台帳そのものが弾いているか（隣のものを測っていないか）")
# 上の 3 は 2回目が SAML_INVALID_RESPONSE で、**リプレイ台帳ではなく InResponseTo** が
# 弾いていた可能性がある（1回目の成功でライブラリが台帳の行を消すため）。
# InResponseTo を外す（= IdP 起点のログインと同じ形。**署名の外**にある属性なので署名は壊れない）と
# ライブラリの InResponseTo 検査は丸ごと止まり、**残る防御はリプレイ台帳だけ**になる。
raw = base64.b64decode(fresh_response()).decode()
idp_initiated = re.sub(r'(<samlp:Response[^>]*?)\s+InResponseTo="[^"]*"', r'\1', raw, count=1)
assert 'InResponseTo' not in idp_initiated.split('<saml:Assertion')[0], "Response の InResponseTo が外れていない（測定器が壊れている）"
payload = base64.b64encode(idp_initiated.encode()).decode()
c1, b1, k1 = post_acs(payload)
c2, b2, k2 = post_acs(payload)
code2 = re.search(r'"code":"([^"]+)"', b2)
record("1回目（InResponseTo なし）", c1 == 302 and "session=" in k1, f"status={c1}（IdP 起点のログインも通ること）")
record("2回目が **SAML_REPLAY** で弾かれる", c2 == 401 and code2 and code2.group(1) == "SAML_REPLAY",
       f"status={c2} code={code2.group(1) if code2 else '?'}")

print()
print("🔴 4. Audience が違う応答は弾かれる")
raw = base64.b64decode(fresh_response()).decode()
other = raw.replace(f"<saml:Audience>{STUDIO}/api/auth/saml/metadata</saml:Audience>",
                    "<saml:Audience>http://evil.example.com/metadata</saml:Audience>")
assert other != raw, "Audience を書き換えられていない（測定器が壊れている）"
code, body, cookie = post_acs(base64.b64encode(other.encode()).decode())
record("Audience 不一致", code == 401 and "session=" not in cookie, f"status={code}")

print()
print("🔴 5. 期限切れの応答は弾かれる")
raw = base64.b64decode(fresh_response()).decode()
expired = re.sub(r'NotOnOrAfter="[^"]+"', 'NotOnOrAfter="2020-01-01T00:00:00.000Z"', raw)
assert expired != raw, "期限を書き換えられていない（測定器が壊れている）"
code, body, cookie = post_acs(base64.b64encode(expired.encode()).decode())
record("期限切れ", code == 401 and "session=" not in cookie, f"status={code}")

print()
print("🔴 6. SAML を有効にしてもパスワードの経路が黙って無効にならない")
try:
    r = urllib.request.urlopen(f"{STUDIO}/login")
    login_status = r.getcode()
except urllib.error.HTTPError as e:
    login_status = e.code
record("/login が生きている", login_status == 200, f"status={login_status}")

print()
failed = [r for r in results if not r[0]]
print(f"===== {len(results) - len(failed)}/{len(results)} 通過 =====")
for _, label, detail in failed:
    print("  ❌", label, detail)
sys.exit(1 if failed else 0)
