---
type: area
title: SAML（SSO）の現状
description: IdP との往復・改竄やリプレイの拒否・メタデータ・設定画面は動いている。一方でログイン画面に入口が 0 件、許可リストの画面が 0 件・データ 0 行なので、有効にしても全員が権限なしになる。実物の IdP は未確認。決まっていないこと（303 / 282）も分けて置く。
tags: [auth, saml, sso, permissions]
status: active
generated:
  by: agent
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/lib/auth/saml/verify.ts"
  - resource: "repo://apps/studio/lib/auth/saml/metadata.ts"
  - resource: "repo://apps/studio/lib/auth/saml/allowlist.ts"
  - resource: "repo://apps/studio/app/login/page.tsx"
  - resource: "repo://apps/studio/app/api/auth/saml/acs/route.ts"
  - resource: "repo://acceptance/checks/v1-a-saml.mjs"
  - resource: "repo://apps/studio/scripts/check-saml-entry-needs-key.mjs"
  - resource: "repo://knowledge/decisions/auth-methods.md"
stale_after: 2027-02-16
x_rag_okf:
  id: areas/auth-sso
  source_commit: 53c5064
  authorship: agent
---

# SAML（SSO）— いまどこまで動いていて、どこが未完成か

> 総覧。**決めごとは書かない**（決定は `decisions/auth-methods.md` と `decisions/two-tier-auth.md`）。
> 設計の経緯は `docs/design/sso-user-provisioning.md` / `docs/design/sso-only-switchover.md`。
> **ここは「いまどうなっているか」だけ**を、実測つきで置く。
> 測った日: 2026-08-16（HEAD `7c54172`）。**数字はすべて、その日にコマンドで引いたもの**。

## 一言でいうと

**配管は通っているが、蛇口とバケツが無い。**
プロトコルの難所（署名・リプレイ・戻り先）は受入で通しているのに、
**入口（ログイン画面）と受け皿（許可リストの画面）が無いので、誰も使えない。**

## 出来ている

| こと | 実測 |
|---|---|
| IdP との往復 | 受入 `V1-A`（`acceptance/checks/v1-a-saml.mjs`）が**実物の Keycloak** で通しで測る |
| 攻撃を弾く | 同受入が **改竄・署名なし・Audience 不一致・期限切れ・リプレイ・戻り先の細工**を弾くことを確認 |
| SP のメタデータを出す | `/api/auth/saml/metadata` が 200 で XML を返す |
| 設定を GUI から入れる | `settings/saml` を呼ぶ画面 **2 枚** |
| 許可リストの API | 取得・追加（`allowed-emails/route.ts`）・削除（`[id]/route.ts`） |

**広告している NameID の形式**（動いているサーバの応答から）:
`unspecified` / `persistent` / `emailAddress` の **3 つ**。

## 🚨 未完成

| こと | 実測 | 効いてくるところ |
|---|---|---|
| **ログイン画面に入口が無い** | `app/login/page.tsx`（87 行）に `saml` **0 回** / `sso` **0 回**（🟢 対照 `otpEnabled` は 2 回） | **画面から SSO でログインする経路が無い**。`/api/auth/saml/login` を直に叩くしかない |
| **許可リストの画面が無い** | その API を呼ぶ画面 **0 件**（🟢 対照 `settings/saml` を呼ぶ画面は 2 件） | 管理者が許可リストへ 1 行も足せない |
| **許可リストのデータが 0 行** | 一度も入っていない | `isAllowedEmail` は行が無ければ false ＝ 🚨 **SSO を有効にしても、入った人は全員「権限なし」** |
| **実物の IdP が未確認** | 受入自身が `unverified` と明記（`v1-a-saml.mjs:25`）。テナントが要る | 「Keycloak で通る」と「Entra ID / Google Workspace で通る」は別 |

🚨 **「まだ使われていない」ではなく「使えない」。** ここを区別すること。

## 2026-08-16 に入ったもの

> 🚨 **sha で書く。**「今日」は明日には意味を失う（`git log --diff-filter=A -- <パス>` で引いた）。

- `89e5cd9`（13:22）**`transient` の NameID を断る**（設問 292 A）。広告から外し、受け取り側でも断る。
  🚨 `metadata.ts` と `verify.ts` は**対**で、片方だけ消すと意味を失う
- `03dcb8a`（13:33）**入口ができたら文言の鍵を要求する検査**（`scripts/check-saml-entry-needs-key.mjs`）。
  いまは入口が 0 件なので**何も止めない**。入口を作った人の手元で、その瞬間に落ちる
- 参考: SAML そのものが入ったのは `f96973f`（08-14 02:06）

## 🚨 決まっていないこと（**ここに答えを書かないこと**）

- **SAML の位置づけ**（誰が使う想定か・ログイン画面に出すのか）… 設問 303 で**未回答**。
  🚨 302/292 の備考にある「SSO」は **Google ログイン**を指しており、SAML の話ではない
- **メールを識別子から外すか**（設問 282 / 293）… 未回答。
  🚨 **許可リストは `email` 列で引く**ので、答えによっては**表の鍵ごと変わる**。
  だから許可リストの画面を先に作っていない（作ると作り直しになる）
- **`unspecified` の扱い** … 292 の回答は `transient` についてのみ。**決めていないので、通している**

## この総覧が古くなる条件

- ログイン画面に SAML の入口ができたとき（**上の「未完成」の 1 行目が嘘になる**）
- 許可リストの画面ができたとき、またはデータが入ったとき
- 実物の IdP で通したとき
- 282 / 303 に答えが出たとき

🚨 **【書いただけ】この総覧は、古くなっても鳴らない。** 上のどれかをやった人が、ここも直すこと。
