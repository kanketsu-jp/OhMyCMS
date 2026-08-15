---
type: decision
title: Tailwind v4 は transform を translate / scale / rotate の 3 つに割った
description: v4 のユーティリティは transform ではなく translate / scale / rotate プロパティを出す。@keyframes に transform を書くと上書きにならず掛け算になり、scale-x-0 が付いた要素は animation が走っていても幅 0px のままになる。実測 3 例と見分け方。
tags: [design, ui, css]
status: active
generated:
  by: rag-okf
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/app/globals.css"
  - resource: "repo://apps/studio/components/ui/toast.tsx"
  - resource: "repo://apps/studio/scripts/headless-browser.mjs"
stale_after: 2027-02-16
x_rag_okf:
  id: decisions/tailwind-v4-transform-is-three-properties
  authorship: agent
---

# Tailwind v4 は transform を translate / scale / rotate の 3 つに割った

> 由来: 2026-08-16。**同じ形で 3 回外した**ので決定にした（司令塔の指示:
> 「animation は走っている・色も付いている・それでも面が 0px、という形は、
> **知らないと永久に気づけません**。3 回出たので、4 回目が必ず来ます」）。

## TL;DR

- **v4 のユーティリティは `transform:` を出さない。** `translate:` / `scale:` / `rotate:` を出す
- 🚨 **`@keyframes` に `transform:` と書いても、上書きにならない。掛け算になる**
- 🚨 **`scale-x-0` が付いた要素は、`transform: scaleX(1)` の animation を当てても幅 0px**
- **症状**: animation は走っている・色も付いている・DOM にも在る。**それでも 0px**
- **v3 の記憶で書くと踏む。** v3 は 1 つの `transform` に全部入れていた

---

## 1. 【測った】3 つのプロパティに割れている

**2026-08-16・配信された CSS を headless Chrome で読んだ**（`http://localhost:3102/login`）:

```
.scale-x-0       { --tw-scale-x: 0%;      scale: var(--tw-scale-x) var(--tw-scale-y); }
.translate-x-px  { --tw-translate-x: 1px; translate: var(--tw-translate-x) …; }
🟢 対照 .flex    { display: flex; }          ← 素のユーティリティも読めている
🟢 対照 在るはずのないクラス … 0 件
```

**＝ `transform:` という宣言が出てこない。** `scale:` / `translate:` という**別のプロパティ**。

## 2. 【測った】合成は「上書き」ではなく「掛け算」

**同じ日・同じブラウザで、素の div を 5 つ作って実寸を測った**（幅 200px・`transform-origin: left`）:

| 与えたもの | 実測の幅 |
|---|---|
| 何も無し | **200px** |
| `transform: scaleX(0.5)` だけ | **100px** |
| `scale: 0.5 1` だけ | **100px** |
| 🚨 **両方** | **50px** ← `0.5 × 0.5`。**上書きなら 100px のはず** |
| 🚨 `scale: 0 1` ＋ `transform: scaleX(1)` | **0px** |

🚨 **最後の行がこの決定の核心です。**
**`scale-x-0` が付いている要素に、`transform: scaleX(1)` へ向かう animation を当てても、
`0 × 1 = 0` で幅は 0px のまま。** **アニメーションは正常に走っています。**

## 3. 実際に起きた 3 件

```
① transform ではなく translate    2026-08-16 朝・design
   Button の「押すと 1px 沈む」を transform で探して見つからなかった
   （v4 は `active:…translate-y-px` → `translate:` プロパティ）
② hover: は @media (hover: hover) の中   同日・toast
   → `Emulation.setDeviceMetricsOverride({mobile:true})` だけでは
     `(hover: hover)` は **true のまま**。`setEmulatedMedia` が要る
🚨 ③ scale-x-* は scale プロパティ        同日・toast / schema
   トーストのプログレスバーが **幅 0px**。keyframes が `transform: scaleX()` だった
```

## 4. 🚨 いちばん危ない症状 —「測れなかった 0」に見える

```
[schema] getBoundingClientRect().width = 0 と報告
         → 本人も受け手も「**計器が測れていない**」と読んだ
🚨 実際  計器は測れていた。**本当に 0px だった**
```

**見分け方（対照を取る）:**
```
🟢 同じ計器で、別の要素が値を返しているか
   → 箱は 384px と出ていた ＝ **幅は測れている** ＝ **その 0 は本物**
```
🚨 **「0 が返った → 計器が壊れている」と読む前に、同じ計器の別の値を見る。**

## 5. 書き方

```
❌ @keyframes x { from { transform: scaleX(0) } to { transform: scaleX(1) } }
   → 要素に scale-x-* が付いていると **掛け算**になる
✅ @keyframes x { from { scale: 0 1 } to { scale: 1 1 } }
   → 🚨 **同じプロパティ**を動かす。上書きになる
✅ そもそも要素側に scale-x-* を付けない（片方だけが触る）
```

**transition も同じ:**
```
❌ transition-property: transform     ← v4 のユーティリティは transform を動かさない
✅ transition-property: translate, scale, opacity
   （🟢 実測: `.transition-[translate,scale,opacity]` というクラスが実在する）
```

## 6. 🚨 この決定が当たらない場面

- **手で `transform:` を書いている要素**（Tailwind のユーティリティを使っていない）
  — 1 つのプロパティしか無いので、掛け算は起きない
- **`rotate` / `translate` のうち片方しか使っていない場合**
  — 掛け算は「同じ軸を 2 つの経路から触ったとき」だけ起きる
- **v3 のコード**（このリポジトリには無いが、外から持ってくるときは読み替えが要る）

## 7. レビュー観点

- [ ] 🚨 `@keyframes` / `transition` に `transform` と書いていないか
      （書くなら、その要素に `scale-*` / `translate-*` / `rotate-*` が**付いていない**ことを確かめる）
- [ ] 要素の幅・位置が 0 のとき、**同じ計器の別の値**を見たか（`0` を「測れていない」と読んでいないか）
- [ ] 「animation は走っている・色も付いている」で済ませていないか
      （🚨 **走っていることと、見えていることは別**）
- [ ] `prefers-reduced-motion: reduce` での挙動を確かめたか
- [ ] v3 の記憶で `transform` を探していないか（**v4 では出てこない**）

## 8. 測り方（次に確かめる人へ）

```
① Chrome を headless で立てる（scripts/headless-browser.mjs の JSDoc に手順）
② page.eval で document.styleSheets を歩き、クラス名で引く
🚨 ③ **空の CSSRuleList は truthy**。`if (r.cssRules) { walk(); continue }` と書くと、
     ネストを持たない CSSStyleRule まで continue で飛ばして **0 件**になる
     （2026-08-16 に実際にやった。`&& r.cssRules.length` が要る）
🟢 ④ 対照を必ず 2 つ: `.flex` が引けること / 在るはずのないクラスが 0 件であること
     （🚨 ④が無いと、③の 0 を「そういうプロパティは無い」と読む）
```
