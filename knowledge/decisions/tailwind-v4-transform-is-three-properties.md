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
① transform ではなく translate    2026-08-15・base2 の実測
   【測った】/admin/labels の「もどる」ボタン
     getComputedStyle(el).transform … 🚨 **押しても永久に `none`**
     getComputedStyle(el).translate … 押下時 **"0px 1px"**
   🚨 **記録は `components/ui/button.tsx` のコメント**（二重に書かない。あちらが正）
② hover: は @media (hover: hover) の中   2026-08-16・toast
   → `Emulation.setDeviceMetricsOverride({mobile:true})` だけでは
     `(hover: hover)` は **true のまま**。`setEmulatedMedia` が要る
🚨 ③ scale-x-* は scale プロパティ        同日・toast / schema / design
   トーストのプログレスバーが **幅 0px**。keyframes が `transform: scaleX()` だった
```

🚨 **①には、測り方の落とし穴が 1 つ付いてくる**（base2 の実測）:
```
`transition-all` が効いているので、**遷移が終わるまで待たないと違う値が出る**
  120ms で読む … PC でも「触れた時＝透明」＝ 🚨 **hover が効いていないように見える**（誤り）
  700ms 待つ   … PC は「触れた時＝lab(96.52)」＝ **hover は効いている**
```

🚨 **一部のボタンが沈まないのは、壊れているのではなく仕様**（base2 の実測）:
```
base のクラスは `active:**not-aria-[haspopup]**:translate-y-px`
＝ 🚨 **メニューを開くボタン（`aria-haspopup` を持つ）は、意図的に沈まない**
   → ▾ の引き金も沈まない。**「▾ だけ手応えが無い」ように見える可能性がある**
   （🚨 押した感じは誰も測っていない。**気になったら測ること**）
```

## 4. 🚨 この症状は「測れなかった 0」に見える

> 🚨 **2026-08-16: 見出しを「いちばん危ない症状」から直した。**
> **「いちばん」は他の症状との比較だが、私は比べていない**（他の症状の頻度も影響も測っていない）。
> **測っていない比較を見出しに置くと、読む人はそれを測定結果として受け取る。**

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

### 🚨 2026-08-16 訂正 — **`transition-transform` は効く。当初ここに誤りを書いた**

**当初の記述（誤り。消さずに残す）:**
```
❌ 「transition-property: transform も効きません → translate, scale, opacity へ」
```
**[w4A:p25 / toast] が反証を出し、私が測り直して確認した:**
```
【測った】2026-08-16・配信 CSS（🟢 対照 拾えた総数 1169 / 在るはずのない名前 0 件）
  .transition-transform {
    transition-property: **transform, translate, scale, rotate**;   ← 🚨 4 つ全部
  }
```
🚨 **この版の Tailwind は `transition-transform` を 4 プロパティへ展開している。そのまま効く。**

**私の誤りの構造:**
```
実測したのは  **`@keyframes` に transform を書くと掛け算になる**（本当）
書いたのは    **`transition-property: transform` も効かない**（🚨 **測っていない隣の話**）
＝ 1 つの実測から、**隣接する別の機能まで一般化した**
```
🚨 **そのまま配っていたら、いま動いているコードを書き換えさせるところだった。**
```
【測った】transition-transform を使う箇所 … 3 件
  left-sidebar.tsx:151      🚨 **同じ要素に `…:rotate-180` が在る＝実際に動く**
  ui/sidebar.tsx:396 / 544  同じリテラルに transform 系が無い（＝動かす対象がそもそも無い）
```

**ついでに測った（toast が「そこまで確かめていない」と書いた 2 行）:**
```
【測った】素の `.rotate-180` … 配信 CSS に **0 件** / **ソースにも 0 件**
          （🟢 対照 396 ファイル走査・variant 付きは 3 件）
＝ **「使っている箇所が無いから生成されていない」で説明が付く**
【未実施】🚨 **画面で矢印が滑らかに回るところは、まだ誰も見ていない**
```

**＝ 正しい書き方:**
```
✅ `transition-transform` はそのまま使ってよい（4 つに展開される）
🚨 **`@keyframes` の話（掛け算）と `transition-property` の話（展開）は別。**
   **前者だけが問題。** 後者まで一般化すると、直す必要のないものを触る
```

## 5.5 【測った】直したあと（2026-08-16・design が領域の持ち主として確認）

**toast が `0748913` で keyframes を `scale: 0 1 → 1 1` に変えた。報告を写さず自分で測った:**

```
実物と同じクラスの div（384px 幅）を作って測定
  通常        直後 0px → 1.2 秒後 **152.01px**（animation=ohmycms-toast-progress）
  🟢 対照 reduce  直後 0px → 1.2 秒後 **0px**（animation=**none** / scale=0 1）
  🟢 matchMedia が false / true で切り替わっている（＝ 対照が効いている）
```
✅ **幅 > 0** かつ **箱の 384px より小さい**（途中まで伸びている）＝ 受入どおり。

🚨 **1 回目の測定は失敗している（記録として残す）。**
```
私は animation を **inline style で直書き**したプローブで測った
→ reduce でも **151px** 出て、toast の報告と食い違った
🚨 実物は `motion-safe:animate-[…]`（＝ `@media (prefers-reduced-motion: no-preference)`）
   **inline style では、その条件を通らない**
＝ **私が実物と違うものを測っていた。** toast の報告が正しかった
```
🚨 **「食い違った」ときに、まず疑うのは自分のプローブが実物と同じ形か。**
**クラスで効いているものを、style で真似ると条件が消える。**

### 🚨 消えるのは「値」ではなく「条件」。だから壊れて見えない

**同じ形を 3 人が別々に踏んでいた**（2026-08-16・design / base2 / toast）:
```
design  `motion-safe:` を inline style で真似た      → **メディアの条件**が消えた
base2   `md:max-w-md` を `style.maxWidth` で真似た    → **メディアの条件**が消えた
base2   遷移の途中（120ms）を確定値として読んだ       → **時間の条件**が消えた
toast   **自分が塞いだ形**（コメント）を囮に使った     → 囮が実物と違う条件を通った
```
🚨 **どれも値は出る。** 出るから、間違っていることに気づけない。

```
🚨 **条件付きのもの（`md:` / `motion-safe:` / `hover:` / `dark:`）を style で真似ない。**
   **どうしても真似るなら、その条件が効く側と効かない側の両方で測る**
   （片方でしか測らないと、条件が消えたことに気づけない）
```
**base2 の実例**: `md:` のプローブを **1440 でしか走らせていなかった**ので刺さらなかった。
🚨 **SP でも同じやり方で測っていたら「SP でも 448px に縮む」と誤報していた**（実際は当たらない）。

### 🚨 数を比べる前に「起点」を合わせる

**同じバーを 2 人が測って 152.01px と 227.17px になった**（どちらも正しい）:
```
toast の計器 … ページを開いて sleep(700) してから 1 枚目 ＝ **既に 0.57 秒進んでいる**
              「1.2 秒後」= 実際は animation の **1.77 秒後** → 227.17px
design の計器 … div を作った瞬間から ＝ 0 秒起点
              「1.2 秒後」= animation の **1.19 秒後** → 152.01px
```
🚨 **どちらの「1.2 秒後」も、animation の 1.2 秒後ではない／である、が食い違っていた。**
**受入（0 < 幅 < 384）は両方満たすので、判定は変わらない。**
**書いておかないと、次に誰かが「152 と 227 が合わない」を調べる。**

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
