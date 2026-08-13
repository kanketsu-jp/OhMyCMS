---
type: area
title: デザインの規約（design-system）
description: 管理画面は「ページ構成・機能はDirectus、見た目・操作感はX」を参考にする方針。規約ファイルの一覧とどれをいつ読むかを束ねる。数値の多くはF6でMobbin MCPを使って確定させる予定で、現時点は目視の推定を含む。
tags: [design, ux, i18n, x-ui-rules]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://docs/design/surface-rules.md"
  - resource: "repo://docs/design/x-ui-rules.md"
  - resource: "repo://docs/research/ja-en-ui-evidence.md"
  - resource: "repo://knowledge/decisions/ui-placement-by-frequency.md"
  - resource: "repo://.temp/2026-08-13/specs/F6-design-system-x.md"
stale_after: 2027-02-13
x_rag_okf:
  id: areas/design-system
  source_commit: 1603f6a
  authorship: agent
---

# デザインの規約（design-system）

## 責務

`docs/design/` と `docs/research/` に散らばっているデザイン規約を束ね、**どれをいつ読むか**の動線を作る。
このファイル自体は規約の中身を複製しない（中身は各ファイルへ [[リンク]] で参照する）。

## 方針

> 調査日: 2026-08-13。方針: OhMyCMS は「できること・ページ構成」は Directus を参考に、
> 「見た目・操作感」は X を参考にする（`docs/design/x-ui-rules.md` 冒頭）。

「そのページ・機能が存在するか」＝Directus、「それをどう見せるか」＝X、という切り分けを常に意識する。
新しい画面を作るときは、①Directusのどの機能に相当するか ②見せ方はXのどのパターンを踏襲するか、を
分けて考える（`x-ui-rules.md` ルール#20）。

## 規約ファイルの一覧と、どれをいつ読むか

| ファイル | 読むタイミング | 内容 |
|---|---|---|
| **`docs/design/surface-rules.md`** | 🚨 **画面を1つでも作る前に必ず読む。最優先** | 面（罫線・背景・影のどれかを持つもの）の入れ子を構造的に禁止する。**実際に事故った**規約 |
| `docs/design/x-ui-rules.md` | レイアウト・コンポーネントの見た目を決めるとき | X由来の20ルール。**静止画の目視のみで px は未実測**と自ら断っている |
| `docs/research/ja-en-ui-evidence.md` | 日本語の文字サイズ・行間・折り返しを決めるとき | 日本語での寸法エビデンス。**X は英語UIなので、ぶつかったらこちらが優先** |
| [[ui-placement-by-frequency]]（decision） | 「これはヘッダに置くべきか」で迷ったとき | 操作の頻度で置き場所を決める。常設領域は毎日使うものだけ |

## 面（Surface）のルール — 最優先

由来: 堀池が実装（`/admin/folders`）を見て指摘した実例。「ボーダーの中にボーダーがあり、そのなかにも
ボーダーがある。背景色も全て同じ。しかもすべて padding を持つ」状態が実際に発生した
（`docs/design/surface-rules.md` §1）。

要点:

- 面は1画面に**レベル0（ページ本体）とレベル1（セクション）まで**。レベル2以上は作らない
- 面の中の入力欄・ボタンは「面」ではないが、**境界（罫線）は面と入力欄のどちらか一方だけが持つ**
  （両方が罫線を持つと二重になる）
- padding は外側の器だけが持つ。中身は自分で padding を持たない
- **SP ではカードを使わない。** 上下の Divider だけで区切る（PC はレベル1までのカードを許容）
- 「空です」の表示のために面を1つ増やさない
- 🚨 「レビューで気をつける」では必ず破れる、と明記されている。**コンポーネント単位では正しくても、
  組み合わせで破れる**性質の問題なので、`<Surface>` のような入れ子検出コンポーネントで構造的に守る方針
  （Storybook に「面の中に面」のケースを置くことも含む）

## X 由来の20ルール（`x-ui-rules.md`）の位置づけ

**🚨 静止画の目視で px は未実測、と自ら断っている。** 調査手段はローカルスクリーンショット約59枚と
Mobbin MCP の `search_screens`（`search_flows`/`search_sections` は今回未使用）で、ブラウザ DevTools
による実測は一切行っていない。数値の多くは「目測」であり、確認できないものは「未確認」と明記されている。

現時点で確度が高い（=画像で直接確認できた）ものの例:
- 背景色はライト=純白／ダーク=純黒の二値（ローカルスクショで直接確認、他の多くの項目より確度が高い）
- Primaryボタンは完全な角丸（pill）、破壊的操作は塗りボタン化しない
- 一覧はカードで囲まずフラットリスト（行間余白 or 極細ボーダーのみ）

一方、**「未確認」と明記されている代表例**（数値そのものを鵜呑みにしない）:
- 3カラムの絶対px幅、左ナビ/右パネルが縮む閾値
- アイコンボタンの当たり判定の実測px（`ja-en-ui-evidence.md` E3 の WCAG/HIG/Material 基準からの類推）
- 余白が4pxか8pxの倍数か
- モーダル角丸の正確なpx値

## 日本語の寸法（`ja-en-ui-evidence.md`）— ぶつかったらこちらが優先

X は英語UIのスクリーンショットから起こした規約なので、日本語の行間・折り返し・1行文字数には
**そのまま使えない**。ぶつかったときは `ja-en-ui-evidence.md` 側を優先する（`x-ui-rules.md` ルール#16〜18
に「【日本語差分】」として明記済み）。

主な採用ルール（TL;DR より抜粋。出典は一次情報付き）:

| 項目 | 値 | 出典 |
|---|---|---|
| 本文の line-height | 1.7〜1.75（英語基準の1.5より高い） | Typotheque（CJKは約1.7倍が可読性良好） |
| フォーム入力（モバイル） | 16px固定 | iOS Safari自動ズーム回避（CSS-Tricks実測報告。Apple公式一次資料は未確認） |
| 1行の文字数上限 | 全角40字目安 | デジタル庁DADS（一次情報） |
| タップ操作主体の画面のボタン高さ | h-11(44px)以上を検討 | Apple HIG 44pt / Material 48dp / WCAG 2.5.8 |
| クリック可能要素の絶対最小 | 24×24 CSS px | WCAG 2.2 SC 2.5.8（一次文言） |

## `ui-placement-by-frequency`（decision）との関係

「常設領域（ヘッダ・サイドバー・ツールバー）に何を置くか」は X の見た目ルールだけでは決まらない。
[[ui-placement-by-frequency]] は堀池の判断（言語切替をヘッダから外し、オンボーディング＋個人設定へ
寄せた実例）を一般化したもので、**頻度で置き場所を決める**という判断軸を示す:

| 頻度 | 置き場所 |
|---|---|
| 毎日・何度も使う | 常設（ヘッダ/サイドバー/ツールバー） |
| ときどき使う | 1階層下（メニューの中・ページ内） |
| 一度決めたらほぼ変えない | オンボーディングで一度選ばせ、以降は個人設定 |

「これはヘッダに置くべきか」で迷ったら、まず「毎日押しますか」を自問する。テーマ・タイムゾーン・
表示密度・通知設定など、同じ理屈が効きそうなものは都度判断する。

## 未確定なこと

**F6（デザイン規約の適用フェーズ）で Mobbin MCP を使って数値を確定させる予定。**
`.temp/2026-08-13/specs/F6-design-system-x.md` に指示がある:

> Mobbin の MCP をちゃんとフルに使って。

- `mcp__mobbin__search_screens` / `search_flows` / `search_sections` を**フルに使う**方針
  （現行の `x-ui-rules.md` は `search_screens` のみで作られている）
- 対象は X Web に加え **X iOS の UI 要素**（部品単位で見られるので本命、とスペックに明記）
- 確定後は `docs/design/x-ui-rules.md` を「目視の推定」から「Mobbin で確認した値」へ更新する運用
  （F6の受入基準1に「どれを確認し、どれが未確認かが分かる」ことが明記されている）
- 余白が4px/8pxどちらの倍数かも、F6で Mobbin を見て確定させる対象

F6 は F2（機能の穴埋め）の後続で、F1（i18n）→F2→**F6**→F7（Storybook）→F8（Tiptap）という直列の
依存関係にある（`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §3）。**F6完了前の時点では、
`x-ui-rules.md` の数値ルールは「未確認」を含む暫定値として扱うこと。**

## 他の領域との関係

- **[[apps-studio]]**: 規約の適用先は `apps/studio` の管理画面（`app/(admin)/**` `components/ui` `components/admin`）
- **i18n**: `ja-en-ui-evidence.md` の日本語寸法は、i18n 契約（`knowledge/decisions/i18n-required.md` 等）で
  UI文言を辞書化する作業と対になる

## 根拠

- `docs/design/surface-rules.md`（全文）
- `docs/design/x-ui-rules.md`（§1 TL;DR・§4 Directus/X切り分け表を中心に確認）
- `docs/research/ja-en-ui-evidence.md`（§1 TL;DR・§2 ルール表を中心に確認）
- `knowledge/decisions/ui-placement-by-frequency.md`
- `.temp/2026-08-13/specs/F6-design-system-x.md`（Mobbin MCP 使用方針・F6の受入基準）
- `.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §3（フェーズ依存グラフ）
