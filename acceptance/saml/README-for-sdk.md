# V1-A（SAML）受入の再現手順 — sdk 向け

**すべて実測で通っています。** そのまま再実行できます。

## 前提

| もの | 値 |
|---|---|
| テスト IdP | Keycloak 26.4 / `:3108` / compose project **`ohmycms-verify`** |
| realm | `ohmycms` |
| テスト利用者 | `saml-tester`（`setup-keycloak.sh` が作る。パスワードは検証専用の使い捨て） |
| 対象 | `:3102`（dev）。`:3103` で測るなら `OHMYCMS_PUBLIC_URL` は不要（Host ヘッダから組み立てる） |

🚨 **Keycloak は起動済みです。`docker compose down` を打たないでください**
（`-p ohmycms-verify` は **minio も使っています**。`--remove-orphans` を付けると minio が消えます）。

## 0. 立て直しが要るときだけ

    docker compose -p ohmycms-verify -f .temp/2026-08-14/saml/compose.keycloak.yml up -d
    .temp/2026-08-14/saml/setup-keycloak.sh      # realm / SAML client / 属性 / 利用者 を冪等に作る

## 1. 通す

    # 🟢 ログインの往復（AuthnRequest → Keycloak で認証 → ACS → セッション）
    python3 .temp/2026-08-14/saml/roundtrip.py /tmp/saml-response.txt

期待:

    == 1. /api/auth/saml/login が IdP へ 302 するか ==   status: 302
    == 3. IdP へ資格情報を出す（実際のログイン）==       IdP が SAMLResponse を返した: bytes = 9080
                                                        🚨 送った ID と一致するか: True
    == 4. ACS へ渡す → セッションが出るか ==             status: 302 / Location: /admin
                                                        Set-Cookie: session=…; HttpOnly; SameSite=Lax
    ✅ 往復が通りました（実物の Keycloak）

🚨 **Cookie が出たことを合格にしないでください。** セッションが効くところまで見ます:

    S=$(cat /tmp/saml-response.txt.session)
    curl -sS -H "Cookie: session=$S" -w " %{http_code}\n" http://localhost:3102/api/auth/me   # 🟢 200
    curl -sS                          -w " %{http_code}\n" http://localhost:3102/api/auth/me   # 🔴 401
    curl -sS -H "Cookie: session=deadbeef" -w " %{http_code}\n" http://localhost:3102/api/auth/me  # 🔴 401

## 2. 🔴 否定形（**🟢 の対照つきで 10/10**）

    python3 .temp/2026-08-14/saml/negative-checks.py

中身:

| # | 何を見るか | 期待 |
|---|---|---|
| 🟢 | **正しい応答は通る**（**これが先頭。無いと以下は何も証明しない**） | 302 + session |
| 🔴 1 | 署名を改竄（メールを1文字書き換え＝署名の対象） | 401 / session なし |
| 🔴 2 | 署名要素を丸ごと削除 | 401 / session なし |
| 🔴 3 | 同じ応答を2回 | 1回目 302 / 2回目 401 |
| 🔴 3b | **リプレイ台帳が弾いた証拠** | 2回目が **`code=SAML_REPLAY`** |
| 🔴 4 | Audience 不一致 | 401 |
| 🔴 5 | 期限切れ（NotOnOrAfter） | 401 |
| 🔴 6 | `/login` が生きている（**パスワードの経路を殺していない**） | 200 |

### 🚨 3b が要る理由（そのまま受入の観点にしてください）

**3 だけだと、リプレイ台帳を全部消しても緑のままです。**
1回目の成功で node-saml が `InResponseTo` の台帳を消すため、
**2回目は「リプレイだから」ではなく「InResponseTo が無いから」落ちます**（コードが `SAML_INVALID_RESPONSE`）。

3b は **Response の `InResponseTo` を外した応答**（= IdP 起点のログインと同じ形。
**署名の外**の属性なので署名は壊れない）を使い、ライブラリの `InResponseTo` 検査を丸ごと止めます。
**残る防御はリプレイ台帳だけ**になり、2回目が `SAML_REPLAY` で落ちれば台帳が効いている証拠になります。

→ **受入では「弾いたか」でなく「何が弾いたか（code）」まで見てください。**

## 3. GUI で設定できること

    /admin/settings/sso （管理者のみ。API は /api/settings/saml）

    🟢 メタデータ XML を貼るだけで entityId / ssoUrl / 証明書 が入る
    🔴 認証なし → 401 / 🔴 項目が欠けたまま有効化 → 400 SAML_INCOMPLETE
    🔴 javascript: の URL → 400 INVALID_URL / 🔴 でたらめな証明書 → 400 INVALID_CERTIFICATE

🚨 **「保存できた」で終わらせないでください。** 設定を消す → メタデータ XML で入れ直す →
**その設定で §1 のログインが通る**、まで見ると「保存した値を誰かが読んでいる」が言えます。

## 4. 未検証（`unverified`）

🚨 **実物の Entra ID / Google Workspace は未確認**（テナントが要る）。Task #23 の段。
コードに **IdP 固有の値は 0 件**（`grep -riE 'keycloak|3108|realms'` が当たるのは説明コメント3行だけ）。
