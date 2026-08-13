# SAML（v1-A）の落とし穴 — 実測で踏んだものだけ

> 2026-08-14 saml(w4A:pG)。**すべて実際に踏んだもの**で、推測は入れていない。
> 元は `.temp/2026-08-13/saml-handoff.md`（auth が書き、saml が実測で書き換えた）に置いていたが、
> 🚨 **`.temp/` は掃除で消える**ので、スクリプトと同じ場所へ移した。
>
> 手順は [README-for-sdk.md](./README-for-sdk.md)。ここは**なぜそう書いてあるか**。

---

## 1. 設計の決まりごと（守らないと作り直しになる）

`knowledge/decisions/auth-methods.md` の決定。**実装を始める前に読む。**

1. **IdP ごとに実装を分けない。** Entra ID / Google Workspace / Okta は**同じ SAML**。
   設定は**利用者が GUI で行う**（堀池「設定はユーザーがする」）。
2. 🚨 **`NameID` をメールに固定しない。** SAML の識別子は必ずしもメールではない。
   **実測**: Keycloak が返したのは `G-47a26d7e-4ae0-48b8-9b0a-4bf84f4b92e5`
   （`nameIDFormat` = `persistent`）。**メールではない。** メールは**属性**から取る。
3. 🚨 **SAML を有効にしても、パスワードの経路を黙って無効にしない。**
   無効にすると **IdP 側の設定を間違えた瞬間に誰も入れなくなる**。
   さらに「項目が欠けたまま有効にする」も **400 で拒否**する（`SAML_INCOMPLETE`）。
   中途半端に有効化すると、利用者が **503 の袋小路**に入る。
4. **署名検証を自前で書かない。** `@node-saml/node-saml` を使う。
   `@node-saml/node-saml@5.1.0` は **`serverExternalPackages` の変更なしで build が通る**（実測）。

---

## 2. 🚨 ライブラリの既定が、上の決定を裏切る

**方針を知っているだけでは踏む。** 既定値を1つずつ確かめること。

### 2-1. `identifierFormat` の既定が `emailAddress`

`node_modules/@node-saml/node-saml/lib/constants.js`:

    DEFAULT_IDENTIFIER_FORMAT = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"

既定のままだと **`NameIDPolicy` に `Format` を書いて、IdP にメールを要求する**。
→ §1-2 を守るには **`identifierFormat: null` を明示**するしかない。

### 2-2. `profile.ID` は型では省略可、実測では**常に `undefined`**

リプレイ台帳の鍵にこれを使い、**必須にしていたため正しい応答をすべて弾いていた**
（症状は「なぜか全部 401」）。**署名済み Assertion から取る**:

    profile.getAssertion().Assertion.$.ID

🚨 **Response 側の ID から取らないこと。** 署名の外にあるので、**書き換えるだけでリプレイ検査を外せる**。

### 2-3. `CacheProvider.getAsync` は「**保存した値**」を返す（キーではない）

ライブラリは戻り値を **`new Date(値)` で時刻として解釈**する。
キーを返すと `Invalid Date` → `NaN` → 判定が必ず偽になり、
**正しい応答が `SubjectInResponseTo is not valid` で落ちる**。

また **既定の `cacheProvider` はプロセス内メモリ**で、
**再起動で消える / 多重起動で送った側と受ける側が別プロセスになる**ため使えない。DB に置く。

### 2-4. `wantAuthnResponseSigned` の既定は `true`

SAML では「Response に署名」「Assertion に署名」「両方」のどれも仕様に適合し、**IdP によって既定が違う**。
`true` のままだと **Assertion が正しく署名されていても弾く**ので、
「安全側」ではなく「**動かない側**」に倒れる。急所は **Assertion の署名**（`wantAssertionsSigned: true`）。

---

## 3. 🚨 URL の組み立て

### 3-1. スキームを `NODE_ENV` で決めない

`knowledge/decisions/https-is-not-node-env.md`。**本番ビルドを平文 HTTP で配ることは普通にある**。
`lib/auth/cookies.ts` の `isSecureRequest(request)` を使う。

### 3-2. `new URL(request.url).origin` を使わない

リバースプロキシ越しだと**内部のホスト名**（`studio:3000` など）になり、
**IdP から到達できない URL** を渡してしまう。`x-forwarded-proto` / `x-forwarded-host` を見る
（`lib/auth/urls.ts` の `publicBaseUrl`）。

### 3-3. 戻り先を**正規表現で判定しない**

`/^\/(?!\/)[^\s]*$/`（「`/` で始まり `//` でない」）は **3 通り抜ける**（実測。ブラウザの飛び先まで確認）:

    "/\evil.com"     → http://evil.com/    特別なスキームでは "\" が "/" として解釈される
    "/\/evil.com"    → http://evil.com/
    "/..//evil.com"  → 正規化されて "//evil.com" になり、別サイトへ出る

🚨 **`RelayState` は IdP を往復して戻る＝攻撃者が値を決められる。**
「ログインしたら偽サイトに着く」が作れていた。
**`lib/auth/urls.ts` の `safeRelativePath()` を必ず通す**
（`knowledge/decisions/verify-the-verifier.md`「代理を測らない」）。

---

## 4. 🚨 検証のしかた（ここが一番空振りする）

### 4-1. リプレイは「弾いたか」でなく「**何が弾いたか**」を見る

素直に「同じ応答を2回 → 2回目が 401」と測ると **通るが、何も証明していない**。
1回目の成功で **ライブラリが `InResponseTo` の台帳を消す**ので、2回目は
「リプレイだから」ではなく「**`InResponseTo` が無いから**」落ちる（`SAML_INVALID_RESPONSE`）。
→ **リプレイ台帳を丸ごと消しても緑のまま**だった。

**決着のしかた**: Response の `InResponseTo` を外した応答（= IdP 起点のログインと同じ形。
**署名の外**の属性なので署名は壊れない）を使うと、ライブラリの検査が止まり、
**残る防御は台帳だけ**になる。2回目が **`code=SAML_REPLAY`** で落ちれば台帳が効いている証拠。

### 4-2. 🚨 失敗した対象をあとから調べると、**失敗そのものが証拠を消している**

上と同じ機構。ACS が 401 になったので同じ応答を手元で検証し直したら
`InResponseTo is not valid` が返り、**一次原因と無関係な症状**しか見えなかった。
→ **失敗する経路を叩く前に、証拠が残る経路で1回測る**（`SKIP_ACS=1`）。

### 4-3. 否定形だけ並べても何も証明しない

**🟢「正しい応答が通る」を先に置く。** 「常に 4xx を返す実装」でも否定形は全部通る。
同じ理由で「全部 `/admin` に潰す」実装でも戻り先の検査は緑になるので、
**🟢 対照（`/admin/collections` はそのまま通る）**を必ず入れる。

### 4-4. Keycloak は Cookie に `Secure` を付ける

ブラウザは `http://localhost` を安全な文脈として例外扱いするが、**Python の cookiejar はしない**。
素で叩くと IdP が `Restart login cookie not found` を返し、
**製品の不具合でないのに SAML が通らない**（`roundtrip.py` の `LocalhostIsSecure` で寄せてある）。

### 4-5. realm を作り直すと**署名証明書が変わる**

`start-dev` は組み込み DB なので、**コンテナを作り直すと realm ごと消える**。
`ohmycms_saml_config` の証明書を入れ直さないと、**正しい応答が 401 になる**。
🚨 症状が「**署名が違う**」に見えるので、**製品を疑ってしまう**。受入が赤くなったら最初に疑う場所。

**入れ直すのは受入チェック（`acceptance/checks/v1-a-saml.mjs`）の責務**。
`setup-keycloak.sh` は descriptor を取るだけで、アプリの設定には触らない（対象を選ばないため）。
🚨 **両方が入れ直すと、片方が古い値を書いて原因の分かりにくい 401 になる。**

---

## 5. 🚨 共有資源

### 5-1. compose のプロジェクト名は **用途ごとに1つ**

Keycloak は **`-p ohmycms-saml`**。当初 `-p ohmycms-verify` にしたら
**storage の MinIO が同じ名前を先に使っていて**、compose が orphan 警告を出した。
**どちらかが `--remove-orphans` を付けた瞬間に相手が消える。**
（`knowledge/decisions/shared-resources-are-exclusive.md`）

### 5-2. 設定行は **:3101 / :3102 / :3103 で共有の1行**

`ohmycms_saml_config` は単一行。**環境固有の値を書くと、他の環境が壊れる。**
実際に受入が `sp_entity_id` に `:3103` の URL を保存し、
**`:3102` からのログインが IdP に `Invalid redirect uri` で弾かれた**
（Issuer は保存値、ACS URL は要求から導出するので食い違う）。

    書いてよい … 証明書 / SSO URL / IdP 側の Entity ID（環境に依らない）
    書かない   … sp_entity_id（**空にして、要求から導出させる**）

🚨 症状が「急にログインできなくなった」なので、**直前にコードを触った人が自分を疑う**。実際にそうなった。

---

## 6. Task #23（実物の IdP）でやること

**実装側の変更は要らない。** 差し替えるのは**設定だけ**。

1. 堀池さんから **Entra ID / Google Workspace のメタデータ XML（か URL）**をもらう
2. `/admin/settings/sso` で「メタデータ XML を貼る」を選んで貼る → 保存
3. IdP 側には `/api/auth/saml/metadata` の内容（Entity ID と ACS URL）を登録してもらう
4. `negative-checks.py` / `redirect-checks.py` を、その IdP に向けて回す

🚨 **コードに IdP 固有の値は 0 件**（`grep -riE 'keycloak|3108|realms'` が当たるのは説明コメントだけ）。
🚨 **証明書の抽出は名前空間の接頭辞を仮定していない**（Keycloak は `dsig:`、Entra ID は素の `X509Certificate`）。
🚨 **公開 URL は `OHMYCMS_PUBLIC_URL` で明示できる**（プロキシが `x-forwarded-*` を付けない構成の逃げ道）。

### いま言えること / 言えないこと

    ✅ Keycloak 26.4 で通る                      :3101(513f54da) / :3102 / :3103 で実測
    🚨 実物の Entra ID / Google Workspace       **unverified**（テナントが要る）

**モックで通ることと実物で通ることは別。**
