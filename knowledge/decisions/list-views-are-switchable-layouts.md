---
type: decision
title: 一覧は「画面」ではなく「切り替えられる表示形式」にする
description: いまは files-table / folder-grid / files-lightbox-grid が別々の画面部品で、列の選択も並べ方の設定も持てない。Directus は同じデータに対して tabular / cards / calendar / kanban / map を切り替える形にしており、表示形式ごとに設定（表なら出す項目と幅、カードなら大きさと画像の収め方）を持つ。この形に寄せる。実装は shadcn、無いものは自作。Directus のコードは 1 行も写さない（MSCL-1.0-GPL）。
tags: [design, ux, apps-studio]
status: active
generated:
  by: agent
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://knowledge/areas/design-system.md"
  - resource: "repo://knowledge/decisions/no-directus-fork.md"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/list-views-are-switchable-layouts
  authorship: agent
---

# 一覧は「画面」ではなく「切り替えられる表示形式」にする

> 由来: 2026-08-17 堀池指示。原文:「**列が選択できないし、フォルダもファイルも正方形で表示します。
> 全体的にもっとdirectusを参考にして**」「**directusを見習い、UIUXやページの構成。下層ページも真似する**」
> 「**UIはshadcnに変換。shadcnにないものは自作**」

## 0. 決めたこと

**一覧は「表の画面」「グリッドの画面」と分けない。同じデータに対して表示形式を切り替える。**

## 1. なぜ（いまの形の何が問題か）

【測った・2026-08-17】いま `apps/studio/components/admin/` に在る一覧の部品:

```
files-table.tsx        … 表
folder-grid.tsx        … フォルダの並び
files-lightbox-grid.tsx … ファイルの並び
```

🚨 **3 つが別々の部品なので、次のことが構造的にできない**:

- **列を選べない**【測った】ファイルの表に列の調整は **0 件**
  （`panel-display.tsx` / `lib/admin/list-view.ts` は**アイテム一覧のパネルだけ**で、
  ファイルの表は使っていない。🟢 対照 `useState` は 49 ファイルに在る＝ この探し方は動く）
- **フォルダとファイルで並べ方が揃わない**（別部品なので、揃える理由がコードに無い）
- **表示形式を足すと、画面が 1 つ増える**（カレンダー・カンバンを足したいとき、また別部品になる）

## 2. Directus がどうしているか

【引いた・2026-08-17・`app/src/layouts/`】

```
tabular / cards / calendar / kanban / map
```

**同じデータに対して、表示形式を切り替える**形。そして**表示形式ごとに設定を持つ**:

| 形式 | 持っている設定（`options.vue` に出てくる語の数） |
|---|---|
| `tabular` | `fields` 14 / `align` 13 / `spacing` 1 |
| `cards` | `size` 11 / `title` 10 / `icon` 10 / `subtitle` 9 / `imageFit` 6 / `sort` 4 |

🚨 **`fields`（表に出す項目）と `size` / `imageFit`（カードの大きさと画像の収め方）が、
形式ごとに分かれている**——これが「列を選べる」「正方形で並べられる」の実体。

## 3. ページの構成（下層の分け方）

【引いた・`app/src/modules/`】

```
activity / content / deployment / files / insights / settings / users / visual
```

各モジュールの下は、**同じ 3 つの形**に揃っている:

```
collection.vue … 一覧
item.vue ……… 1 件
add-new.vue …… 新規
（＋ not-found.vue）
```

🚨 **一覧・1 件・新規の 3 つだけ**。**画面の種類を増やしていない。**
`settings` の下も同じ形で、**ai / appearance / data-model / extensions / flows / policies /
presets / project / roles / translations …** と**領域で割ってから、その中で 3 つ**。

## 4. この PJ でどうするか

1. **一覧の部品を 1 つにし、表示形式を差し替える**
   - まず **表（tabular 相当）** と **カード（cards 相当）** の 2 つ
   - 🚨 **カレンダー・カンバンは作らない**（要ると言われてから）
2. **表示形式ごとに設定を持つ**
   - 表 … **出す項目**（列の選択）
   - カード … **1 行の数**（🚨 **既定 3・1〜5 から選べる**。設問 316 の備考で決定済み）／**正方形**
3. **フォルダとファイルを同じ形式で並べる**（別部品にしない）
4. **下層は「一覧 / 1 件 / 新規」の 3 つに揃える**（画面の種類を増やさない）

## 5. 実装の制約

- 🚨 **Directus のコードを 1 行も写さない。**
  ライセンスは **`MSCL-1.0-GPL`**（Monospace Sustainable Core License 1.0）で、
  【引いた・base2 と司令塔が別々に確認】**条項がコピー・改変・派生物のすべてに及ぶ**。
  写すと **OhMyCMS 側がその条項に縛られる**と読める。**これは事業判断なので、
  写したくなったら止めて堀池に聞く。**
  （🚨 司令塔は「BSL 系」と記憶で言ったが**誤り**。base2 が実物を引いて確定した）
- **UI は shadcn。無いものは自作。**
- 🚨 **見た目を Directus に似せるのではない。** 情報の分け方と操作の流れを見習い、
  **この PJ のルールでシンプルに作る**。

## 6. やらないこと

- ❌ 表示形式を増やすたびに画面を 1 つ足す
- ❌ フォルダとファイルで別の並べ方をする
- ❌ Directus のコードを写す（§5）
- ❌ 「Directus と同じ見た目」を目標にする

## 7. レビュー観点

- [ ] 一覧の部品が 1 つで、表示形式が差し替えになっているか
- [ ] 表に「出す項目」の選択が在るか
- [ ] カードが正方形で、1 行の数を 1〜5 から選べるか（既定 3）
- [ ] フォルダとファイルが同じ形式で並ぶか
- [ ] 下層が「一覧 / 1 件 / 新規」の 3 つに収まっているか
- [ ] Directus のコードを写していないか

## 8. 【2026-08-17 追記】どこまで揃えたか、と `labels` を揃えない理由

【測った・実装後】

```
                     一覧  1件
collections           ○    ○
content               ○    ○
files                 ○    ○
settings/policies     ○    ○
settings/roles        ○    ○   ← 2026-08-17 に追加
settings/users        ○    ○   ← 2026-08-17 に追加（API も新設）
settings/agents       ○    ○   ← 2026-08-17 に追加（API に GET を追加）
labels                ○    ×   🚨 **意図して作っていない**（下記）
reports               ○    ○   ＋ `manage`（下記）
```

### 🚨 `labels` に 1 件のページを作らない

**持っているのが `name` と `color` だけ**だから。
一覧の行の中で編集でき、**開いても行より多くのことが分からない**。

🚨 **3 層に揃えること自体は目的ではない。**
Directus が `collection / item / add-new` を持つのは、**item に行より多くの情報が在る**から。
無いものに器だけ作ると、**「開いたのに何も無い」画面が増える**。

✅ 足す条件: **ラベルに「どこで使われているか」を出せるようになったら**、そのとき作る。

### 🚨 `reports/manage` は 4 つ目の画面ではなく「範囲違い」

`reports` は自分の報告、`reports/manage` は**全員の報告**。
＝ **同じ一覧の絞り込み**であって、別の種類の画面ではない。
Directus なら preset（保存した絞り込み）で出す形。

🚨 **畳むかどうかは未決**（画面を見て決める。既に `PageTabs` を使っているので、
**利用者から見ると既にタブとして 1 つに見えている可能性が在る**）。

### 1 件のページに共通して守ったこと

- 🚨 **編集を付けない**（保存の単位が未決のものを、既成事実にしない）
- 🚨 **できないことを、その場に書く**（編集の場所を探させない）
- 🚨 **空を空白で出さない**（「（名前は未設定）」「まだ一度も使っていません」）
- 🚨 **必ず在るものを見出しにする**（利用者は**メール**。名前は空のことが在る）
- 🚨 **1 件だからと列を増やさない**（`directus_users` は資格情報に近い列を持つ）
- 🚨 **鍵は出さない**（エージェント。**出ないことを画面に書く**）
