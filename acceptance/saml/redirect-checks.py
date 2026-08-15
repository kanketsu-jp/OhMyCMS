#!/usr/bin/env python3
"""ログイン後の戻り先が **このサイトの外へ出せない** ことを、実エンドポイントで確かめる。

🚨 RelayState は **IdP を往復して戻ってくる** = 攻撃者が中身を決められる。
   『/ で始まり // でない』の正規表現では 3 通り抜けた（実測）ので、対照つきで固定する。
"""
import sys, urllib.parse, urllib.request, base64, re, os, subprocess

# 🚨 受入は :3103（焼き込んだ版）で測るので、対象を差し替えられるようにする（sdk の roundtrip.py と同じ形）。
STUDIO = os.environ.get("STUDIO", "http://localhost:3102")
HERE = os.path.dirname(os.path.abspath(__file__))


class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


def login_relay_state(redirect):
    """/api/auth/saml/login?redirect=… が IdP へ渡す RelayState を読む。

    🚨 **status も一緒に返す。** 302 が返っていないなら、この検査は
       「拒否された」ではなく「**そこまで届いていない**」であって、何も言えない。
    """
    url = f"{STUDIO}/api/auth/saml/login?redirect={urllib.parse.quote(redirect, safe='')}"
    try:
        r = urllib.request.build_opener(NR).open(url)
        status, hdr = r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        status, hdr = e.code, {k.lower(): v for k, v in e.headers.items()}
    loc = hdr.get("location", "")
    q = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)
    return status, q.get("RelayState", [""])[0]


def acs_location(saml_response, relay):
    """🚨 status も返す（上と同じ理由）。"""
    body = urllib.parse.urlencode({"SAMLResponse": saml_response, "RelayState": relay}).encode()
    try:
        r = urllib.request.build_opener(NR).open(urllib.request.Request(f"{STUDIO}/api/auth/saml/acs", data=body))
        status, hdr = r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        status, hdr = e.code, {k.lower(): v for k, v in e.headers.items()}
    return status, hdr.get("location", "")


def fresh_response():
    """毎回、IdP から新しい応答を取り直す。

    🚨 **読む前に必ず消す。** `roundtrip.py` は目印（「SAMLResponse を返した」）を
       **書き込みより先に**出すので、目印が出たあとに書き込みが失敗すると、
       ここで**前回の応答を読んで**「新しく取った」ことにしてしまう。
       実際、書き込みは今日 `IsADirectoryError` で落ちている（引数にディレクトリを渡した）。
    🚨 **終了コードも見る。** 目印は「途中まで進んだ」ことしか言わない。
    """
    path = "/tmp/redir-saml.txt"
    try:
        os.remove(path)          # 古い応答を残さない（残ると失敗が成功に見える）
    except FileNotFoundError:
        pass

    out = subprocess.run([sys.executable, os.path.join(HERE, "roundtrip.py"), path],
                         env={**os.environ, "SKIP_ACS": "1"}, capture_output=True, text=True)
    if out.returncode != 0 or "SAMLResponse を返した" not in out.stdout:
        print(out.stdout, out.stderr)
        print(f"🚨 応答を取り直せませんでした（exit={out.returncode}）。**測れていません。**")
        sys.exit(1)
    if not os.path.exists(path):
        print(f"🚨 目印は出たのに {path} が作られていません。**測れていません。**")
        sys.exit(1)
    return open(path).read().strip()


def escapes(location):
    """この Location でブラウザが別サイトへ行くか。"""
    if not location:
        return False
    dest = urllib.parse.urljoin(STUDIO + "/", location)
    return not dest.startswith(STUDIO + "/") or dest.startswith(STUDIO + "//")


BAD = ["//evil.com", "/\\evil.com", "/\\/evil.com", "/..//evil.com",
       "https://evil.com", "javascript:alert(1)"]
GOOD = ["/admin/collections", "/admin?tab=x"]

fails = 0
print("🟢 対照(+): 正しい戻り先はそのまま通ること")
print("   🚨 これが通らなければ、以下の 🔴 は**何も証明しません**（届いていないだけかもしれない）")
for good in GOOD:
    status, got = login_relay_state(good)
    ok = status == 302 and got == good
    fails += 0 if ok else 1
    print(f"  {'✅' if ok else '❌'} login redirect={good!r:24} → {status} RelayState={got!r}")
if fails:
    print("\n🚨 対照が通りません。**測れていません**（機能が壊れている、とは言えません）。中止します。")
    sys.exit(1)

print()
print("🔴 login: 外部サイトへ出す値は落とされること")
for bad in BAD:
    status, got = login_relay_state(bad)
    # 🚨 **302 が返っていることを要求する。** 404 や 503 だと RelayState は当然空で、
    #    「拒否した」と「そこまで届いていない」が同じ ✅ になる（実測で 6 件の偽陽性が出た）。
    reached = status == 302
    ok = reached and not escapes(got)
    fails += 0 if ok else 1
    note = "" if reached else "  ← 🚨 302 でない＝測れていない"
    print(f"  {'✅' if ok else '❌'} login redirect={bad!r:24} → {status} RelayState={got!r}{note}")

print()
print("🔴 ACS: IdP から戻ってきた RelayState でも外部サイトへ出せないこと")
print("   （🚨 ここが本丸。IdP を経由するので攻撃者が値を決められる）")
for bad in BAD:
    status, loc = acs_location(fresh_response(), bad)
    reached = status == 302
    ok = reached and not escapes(loc)
    fails += 0 if ok else 1
    note = "" if reached else "  ← 🚨 302 でない＝測れていない"
    print(f"  {'✅' if ok else '❌'} ACS RelayState={bad!r:24} → {status} Location={loc!r}{note}")

print()
print("🟢 対照(+): ACS も正しい戻り先はそのまま使うこと")
status, loc = acs_location(fresh_response(), "/admin/collections")
ok = status == 302 and loc == "/admin/collections"
fails += 0 if ok else 1
print(f"  {'✅' if ok else '❌'} ACS RelayState='/admin/collections' → {status} Location={loc!r}")

print()
print("すべて期待どおり" if fails == 0 else f"🚨 {fails} 件が期待と違う")
sys.exit(1 if fails else 0)
