---
type: decision
title: 管理画面は「全部見える」か「何も見えない」の二値。だから権限で 0 件の文言はまだ足さない
description: 管理画面へ入るには admin_access が要り、admin_access が在ると権限判定は全部許可になる。だから「一部だけ見える人」を作れず、403 の帯も行フィルタで 0 件も、いまの管理画面では起きない。API / CLI / MCP では本当に起きる。門を二値でなくする日に、items.empty の 1 文では足りない。
tags: [permissions, auth, i18n, ui]
status: accepted
date: 2026-08-17
---

## 決定

**「権限で 0 件になったとき」の文言を、いまは足さない。**
**ただし門を二値でなくする日には必ず要る**ので、その日に触る人が読めるようここに残す。

## なぜ — 管理画面には中間が無い

```
`app/(admin)/layout.tsx:105`     サイドバーのため `/api/collections?names=true` を引く
`app/api/collections/route.ts:12` 🚨 `requireAdminAccess(actor, "schema:read")`
`app/(admin)/layout.tsx:114-122`  403 `ADMIN_ACCESS_REQUIRED` → `NotAllowedScreen`
`lib/permissions/resolve.ts:202`  admin_access が在れば
                                  `allowed:true / allowedFields:"*" / rowFilter: tenantScopeFilter(actor)`
`lib/permissions/resolve.ts:181`  🚨 `tenantScopeFilter` は **agent 以外は必ず null**
```

したがって **human の利用者は 2 つしか無い**。

| 利用者 | 管理画面で何が起きるか |
|---|---|
| `admin_access` **無し** | 🚨 一覧に**到達しない**（`NotAllowedScreen`） |
| `admin_access` **有り** | 🚨 **全部見える**（403 も行フィルタも通らない） |

**＝ 「一部のコレクションだけ見える人」「行フィルタで一部の行だけ見える人」を、いま作れない。**

## どう確かめたか

**2 人が別の道具で測り、結論は一致した。根拠は 1 つ捨てた。**

```
① auth（curl・HTTP と、返った HTML の可視テキスト）
   権限ゼロの利用者（`POST /api/auth/dev-login`・🚨 `?admin=true` を付けない）
     `/api/items/<c>`                → 🚨 403 PERMISSION_DENIED   ＝ A は API 層に実在
     `/api/collections?names=true`   → 🚨 403 ADMIN_ACCESS_REQUIRED
     `/admin/content/<c>`            → HTTP 200 ／ 🚨 可視テキストは
        「OhMyCMS ／ まだ許可されていません ／ このアカウントは、まだ許可されていません。
          管理者に連絡してください。 ／ ログアウト」だけ
        ＝ ErrorBanner（帯）も ListEmpty も **0 個**

② base2（本物のブラウザ・**水和したあと**）… 同じ結論。**confirmed**
   🟢 対照① admin で同じ URL … 「まだ 1 件もありません」＋ サイドバーに 15 コレクション
   🟢 対照② 未ログインで同じ URL … **/login へ遷移**
   ＝ **計器が 3 通りを撃ち分けた**（0 しか出ない計器ではない）
```

🚨 **捨てた根拠: 「生の HTML に文字列が在るか」は弁別に使えない。**
auth は「『この操作を行う権限がありません』は script の中なので不可視」と書いたが、
base2 が 3 ケースで数えたら **権限ゼロ / admin / 未ログイン のどれでも 4 語すべてが生 HTML に在った**
（未ログインの人は `/login` に居るのに、である）。
**＝ 全対象から到達するものは弁別に使えない**（`count-before-you-report.md` §2-3d）。
**言えるのは「水和後の可視テキスト」までで、生 HTML の語の有無は捨てる。**

### 🚨 「UI に入れないだけ」であることの裏（security の実測・3 通りを撃ち分け）

**同じ日に security が台を立て、実 HTTP で 3 人ぶん測った（残骸 0）:**

| 利用者 | `/admin/content/<c>`（画面） | `/api/items/<c>`（API） |
|---|---|---|
| U1 ポリシー無し | `NotAllowedScreen` | **403** |
| 🚨 U2 `admin_access` 無し ＋ **そのコレクションの read 権限あり** | `NotAllowedScreen`（**入れない**） | 🚨 **200・2 行（読める）** |
| 🟢 U3 `admin_access` あり | 一覧が出る | 200 |

🚨 **U2 が要点。** コレクション単位の権限は **API では完全に機能している**。
**機能していないのではなく、UI がそこへ辿り着かせないだけ。**
＝ **「管理画面で起きない」を「実装が無い」と読まないこと。**

## 🚨 いま踏める人が居ないことを、数で

**共有 dev DB の実測（2026-08-17・読み取り）:**

| ポリシー | `admin_access` | 紐づく `directus_access` |
|---|---|---|
| `dev-admin` | true | 248 |
| `Administrator` | true | 2 |
| `mcp-admin-ok-…` | **false** | 🚨 **0** |

🚨 **`admin_access=false` のポリシーを持つ利用者は 0 人。**
**これは「異常が無い 0」ではなく「そういう人がまだ居ない 0」である。**

## 🚨 見ていない範囲（落とさない）

- **母集合**: `app/**` の `page.tsx` / `layout.tsx` で `/api/items` を引くもの … **2 本**
  （`content/[collection]/page.tsx` 一覧 ／ `[id]/page.tsx` 1 件）**両方とも門の内側**
  🟢 対照: 同じ探し方で `/api/collections` … **4 本**（＝ この探し方は「在り」も出せる）
  🚨 外れる作り方として **部品側**を引いた → `components/admin/panel-api-mcp.tsx` 1 本。
  ただし **fetch ではなく画面に出す例示のパス文字列**だった
  🚨 `app/admin/**`（route group の外）の 8 本は **全部 route handler**（画面ではない）
- 🚨 **API / CLI / MCP は別**。そちらでは 403 も行フィルタも**本当に起きる**
  （security の実測と収束。`rowfilter-empty-is-allow-all` / `soft-deleted-permissions-must-not-grant` の
  修正は、**この経路のための先回り**であって、いま踏む人が居るという意味ではない）
- 🚨 **agent は二値ではない**。`capabilities` でコレクションを絞れ、`tenantScope` が
  **非 null になりうる**（`resolve.ts:181-188`）。＝ **agent には B が今日でも起こせる**
- 🚨 **帯の見た目・寸法は測っていない**（測ったのは「その文字列が DOM に在るか」まで）

## 🚨 門を二値でなくする日に、必ず読むこと

toast（文言の持ち場）の実測と申し送り、**原文のまま**:

> `items.empty` … 「**まだ 1 件もありません。**」**1 つだけ**
> （`app/(admin)/admin/content/[collection]/page.tsx:220`）
> ＝ 🚨 **0 件の理由を問わず、同じ 1 文**です
>
> 🚨 files の出し分けの条件は **`activeLabel`＝ 利用者が自分で選んだ絞り込み**です
> ＝ 🚨 **「権限の行フィルタで 0 件になった」は、files でも区別できません**
> （**利用者は絞り込んでいないので `empty_folder`＝「この場所は空です」が出ます**）
>
> 💭 直すなら **鍵が 1 本要ります**（例 `items.empty_no_access` /
> 「**あなたに見える行がありません。権限の設定によるものです。**」のような）

🚨 **いま足さない理由は「不要だから」ではなく「今日それを見る人が 1 人も居ないから」。**
**門を二値でなくする変更と、この鍵は同じ作業単位で入れること。**

## 関連

- `knowledge/decisions/not-yet-allowed-is-not-logged-out.md`（未許可の人をログイン画面へ送らない）
- `knowledge/decisions/rowfilter-empty-is-allow-all.md`（行フィルタの空は全許可）
- `knowledge/decisions/soft-deleted-permissions-must-not-grant.md`（同じ「入り口がまだ無い」形）
- `knowledge/areas/permissions.md`（権限の総覧）
