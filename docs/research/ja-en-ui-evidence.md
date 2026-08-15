# 日本語/英語がUIに与える影響 — OhMyCMS 管理画面デザイン規約 一次調査

調査日: 2026-08-13。テーマ: shadcn/ui + TailwindCSS で日本語UIを作る際の具体的数値ルールを立てるためのエビデンス収集。

**凡例**: 「E1」等はエビデンス章の番号。数値は必ず出典と対で記載。一次情報が取れず確認できなかった項目は「未確認」と明記する。

---

## 1. TL;DR — このCMSで採用する数値ルール（案）

| # | ルール | 根拠 |
|---|---|---|
| 1 | 本文(body)は `text-base`(16px) を既定にする。`text-sm`(14px)は補助情報・キャプションのみ | E2, E4(SmartHR M=16px, freeeプロダクト本文は14pxだが「地の文」相当はNormalFontSize=14pxでline-height 1.5と併用/本CMSは可読性優先で16px基準を採る) |
| 2 | 本文の `line-height` は **1.7〜1.75**（Tailwind `leading-[1.75]` 相当）。英語基準の1.5より高くする | E1(Typotheque: CJK leading推奨1.7 vs Latin既定1.2倍=120%) |
| 3 | フォーム入力(`<input>` `<textarea>`)は **モバイル時 16px 固定**（iOS Safari自動ズーム回避）。shadcn自体が `text-base md:text-sm` でこれを実装済み | E2(CSS-Tricks/コミュニティ実測), E3(shadcn input.tsx 実ソース) |
| 4 | ボタンの最小高さは **h-9(36px)止まりではなく、タップ操作が主体の画面は h-11(44px)以上を検討**。マウス操作前提の管理画面denseテーブル内アクションは36pxを許容 | E3(Apple HIG 44pt, Material 48dp, WCAG 2.5.8 24×24px下限) |
| 5 | クリック/タップ可能要素の**絶対最小**は 24×24 CSS px（WCAG 2.2 SC 2.5.8）。shadcnの `size-9`(36px) `icon` ボタンはこれを満たす | E3(WCAG 2.5.8一次文言) |
| 6 | 段落の**改行制御**に `word-break: auto-phrase`（Chrome 119+）と `text-wrap: pretty/balance` を本文・見出しに適用。全文が対応していないブラウザは自動フォールバック | E1(Chrome for Developers公式ブログ) |
| 7 | 見出しなど強調テキストは `line-break: strict` を明示指定し、行頭禁則(）」、！？等）を担保する | E1(MDN line-break) |
| 8 | 1行の文字数は**全角40字（半角80字）程度**を上限目安にし、`max-width` で本文カラム幅を制御する | E4(デジタル庁DADS アクセシビリティページ 一次情報) |
| 9 | 段落間スペースは行ボックス高さの1.5倍以上（フォントサイズ換算で概ね2.25倍以上） | E4(デジタル庁DADS、WCAG 1.4.12 Text Spacing) |
| 10 | フォントは Noto Sans JP（可変フォント）を採用し、`font-display: swap` + Google Fonts標準の unicode-range 分割サブセットに任せる。自前サブセットは不要（第一水準漢字のみ等の限定UIでない限り） | E5 |
| 11 | ラベル・キャプション等の最小フォントサイズは **12px を下限**とし、本文相当を14px未満にしない（14px日本語は英語の同サイズより読みにくいとされる) | E2(一般的知見。一次ガイドラインでの明確な「12px/14px比較」数値は**未確認**) |

---

## 2. ルール表（対象 × 英語既定(shadcn) × 日本語での指定 × 根拠）

| 対象 | shadcn既定(英語想定) | 日本語での指定案 | 根拠 |
|---|---|---|---|
| ボタン(Button) `default` | `h-9 px-4 py-2`（36px高） `text-sm`(14px、親要素で指定) | 高さは維持可（マウス操作の管理画面）。タッチ主体画面は `h-11`(44px)以上 | E3 shadcn実ソース／Apple HIG 44pt／Material 48dp |
| ボタン `sm` | `h-8`(32px) | 24×24px未満にしない。32pxはWCAG最低限は満たすがタップ主体UIでは非推奨 | E3 WCAG 2.5.8 |
| ボタン `icon` | `size-9`(36×36px) | 維持可（24×24pxの下限を満たす） | E3 WCAG 2.5.8 |
| 入力欄(Input) | `h-9`(36px) `text-base md:text-sm`（16px→デスクトップ14px） | モバイル/タブレット幅では**16px固定を崩さない**。デスクトップは14px許容 | E2 iOS Safariズーム／E3 shadcn実ソース |
| ラベル(Label) | `text-sm`(14px) `leading-none` | 14px維持可だが `leading-none` は日本語では詰まりすぎ。`leading-tight`(1.25)以上を検討 | E1 CJK leading推奨 |
| 本文(body text) | Tailwind既定 `text-base`(16px) `leading-normal`(1.5) | `text-base`(16px) + `leading-[1.7]`〜`leading-[1.75]` | E1 Typotheque／E4 SmartHR(1.5〜1.75) |
| 見出し(Heading) | サイズ可変、`leading-tight`(1.25)が多用される | 日本語は `leading-tight` だと窮屈になりやすく、`leading-snug`(1.375)以上を検討 | E1／E4 デジタル庁DADS Std系トークン(150〜175%) |
| キャプション/補助文言 | `text-xs`(12px) | 12px下限を死守。10px以下は使わない | E2(一般知見。一次数値ガイドラインは未確認) |

> 🚨 **例外が1件ある（2026-08-15）: SP フッターのナビのラベルは `text-[11px]`。**
> 堀池の指示（原文）:「**SPのNAVのタイトル…はもっと小さく。ボタンはSPでは3つ表示**」。
> **目的は「3つ入れること」**で、そのために文字を小さくする、と理由も添えられている。
>
> **この下限（12px）の根拠は E2＝一次ガイドライン未確認**と、この文書自身が書いている。
> 一方 **44px のタップ領域は E3（WCAG 2.5.8 / Apple HIG / Material）＝一次情報**なので、
> 🚨 **下げてよいのは前者だけ。SP フッターのタップ領域は 44px のまま**（`min-h-(--control-h)`）。
>
> **場所**: `components/admin/mobile-nav.tsx`（ラベルの `<span>`。同じ趣旨をコメントにも書いた）。
> 🚨 **この段落を消さないこと。** 消すと、次に照合した人が「規約違反だ」として 12px へ戻す
> （2026-08-15、通知を SP から外した件で**実際にその形が起きている**）。

---

## 3. エビデンス

### E1. 文字の物理特性・改行処理の差

**行の高さ(line-height)差**

- 型デザイン事務所 Typotheque の記事は、ラテン文字は `line-height` が既定でフォントサイズの120%程度に設定されることが多いのに対し、CJK（中日韓）テキストでは**約1.7倍(leading)のときに可読性と見た目のバランスが最も良い**と述べている。10ptフォントなら約17ptの行間が推奨されるという具体例つき。
  出典: [Typotheque – Typesetting principles of Chinese, Japanese, and Korean (CJK) text](https://www.typotheque.com/articles/typesetting-cjk-text)
- W3C の JLReq（日本語組版処理の要件）本文・簡便行組版ルールのページを直接確認したが、**「行送りは文字サイズの1.7倍」のような明確な倍率の記載は見当たらなかった**（未確認）。JLReqは主に禁則・アキ・分割規則が中心で、Web向けの line-height 数値勧告は行っていない。
  出典（確認先）: [日本語組版処理の要件（日本語版）](https://w3c.github.io/jlreq/old/ja/) / [簡便な行組版ルール（案）](https://w3c.github.io/jlreq/docs/line-composition/)

**禁則処理・改行の英語との根本的な違い**

- W3C国際化ワーキンググループの記事は、日本語（および中国語）は単語間にスペースを置かず、**文字単位で改行判断を行う**言語であることを説明。英語は直前の半角スペースを区切り文字として折返し位置を決めるが、日本語にはその仕組みがない。
  出典: [W3C – Approaches to line breaking](https://www.w3.org/International/articles/typography/linebreak)
- `line-break` プロパティは `auto` / `loose` / `normal` / `strict` / `anywhere` を持ち、`strict` は最も一般的な禁則規則（行頭に「）」「！」等を置かない等）を適用する。
  出典: [MDN – line-break](https://developer.mozilla.org/en-US/docs/Web/CSS/line-break)
- Chrome 119（2023年10月）で `word-break: auto-phrase` が実装された。GoogleのBudouX（機械学習による分かち書きツール、京都大学とNTTコミュニケーション科学基礎研究所の共同研究データで学習）を内部で用い、**単語ではなく文節境界で改行**する。現状 Chromeは日本語のみ対応（中国語・韓国語は将来対応予定）。
  出典: [Chrome for Developers – Introducing four new international features in CSS](https://developer.chrome.com/blog/css-i18n-features)
- 同ブログでは `text-autospace`（Chrome 120でフラグ付き実装、和欧文間に自動で微小スペースを挿入）にも言及。`text-wrap: balance` は日本語・韓国語の行揃えにも有効（見出し向け）。
  出典: 同上、および [ryelle.codes – Typography troubles: Balancing lines in Japanese & Korean](https://ryelle.codes/2025/04/typography-troubles-balancing-in-japanese-korean/)

### E2. フォントサイズの下限

**iOS Safariのフォーム自動ズーム**

- font-sizeが **16px以上ならズームせずフォーカス**し、15px以下だとビューポートがそのinputへズームインする、という挙動が広く報告されている。閾値は「宣言したCSS値」ではなく「変形・スケール後の実測レンダリングサイズ」で判定される。
  出典: [CSS-Tricks – 16px or Larger Text Prevents iOS Form Zoom](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/)
- **重要な留保**: これはApple公式ドキュメント・WebKit公式仕様書に明記された挙動ではなく、開発者コミュニティの実測・報告（CSS-Tricks記事はJosh W. Comeauの2021年のツイートを一次情報として紹介）に基づく。**Apple/WebKitの公式一次資料は未確認**。実務上は広く再現される既知の挙動として扱う。

**日本語の可読性下限**

- WCAG 2.2 / JIS X 8341-3:2016 上の「サイズの大きなテキスト（Large Scale）」は**18ポイント、または14ポイントの太字**と定義され、中国語・日本語・韓国語のフォントについても同等サイズが求められる、という解説がある。
  出典: [水底の血 – JIS X 8341-3:2016のいう「サイズの大きなテキスト」について](https://momdo.hatenablog.jp/entry/20230219/1676774078)
- 「日本語14px/12pxが英語の同サイズより読みにくい」という定量的根拠を示す一次ガイドライン文書は、今回の調査では**発見できなかった（未確認）**。一般的なWebデザイン記事群は「日本語・英数字とも12px〜18pxが目安」「16px〜18pxを推奨」とする傾向はあるが、これらは実務ブログであり一次情報ではない。
  出典（参考・二次情報）: [WEBデザインにおいて推奨されるフォントサイズと最小フォントサイズ](https://onepoint.softcampus.co.jp/webdesign_onepoint/45762/)

**デジタル庁デザインシステムの可読性ガイドライン（一次情報）**

- 行ボックスの高さを**フォントサイズの1.5倍以上**、段落間を行ボックス高さの**1.5倍以上（フォントサイズの2.25倍以上）**にすることを要求。
- テキストブロックの幅は**半角80文字（全角40文字）程度**を目安とする（コンテンツ性質により柔軟運用）。
  出典: [デジタル庁デザインシステムβ版 – タイポグラフィ（アクセシビリティ）](https://design.digital.go.jp/dads/foundations/typography/accessibility/)
  ※この基準はWCAG 2.1 SC 1.4.12 Text Spacingの内容と整合する（下記E3参照）。

### E3. UIコンポーネントの寸法

**タップターゲットの最小寸法（一次情報）**

- **WCAG 2.2 SC 2.5.8 Target Size (Minimum)** 規範文言:
  > "The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when: Spacing / Equivalent / Inline / User Agent Control / Essential"
  出典: [wcag22aa.org – Target Size (Minimum)](https://wcag22aa.org/new-criteria/target-size/)（原文はW3C WCAG 2.2勧告に基づく引用）
- **WCAG SC 1.4.12 Text Spacing** 規範文言（line-height要件の一次テキスト）:
  > "Line height (line spacing) to at least 1.5 times the font size" / 段落後スペーシングはフォントサイズの2倍 / 文字間隔0.12倍 / 単語間隔0.16倍
  出典: [W3C WAI – Understanding SC 1.4.12: Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- **Apple Human Interface Guidelines**: 最小タップ可能領域 **44×44pt**。公式ページ自体は取得できたが本文の詳細抽出はできず、数値は複数の実務記事で一貫して「Apple公式ガイドラインとして44×44pt」と紹介されている。
  出典: [Apple Developer – Layout (Human Interface Guidelines)](https://developer.apple.com/design/human-interface-guidelines/layout)（本文の直接引用は未確認。数値は業界で広く一致した二次情報として扱う）
- **Material Design 3**: タッチターゲット最小 **48×48dp**（物理サイズ約9mm相当）。WCAG SC 2.5.5（AAA）およびSC 2.5.8（AA）達成を支援する位置づけ。
  出典: [Android Developers – Touch target size (Accessibility Help)](https://support.google.com/accessibility/android/answer/7101858?hl=en)

**shadcn/ui の実測寸法（GitHub一次ソース、2026-03-02時点のコミット、`apps/v4/registry/new-york-v4/ui/` 配下、リポジトリ `apps/v4/package.json` version `0.1.0`）**

`button.tsx`（`buttonVariants` cva定義。全ボタンは `text-sm` 継承。GitHub: [shadcn-ui/ui – button.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx)）:

```
size: {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 ...",
  sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
  lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
  icon: "size-9",
  "icon-xs": "size-6 rounded-md ...",
  "icon-sm": "size-8",
  "icon-lg": "size-10",
}
```
→ `default`=36px高, `sm`=32px, `lg`=40px, `icon`=36×36px。フォントサイズは `text-sm`(14px)がコンポーネント共通クラスに設定されている。

`input.tsx`（GitHub: [shadcn-ui/ui – input.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/input.tsx)）:

```
className="h-9 w-full ... px-3 py-1 text-base ... md:text-sm ..."
```
→ **高さ36px固定。フォントサイズは既定`text-base`(16px)で、`md:`ブレークポイント以上でのみ`text-sm`(14px)に縮小**。これは shadcn自身がE2のiOSズーム問題を回避するために**モバイルで16px、デスクトップで14px**という実装を既にしている、という直接証拠。

`textarea.tsx` も同様に `text-base ... md:text-sm` パターン。
`label.tsx`（GitHub: [shadcn-ui/ui – label.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/label.tsx)）は `text-sm leading-none font-medium` — 日本語では `leading-none`(行高1.0)は詰まりすぎになりやすい。

### E4. 日本語UIの実例における実測

**デジタル庁デザインシステムβ版（DADS）— 一次情報、公開トークン**
出典: [design.digital.go.jp/dads/foundations/typography/](https://design.digital.go.jp/dads/foundations/typography/)

- **Display系**(Dsp): 64/57/48px、行高**140%**固定、字間0
- **Standard系**(Std): 見出し・本文用。45/36/32/28/26/24/22/20/18/17/16px、**行高は150〜170%（サイズが小さくなるほど行高%が上がる設計）**、字間0〜2%
- **Dense系**(Dns): 管理画面・業務システム向け。17/16/14px、行高**120〜130%**（业務密度優先で他より低め）、字間0
- **Oneline系**(Oln): UI要素（ボタン等）向け。17/16/14px、**行高100%固定**、字間2%
- **Mono**: コード表示用。17/16/14px、行高150%固定
- フォントは **Noto Sans JP + Noto Sans Mono**（SIL OFL 1.1）を採用。

→ 管理画面（Dense）は行高120〜130%と本文より詰めるが、それでも英語UI慣習の100%（leading-none）や125%(leading-tight)よりは高め。

**SmartHR UI — 一次情報、GitHubソースコード実測**
出典: [kufu/smarthr-ui – createFontSize.ts](https://github.com/kufu/smarthr-ui/blob/main/packages/smarthr-ui/src/themes/createFontSize.ts), [smarthr-ui-preset.ts](https://github.com/kufu/smarthr-ui/blob/main/packages/smarthr-ui/src/smarthr-ui-preset.ts)

- ベースフォントサイズ16px、scaleFactor=6の等比スケール: `XXS≈10.7px / XS=12px / S≈13.7px / M=16px(既定) / L=19.2px / XL=24px / XXL=32px`
- Tailwindプリセットの `lineHeight`: `none:1 / tight:1.25 / normal:1.5(既定・本文pに適用) / loose:1.75`
- 本文(`p, dl`)には `lineHeight.normal`(1.5)を適用するCSSが確認できた。

**freee Vibes — 一次情報、GitHubソースコード実測**
出典: [freee/vibes – Font.ts](https://github.com/freee/vibes/blob/master/src/constants/Font.ts)

- `NormalFontSize = 0.875rem(14px)`（プロダクトUIの地の文）
- `Headline2FontSize = 1rem(16px)` / `Headline1FontSize = 1.5rem(24px)`
- `LineHeight = '1.5'`（全フォントスタイル共通で1.5固定）
- モバイル版見出しは `MobileHeadline1FontSize=16px` など縮小されたスケールを別定義

**Ameba Spindle（CyberAgent）**
- 公式サイト `spindle.ameba.design` の「UIタイポグラフィ」ページを直接確認したが、**具体的なpx/line-height数値は非公開（書体指定のみ）**。CyberAgent Developers Blogの紹介記事でも「UI領域は当時作成中」と言及されており、**公開されている数値トークンは確認できなかった（未確認）**。
  出典: [Spindle – UIタイポグラフィ](https://spindle.ameba.design/styles/typography/ui/), [CyberAgent Developers Blog – Amebaのデザインシステム「Spindle」の全貌公開](https://developers.cyberagent.co.jp/blog/archives/31641/)

**まとめ表（一次情報ベース）**

| プロダクト | 本文サイズ | 本文line-height | 出典 |
|---|---|---|---|
| デジタル庁DADS（Dense=管理画面） | 14/16/17px | 120〜130% | design.digital.go.jp（公式） |
| デジタル庁DADS（Standard=一般本文） | 16px〜 | 150〜175% | 同上 |
| SmartHR UI | 16px(M) | 150%（normal） | GitHub kufu/smarthr-ui（一次ソース） |
| freee Vibes（プロダクト） | 14px | 150% | GitHub freee/vibes（一次ソース） |
| freee Vibes（Webサイト系見出し） | 16px | 150% | 同上 |
| Ameba Spindle | 未公開 | 未公開 | 未確認 |

### E5. フォント（Noto Sans JP）

- Noto Sans JPは**可変フォント(Variable Font)**として `wght` 軸100〜900の全ウェイトを1ファイルに内包しており、静的ウェイトを複数ロードするより軽量になり得る。
  出典: [Google Fonts – Noto Sans Japanese](https://fonts.google.com/noto/specimen/Noto+Sans+JP)
- サブセット化前のNoto Sans CJK JPはフルセットで**約16MB**にも達するが、第一水準漢字等へのサブセット化＋WOFF2圧縮で**約700KB前後まで削減**できるという実務報告が複数ある（オリジナルOTF比で概ね1/10程度）。
  出典: [ういやまラボ – Noto Sans JPフォントを50%軽量化！FontToolsサブセット化](https://uhiyama-lab.com/blog/webdev/optimize-subset-fonttools/), [minory – 「Noto Sans CJK JP」フォントをサブセット化して配布中](https://minory.org/google-web-fonts.html)
- Google FontsはNoto Sans JP配信時に**unicode-rangeによる自動サブセット分割**を行っており、日本語版は多数の文字範囲（100分割超）に分けてCSSの`@font-face`が生成される。これによりブラウザは実際に表示に使う文字範囲のチャンクのみをダウンロードする。
  出典: [Qiita – Google Fontsのunicode-rangeを使ったサブセット方法](https://qiita.com/ksk1015/items/38128a108ba8476cc7d6)
- `font-display: swap` はGoogle Fonts配信の`@font-face`で標準的に使われ、フォント読み込み中はフォールバックフォントで即座にテキスト表示し、ロード完了後に差し替える（FOIT回避）という一般的な実務パターンとして広く採用されている。
  ※Noto Sans JP固有の公式ドキュメントにおける`font-display`既定値の明記は今回**未確認**（Google Fonts CSS APIの一般仕様としての運用実態）。

---

## 4. 参考ファイル/URL一覧

### 文字特性・改行
- https://www.typotheque.com/articles/typesetting-cjk-text
- https://w3c.github.io/jlreq/old/ja/
- https://w3c.github.io/jlreq/docs/line-composition/
- https://www.w3.org/International/articles/typography/linebreak
- https://developer.mozilla.org/en-US/docs/Web/CSS/line-break
- https://developer.chrome.com/blog/css-i18n-features
- https://ryelle.codes/2025/04/typography-troubles-balancing-in-japanese-korean/

### フォントサイズ下限
- https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/
- https://momdo.hatenablog.jp/entry/20230219/1676774078
- https://design.digital.go.jp/dads/foundations/typography/accessibility/

### コンポーネント寸法
- https://wcag22aa.org/new-criteria/target-size/
- https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
- https://developer.apple.com/design/human-interface-guidelines/layout
- https://support.google.com/accessibility/android/answer/7101858?hl=en
- https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx
- https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/input.tsx
- https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/textarea.tsx
- https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/label.tsx

### 日本語UI実例
- https://design.digital.go.jp/dads/foundations/typography/
- https://github.com/kufu/smarthr-ui/blob/main/packages/smarthr-ui/src/themes/createFontSize.ts
- https://github.com/kufu/smarthr-ui/blob/main/packages/smarthr-ui/src/smarthr-ui-preset.ts
- https://github.com/freee/vibes/blob/master/src/constants/Font.ts
- https://spindle.ameba.design/styles/typography/ui/
- https://developers.cyberagent.co.jp/blog/archives/31641/

### フォント
- https://fonts.google.com/noto/specimen/Noto+Sans+JP
- https://uhiyama-lab.com/blog/webdev/optimize-subset-fonttools/
- https://minory.org/google-web-fonts.html
- https://qiita.com/ksk1015/items/38128a108ba8476cc7d6

---

## 未確認事項一覧（今後追調査が必要）

1. WebKit/Appleの16px自動ズーム挙動の**公式一次資料**（現状はコミュニティ実測のみ）
2. JLReqが「行送り1.7倍」を明文で推奨しているかどうか（本調査では非発見）
3. 日本語14px/12pxが英語同サイズより読みにくいことを定量的に示す一次アクセシビリティガイドライン
4. Ameba Spindleの公開されたUIタイポグラフィ数値トークン
5. Noto Sans JP自体の公式ドキュメントにおける`font-display`既定値の明記
