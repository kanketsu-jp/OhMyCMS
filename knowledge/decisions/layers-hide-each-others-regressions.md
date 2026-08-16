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

## 🚨 逃げ道（「既定が効かない口で測る」）は、無い

既定の `source` は `/:path*` で、**測った限りどの応答にも届いている。**
したがって **「既定を持たない口」を測定点として選ぶことができない。**

```
【storage が測った・HEAD 935a681 で焼き直した :3103・同じセッション】私は再現していない
   200（/api/health） … nosniff 1 ／ 404（行なし） … nosniff 1
   🚨 500（実体が無い） … **nosniff 1**（＝ **未処理の例外の応答にも届く**）
   🟢 コンテナ内の next.config.ts の nosniff … 2（＝ その版に既定が載っている）

【自分で測った・同じ台・GET のみ・書き込み 0】
   /api/health 200 / /api/assets/<存在しない id> 401 / /api/auth/saml/acs 405
      … 🚨 **3 つとも nosniff 1 行・x-frame-options 1 行**
   🟢 対照 :3199（居ないホスト） … nosniff 0
   叩き方: curl -sS -D - -o /dev/null <url> | grep -ci '^x-content-type-options:'
```

### 🚨 ここは一度、逆に書いていた（経緯を残す）

**この節には最初「全経路ではない。500 には既定が届かない」と書いてあった。**
根拠は storage の実測だったが、**その測定は既定が入る前の版（`d2be82b`・前日 19:33）を焼いた台**で
採られていた（既定は `646f604`・当日 05:43）。**0 行は「異常が無い 0」ではなく「見ていない 0」**だった。
🚨 **storage が自分で気づいて取り消した**——気づけたのは、
**同じ台で 200（`/api/health`）も 0 行だった**から（「500 固有の性質」なら 200 は 1 でなければならない）。

```
🚨 教訓（storage の申告をそのまま）: **台で測ったら「その版に在るか」を 1 行添える。**
🚨 こちら側の教訓: **ラベル（【誰が測った・自分は再現していない】）は責任の所在を書くだけで、
   測定の成立を保証しない。** 載せた時点で、その計器を引き受けている。
✅ 引き受ける側にできること（toast）: **数だけ受け取らず、「どのコマンドで採ったか」を
   一緒に出させる。** 今回それが在れば、**`d2be82b` の焼きで測ったことは渡す時点で見えていた。**
```

🚨 **したがって「層を減らさない」という結論は、むしろ強くなった**——
既定が本当にどこにでも届くなら、**応答の側に逃げ道は一つも無い**。

### 🚨 これとは別だった欠陥は、直っている

**「行は在るが実体が無い」asset が 500（未処理の例外・ENOENT）になっていた**のは
別件の欠陥で、**`5b35214` で 404（`FILE_NOT_STORED`）になった**（storage）。

```
【自分で引いた】5b35214 は HEAD の祖先に在る／触ったのは lib/files/service.ts 1 本
   FILE_NOT_STORED の出現（lib/files・HEAD）… 3
   🟢 対照 存在しない語 ZZ_NO_SUCH_CODE … 0（＝ この数え方は 0 も出せる）
【storage が測った】500 → 404・ログの「未処理の例外」0 件・nosniff は 3 点とも 1 行
   私は 404 になったところを再現していない（未ログインでは 401 で手前で止まる）
```

🚨 **したがって、上の表の「500 … nosniff 1」は、いまはもう起きない状態の測定。**
消さずに残すのは、**この節が 3 回書き換わった経緯そのものが中身**だから。

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
🚨 500 に既定が届くことは **storage の測定**で、私は再現していない
   （自分で測ったのは 200 / 401 / 405 の 3 点まで）
```

🚨 **「実在の asset（200）で 1 行」は、まだ誰も測っていない。**
**s3 の生存が 0・local の実体が無い**ため、いまは**測れない**
（＝ ここは「異常が無い 0」ではなく **「測れていない」**）。

## 関連

[[checks-must-declare-blind-spots]] / [[guards-keyed-by-name-break-silently]] / [[verify-the-verifier]]
