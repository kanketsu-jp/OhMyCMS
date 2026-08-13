---
type: decision
title: 認証は SAML → メール OTP → パスワードの順に使う
description: 理想はメールアドレスの OTP。SSO は SAML で Entra ID / Google Workspace などに対応し、設定はユーザーが GUI で行う。パスワードは SSO も OTP も使えない環境のフォールバックとして残す。
tags: [auth, security, architecture]
status: active
generated:
  by: rag-okf
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://apps/studio/lib/auth/setup.ts"
  - resource: "repo://apps/studio/lib/auth/google.ts"
  - resource: "repo://apps/studio/lib/auth/sessions.ts"
stale_after: 2027-02-13
x_rag_okf:
  id: decisions/auth-methods
  authorship: agent
---

# 認証は SAML → メール OTP → パスワードの順に使う

## 背景

> 堀池（2026-08-13）:
> 「**理想はメールアドレスの OTP での認証。**
> **Microsoft Entra ID (旧称 Azure Active Directory) では、Microsoft 365、Intune、Dynamics CRM Online
> といった Microsoft のクラウドサービスだけでなく、SAML 認証を利用することで、DirectCloud を含む
> 様々なクラウドサービスに対応したい。とはいえ、設定はユーザーがする。**」

同じ日に、最初のログインについてはこう決まっている:

> 「**管理者のメアドなどは必要ない。ローカルおよび SSO が使えない場合はすべてパスワードのみにする。**」

## 決定

> 基準日: 2026-08-13

**認証手段に順位をつける。上から使えるものを使う。**

| 順位 | 手段 | いつ使うか | 実装 |
|---|---|---|---|
| **1** | **SAML（SSO）** | 組織で IdP を運用している | **v1** |
| **2** | **メールアドレスの OTP** | 🚨 **理想**。IdP が無い / 個人利用 | **v1** |
| **3** | **パスワード** | **SSO も OTP も使えない環境**（ローカル・オフライン） | **v0.9（実装済み）** |

**v0.9 の時点では 3 だけ**（+ 既存の Google OAuth）。**1 と 2 は v1。**

### 🚨 パスワードは「無くす方向」の手段

パスワードは**フォールバック**であって、目標ではない。
**OTP が入ったら、パスワードは「OTP も届かない環境」のためだけに残る。**

したがって v0.9 の実装は:

- **パスワードを前提にした作りを固定しない**（後で OTP に置き換わる）
- **メールアドレスを必須にしない**（v0.9 の最初のログインはパスワードのみ・メール欄なし）
  🚨 ただし **OTP はメールアドレスが要る**ので、**v1 でメールを扱う経路が復活する**。
  「メールを一切使わない」は **v0.9 限定の話**であって、恒久の方針ではない

### SAML は「ユーザーが設定する」

> 堀池: 「**とはいえ、設定はユーザーがする。**」

**IdP ごとの設定を作り込まない。** 汎用の SAML として作り、**利用者が GUI で設定する**。

- 対応先を列挙して個別実装しない（Entra ID / Google Workspace / Okta / … は**同じ SAML**）
- 🚨 **設定 UI の手本**は憲章 `.claude/design-perf-charter.md` §3c に記録済み
  （Anthropic の SSO 設定画面。**2択をカードで選ばせる / 未入力なら確定を無効にする** など）
- 想定する入力: **IdP の SSO URL / Entity ID / X.509 証明書**、または **メタデータ XML のアップロード**
- **属性のマッピング**（email / firstName / lastName / groups）も利用者が設定できるようにする

## 理由

**利用者の環境を先に決めつけない。**

- 組織で IdP を持っているなら **SAML が最も安全で運用が楽**（退職時に IdP 側で止めれば終わる）
- IdP が無い組織・個人は **OTP がいちばん安全**（パスワードを覚えない・使い回さない・漏れても再利用されない）
- **どちらも使えない環境が必ずある**（オフライン・検証環境・ローカル開発）ので、パスワードを残す

**IdP ごとに実装を分けない**のは、SAML が標準だから。分けると対応表が無限に伸びる。

## 影響

- **v0.9**: 変更なし。パスワードのみ（+ Google OAuth）で完成させる
- **v1**: SAML と OTP を足す。`idea.md` の v1 に「GUIで SSO を設定して使える」があり、**その中身がこれ**
- 🚨 **v0.9 の作りで、後で困らないようにしておくこと**:
  - セッションの発行を認証手段から切り離す（`issueSession()` が誰から呼ばれても同じ形）
  - **ユーザーの識別子をメールに固定しない**（SAML の `NameID` は必ずしもメールではない）
  - ログイン画面を**手段ごとに差し替えられる**形にする（いまは「パスワード欄1つ」だが、
    v1 で「メール欄 + OTP」「SSO ボタン」が増える）

## やらないこと

- **IdP ごとの個別実装**（Entra ID 専用の分岐など）。SAML として1本で作る
- **パスワードの多要素化**（TOTP アプリなど）。**OTP と SAML があれば要らない**。
  必要になったら再検討する
- **v0.9 でメールを送る仕組みを作り込む**（OTP には要るが、v1 の話）

## 関連

[[two-tier-auth]] / [[v09-open-questions-answered]]
