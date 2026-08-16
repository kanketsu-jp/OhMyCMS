---
type: decision
title: 多層で守ると、層ごとの退行が外から見えなくなる
description: 同じヘッダを「全応答の既定」と「個別の口の自前」の 2 つが供給するようになった結果、応答だけを見る受入検査が供給元を区別できなくなった。片方が消えても応答は変わらないので緑のまま通る。層は減らさず、検査が自分の盲点を申告する形にする。実装はしていない。
tags: [security, acceptance, testing, ci]
status: active
generated:
  by: agent
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://acceptance/checks/v1-b-storage.mjs"
  - resource: "repo://acceptance/checks/09-svg-attachment.mjs"
  - resource: "repo://apps/studio/next.config.ts"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/layers-hide-each-others-regressions
  authorship: agent
---

# 多層で守ると、層ごとの退行が外から見えなくなる

> 🚨 **これは提案ではなく、起きた事実の記録。** 直しは入れていない（検査の持ち主は別）。

## 決定

**層は減らさない。代わりに、検査が「これでは供給元を区別できない」と自分で申告する。**

「検査しやすくするために自前の防御を外す」は向きが逆
（守りを捨てて可視性を買うことになる）。

## 何が起きたか（2026-08-17）

`apps/studio/next.config.ts` の `headers()` が **全応答**に
`X-Content-Type-Options: nosniff` を付けるようになった（`646f604`）。
それ以前から、**個別の口が自前でも同じヘッダを付けていた**
（`lib/files/service.ts` と `app/api/auth/saml/metadata/route.ts` の 2 つが値を決めている）。

**同じ値を 2 つの経路が供給するようになった。**

### 🚨 その結果、見張っていた検査が 2 本とも効かなくなった

```
【測った】nosniff を見ている検査は 2 本
   母集合 … 追跡済みの `acceptance/**` と `apps/studio/scripts/**`
   叩き方 … git grep -ln nosniff -- acceptance apps/studio/scripts   → 2 ファイル
   🟢 対照 同じ範囲で attachment … 7 ファイル（＝ この数え方は「在り」も出せる）
```

| 場所 | いま何が起きているか |
|---|---|
| `acceptance/checks/v1-b-storage.mjs:240` | assertion（落ちる側）。判定は `svgAsset.headers.get("x-content-type-options")` ＝ 🚨 **応答しか見ていない。誰が付けたかは見ていない** |
| `acceptance/checks/09-svg-attachment.mjs:190` | 🚨 assertion ではなく **`details.push` の注記**。条件が `if (!headers.get(...))` なので、**既定が入った今この枝は二度と通らない**（＝ 到達不能） |

```
🚨 v1-b-storage:240 は **鈍くなった**（落ちなくなったのではない）
   `lib/files/service.ts` の自前 nosniff が消えても、
   **既定が同じ値を同じ応答に入れる**ので、assertion の見ている 1 行は変わらない
   ＝ **利用者は守られたまま。ただし検査は実装を見ていない**
🚨 09-svg-attachment:190 の note は **死んだ**
   「nosniff がありません…付与を推奨します」は **もう出ない**。残すと読んだ人を誤らせる
```

### 実測（**GET のみ・書き込み 0**）

```
GET /api/assets/00000000-0000-0000-0000-000000000000  status=401  nosniff の行数=1
                                             🚨 `service.ts` に到達しない応答にも既定が付く
GET /api/auth/saml/acs                                status=405  nosniff の行数=1
🟢 対照 :3199（居ないホスト） → 000 / 0 行（＝ この計器は 0 も出せる）

叩き方: curl -sS -D - -o /dev/null -X GET <url> | grep -ci '^x-content-type-options:'
```

## 🚨 逃げ道（「既定が効かない口で測る」）は、事実上ない

既定の `source` は `/:path*`（全経路）なので、
**「既定を持たない口」を測定点として選ぶことができない。**

🚨 **ただし「全経路」は文字どおりには成り立たない。**

```
【storage が測った・2026-08-17 21:55】私は再現していない
   GET /api/assets/<行は在るが実体が無い id> → **500（未処理の例外・ENOENT）**
      🚨 その 500 には **nosniff が付かない（0 行）**
   🟢 対照 存在しない id → 404
```

🚨 **つまり既定が届かない応答は実在する。**
**しかしそれは測定点には使えない**——「未処理の例外」であって、
**それ自体が直すべき欠陥**だから（「行は在るが実体が無い」は 404 であるべきで、
500 にした上にヘッダまで落ちている）。**欠陥を測定器として使わない。**

## 一般化

> 🚨 **同じ結果を 2 つ以上の経路が供給するとき、結果だけを見る検査は供給元を区別できない。**
> **層を足すたびに、外から見える情報はむしろ減る。**

これは「守りを足すな」ではない。**足すなら、見えなくなるものを同時に書き留めろ**ということ。

- 個別の自前を残す理由は既に各所に書いてある
  （`saml/metadata/route.ts`: 「既定を将来外す人が、この口の判断まで一緒に落とさないため」）
- 🚨 **その理由を書いた同じ場所に、「だからこの口では既定の生死を測れない」も書く**
  （`saml/metadata` には書いてある。`service.ts` にはまだ無い）

## 🚨 測っていないこと

```
🚨 実在の asset（**200**）では打っていない
   測ったのは **401** で、言えるのは
   「`source: "/:path*"` が `/api/assets/…` に効く」という **経路の一致**まで
   （自前と既定で二重にならないことは別途実測済みなので、200 でも 1 行の**はず**。
     🚨 **「はず」であって「だった」ではない**）
🚨 200 が測れない理由も判明している（storage の実測）:
   生きている行は local 23 のみ・**s3 は 0**（s3 の 24 件は受入が全部ゴミ箱へ入れた）。
   その local 23 も実体が無く 500 になる
🚨 500 に nosniff が付かないことは **storage の測定**で、私は再現していない
```

## 関連

[[checks-must-declare-blind-spots]] / [[guards-keyed-by-name-break-silently]] / [[verify-the-verifier]]
