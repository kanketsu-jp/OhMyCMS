---
type: decision
title: 「どの欄が悪いか」は入れ物で運ぶ。code → 文言の写像は捨てず、その上に載せる
description: いまサーバは「どの欄が悪いか」を返せない（応答は code と message だけで、欄名は日本語の文の中に埋まっている）。ApiError に任意の欄リストを足し、応答へ fields として載せ、クライアントは既存の code → 鍵の写像をそのまま欄ごとにも使う。文言は載せない（生文言は禁止されている）。適用の順番は「サーバが欄を言える密度」と「利用者が毎日触るか」で割れるので、両方を出す。
tags: [errors, i18n, forms, api]
status: accepted
date: 2026-08-17
---

## 決定

**「どの欄が、なぜ悪いか」を運ぶ入れ物を 1 つ決める。**

```
サーバ … `ApiError` に **任意の第 4 引数** `fields?: FieldIssue[]` を足す
応答 …… `{ error: { code, message, fields?: [{ field, code }] } }`
        🚨 **欄ごとの文言（message）は載せない**（下記「なぜ文言を載せないか」）
受け側 … `ApiResult` の失敗形に `fieldIssues?: { field: string; messageKey: ErrorKey }[]`
        🚨 **写像は既存の `errorKeyFromApiCode` をそのまま使う**（新しい辞書を作らない）
```

🚨 **`API_CODE_TO_KEY` は捨てない。その上に載せる。**
既存の code は「**その操作全体がなぜ失敗したか**」、`fields` は「**どの欄か**」で、**別の問い**。
全体の code だけでは欄が分からず、欄だけでは「保存そのものが拒まれた」が言えない。**両方要る。**

🚨 **見せ方（上にまとめる / 欄の脇 / 飛ぶ）は design の持ち場。この決定は入れ物までしか決めない。**

## ④ サーバは「どの欄か」を返せるか — **いまは返せない。返す形が無い**

```
【引いた】`lib/schema/errors.ts` … `ApiError(status, code, message)` … 🚨 **欄の口が無い**
【引いた】`lib/schema/api.ts:10` … 応答は `{ error: { code, message } }` … 🚨 **これで全部**
【引いた】欄・path・errors を応答へ載せている箇所 … **0 件**
   🟢 対照 同じ探し方で `error: {` … 2 件（`api.ts` の 2 箇所＝ この探し方は当たる）
```

### 🚨 欄の名前は「投げる時点では分かっている」。日本語の文の中に埋まっているだけ

```
【引いた】`new ApiError(400, …)` … **139 件**（🟢 対照 出鱈目な語 0 件）
   code 別 … INVALID_FIELD **35** ／ INVALID_BODY 12 ／ INVALID_SCHEMA 5 ／ INVALID_FILTER 5 …
   🚨 合計 136 で 139 と 3 件ずれる ＝ **変数で code を渡す形**（この数え方では拾えない）

INVALID_FIELD 35 件のうち 🚨 **11 件が変数を埋め込んでいる**（🟢 対照 24 件は定数）
   `throw new ApiError(400, "INVALID_FIELD", \`${key} は必須です\`)`
   `throw new ApiError(400, "INVALID_FIELD", \`${field}は文字列またはnullで指定してください\`)`
   ＝ 🚨 **`key` / `field` を持っている。文にして捨てている**
```

🚨 **そしてその文は、画面に届いていない。**
`lib/admin/api.ts` の `ApiResult` は失敗時に **`messageKey` と `code` しか持たない**
（🟢 対照 `messageKey` を読む画面 26 本 ／ `error.message` を読む箇所 **0 件**——
`error.message` を含む 4 箇所は**すべて「出さない」と書いたコメント**）。
＝ **`${key} は必須です` の `key` は、誰にも届かないまま消えている。**

### 🚨 DB が弾いた場合は、PostgreSQL が列名を持っていることがある（**実測**）

`rethrowAsConflict`（`lib/schema/errors.ts`）は SQLSTATE を `ApiError` に翻訳するが、
**元のエラーが持っている列名を捨てている**。使い捨ての台（**トランザクション内で作って ROLLBACK。
共有 DB に何も残していない**。🟢 対照 残った台 0 件）で測った:

| SQLSTATE | いまの code | `column` | `constraint` |
|---|---|---|---|
| **23502** not_null | `REQUIRED_FIELD` | 🟢 **`"need"`（列名が在る）** | — |
| 22P02 invalid_text | `INVALID_VALUE` | 🚨 **undefined** | — |
| 23505 unique | `ALREADY_EXISTS` | 🚨 undefined | 🚨 `"zz_..._uniq_key"`（**制約名**） |

🟢 対照: 同じ台で成功する INSERT は成功した（＝ 台は動いている）。

🚨 **測り直している。** 最初は savepoint を使わず 3 件を続けて流し、
**2 件目・3 件目が `25P02`（トランザクションが既に中断）で実行されていなかった**。
**1 件しか測れていないのに 3 件測ったつもりでいた。** savepoint を挟んで測り直したのが上の表。

- 🟢 **23502 は列名をそのまま `fields` に載せられる**（利用者の入力が原因の 400。既に 400 扱い）
- 🚨 **22P02 は列名を持たない**。載せたいなら**アプリ側が事前に型検証する**しかない
- 🚨 **23505 は制約名しか無い**。列へ落とすには `pg_constraint` を引き直す必要が在る
  （**やるかどうかは別の判断**。決定 `guards-keyed-by-name-break-silently` と同じ、名前で効く形になる）

## ① 型 — 何を持つか

```ts
// lib/schema/errors.ts
export type FieldIssue = {
  field: string;   // 🚨 スキーマ識別子（"title" / "status"）。**辞書化しない**（AGENTS.md §3.8）
  code: string;    // 🚨 ApiError の code と同じ空間（"FIELD_REQUIRED" 等）
};
```

- **1 欄に複数の理由が在りうるか → 在りうる**（必須かつ形式違反）。**配列で持つ。**
  🚨 **減らすのは後からできるが、増やすのは形を変えることになる**ので、最初から配列にする。
  **同じ `field` が 2 行出ることを許す**（**何件出すかは design が決める**）
- 🚨 **`message` は持たせない**（下記）
- 🚨 **`field` の表示名はここで解決しない。** 既存の `fieldLabel`（`lib/schema/labels.ts`）が
  `directus_fields.translations` から引く。**入れ物は識別子だけを運ぶ**

### 🚨 なぜ欄ごとの文言を載せないか

`lib/admin/forms.ts` に**削除された関数の墓標**が在る:

> 🚨 かつて `apiMessage()`（API の生文言をそのまま返す関数）がここにあった。2026-08-15 に削除した。
> `?error=` は利用者が自由に書けるので、生文言を載せる作りだと **細工したリンクで任意の文章を
> 「アプリが出した公式のエラー」として画面に出せる**（なりすまし）。
> 🚨 **無いから作ろう、としないこと。**

**欄ごとに `message` を足すのは、この関数を欄の数だけ作り直すのと同じ。**
**運ぶのは `field` と `code` だけ**にし、文言は**画面側が辞書から引く**。
見張りは既存の `scripts/check-no-api-message.mjs`。

## ② どこで作るか — 合流点は 1 つ

```
サーバ側の検証 …… `ApiError(400, code, message, fields)` で投げる（**任意なので既存は無改修**）
DB が弾いた場合 … `rethrowAsConflict` が 23502 の `column` を `fields` に載せる
                  🚨 22P02 / 23505 は載せられない（上記）
   ↓ 応答 `{ error: { code, message, fields? } }`
クライアント …… `lib/admin/api.ts` が `fieldIssues` に写像（`errorKeyFromApiCode` を欄にも使う）
   ↓
🚨 **手前（HTML の検証・クライアント検証）とここが合流する場所は「フォームの状態」で、
   そこは実装と design の持ち場。この決定は「合流できる形にする」までしか決めない。**
```

🚨 **Directus は手前と奥で 2 回検証し、見せ方を 1 つに揃えている**（base2 の実測・
`use-item/index.ts:181-188` で保存前に throw、`:462-466` で API 由来も同じ入れ物へ合流）。
**この決定はその「同じ入れ物」に当たる部分だけ**を決めている。

## ③ `API_CODE_TO_KEY` との関係 — **捨てない。同じ写像を欄にも使う**

```
【引いた】`API_CODE_TO_KEY` … 🚨 **1 本**（`i18n/error.ts` の中だけ。外から呼ばれていない）
   外向きの口は `errorKeyFromApiCode` / `errorKeyFromQuery` / `ERROR_KEYS`
   `@/i18n/error` を import する本 … **23 本**
🚨 司令塔は「9 本が使用」と書いていたが、私の数では **どの切り方でも 9 にならない**
   （1 / 0 / 7 / 2 / 23）。🚨 **合わせにいかず、両方を残す**——
   **司令塔がどの述語で 9 と数えたかは、私には分からない**
```

- 欄ごとの code も **`errorKeyFromApiCode` に通す**。新しい表を作らない
- 🚨 **足りない鍵は `unexpected` に落ちる**（fail closed）。**危険側には倒れない**
- 🚨 **1 つの code に意味を 2 つ入れない**という既存の規律（`ERROR_KEYS` の注記群）は、
  欄ごとの code にもそのまま効く

## 🥈 適用の順番 — **2 つの軸が食い違うので、両方出す**

司令塔の見立ては「**利用者が毎日触るもの**（items の作成・編集）→ 設定 → その他」。
🚨 **私が数えた分布は、それと一致しない。**

```
🚨 軸A「サーバが欄を言える密度」… `new ApiError(400,…)` を持つファイル数
   app/api 17 ／ lib/items **4** ／ lib/schema 3 ／ lib/drive 2 ／ lib/auth 2 ／ 以下 1 本ずつ
   INVALID_FIELD 35 件の置き場 …
     🚨 files **8** ／ settings **6** ／ reports **6** ／ labels **5** ／ permissions-api 3 ／ schema 3
     🚨 **items は 1 件**
🚨 軸B「利用者が毎日触るか」… items の作成・編集（司令塔の見立て）
```

**なぜ食い違うか（私の見立て・🚨 未検証）**: items は**実行時にスキーマが変わる**ので、
アプリ側で欄ごとの検証を持てず、**DB に弾かせている**。だから `ApiError(400)` が少ない。
＝ **items を先にやるなら、必要なのは「入れ物を使う」ことではなく「23502 の `column` を載せる」こと**
（上の表の 1 行目。**そこだけが items に効く**）。

**私の提案:**

```
第 1 段 … 🚨 **入れ物そのもの**（`FieldIssue` / 応答 / `ApiResult`）＋ **23502 の column を載せる**
          ＝ **items に効く最短路**（軸B）で、かつ **1 箇所の修正**（`rethrowAsConflict`）
第 2 段 … 🚨 **INVALID_FIELD で変数を埋めている 11 件**（＝ **欄名を既に持っている**）
          ＝ **文を作り直さず、持っている値を `fields` へ渡すだけ**
第 3 段 … files 8 / settings 6 / reports 6 / labels 5（軸A の密度順）
🚨 **71 本を一度に直さない。** 上の 3 段はどれも **サーバ側だけ**で完結し、
   **画面を 1 枚も触らずに「欄が分かる応答」まで到達する**
```

🚨 **画面側（74 本）の適用順は design が決める。**
私が言えるのは「**サーバがどこから欄を言えるようになるか**」までで、
**どの画面から見せるかは、見せ方を決める人の判断**。

## 🚨 見ていない範囲・確かめていないこと

- 🚨 **動くことは確かめていない**（**設計のみ。1 行も実装していない**）
- 🚨 **押す検証はできない**（全員のタブが hidden。ただし設計なので影響しない）
- 🚨 **74 本という母集合は「保存の口を持つ `.tsx`」**（`onSubmit` に加えて `apiFetch` / `fetch` も
  含めて 2 回広げた結果）。**外れる作り方**: フォームを持たず route handler へ直接 POST する形
  （`app/admin/actions/**` の 8 本）は**この 74 に入っていない**
- 🚨 **`aria-invalid` 3 / 74・`scrollIntoView` 0 / 74** は**属性名で数えた**。
  **別の作り方（`data-invalid`・独自の prop）なら落ちる**
- 🚨 **22P02 / 23505 から列名を得る方法は決めていない**（`pg_constraint` を引く案は在るが未検討）
- 🚨 **`ApiError` の第 4 引数を足すと SDK / CLI / MCP の型に波及するか**は**引いていない**
  （`packages/**` を見ていない。**判断に効くので、実装に入る前に必ず見ること**）

## 関連

- `knowledge/decisions/i18n-check-scope-is-what-reaches-the-screen.md`（生文言を画面へ出さない）
- `knowledge/decisions/guards-keyed-by-name-break-silently.md`（名前で効く仕組みの弱さ）
- `knowledge/decisions/admin-ui-is-all-or-nothing.md`（同じ日に測った、画面と API の層の違い）
