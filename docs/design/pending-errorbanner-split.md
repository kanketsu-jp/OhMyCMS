# 【判断待ち】エラー表示をトーストへ移すとき、何を移して何を残すか

> 2026-08-15 design が実測して分類したもの。**堀池さんの裁定を待っている。**
> 由来: 堀池さん決定「**エラーもトーストへ**（成功だけではない）」。
> design の懸念: 「**3秒で消えるトーストに移すと、読み終わる前に消えるものがある**」。
> 関連: `.temp/2026-08-15/toast-removal-list.md`（撤去対象の一覧・実装は toast ペイン）

## 0. 何を決めてほしいか（1つだけ）

**「操作の結果」と「画面の状態」を分けてよいか。** design の案:

| 種類 | どこへ | 理由 |
|---|---|---|
| **出来事**（保存に失敗した・削除できなかった） | **トースト** | もう終わったこと。3秒で消えてよい |
| **状態**（この画面のデータがいま読めていない） | **本文に残す** | **消えると「一覧が空」と区別が付かない** |

🚨 **「全部トーストへ」にすると、後者が消える。**
一覧が取得できていない画面は、トーストが消えたあと**ただの空っぽの画面**になり、
利用者は「データが 0 件なのか、壊れているのか」を判断できません。

## 1. 実測（この分類は推測ではありません）

`grep -rn '<ErrorBanner' app components` → **22 箇所**。
中身を1つずつ読むと、**入力が2種類しかない**ことが分かりました。

| 入力 | 出どころ | 意味 |
|---|---|---|
| `errorMessage` | **`?error=` のクエリ**（`errorKeyFromQuery(params.error)`） | 操作が失敗して**リダイレクトで戻ってきた** = **出来事** |
| `result.message` / `!result.ok` | `apiFetch` の戻り値 | **このページのデータが読めなかった** = **状態** |

### 内訳（22 箇所）

**A. 出来事だけ（1 箇所）→ トーストへ**

    app/(admin)/admin/collections/new/page.tsx:43     message={errorMessage}

**B. 🚨 出来事と状態が同じ部品に入っている（5 箇所）→ 分ける必要がある**

    app/(admin)/admin/collections/page.tsx:58         errorMessage ?? (!result.ok ? … )
    app/(admin)/admin/collections/[collection]/page.tsx:117
    app/(admin)/admin/content/[collection]/page.tsx:113
    app/(admin)/admin/content/[collection]/new/page.tsx:34
    app/(admin)/admin/content/[collection]/[id]/page.tsx:38

🚨 **ここが今回いちばん大事な発見です。**
「`ErrorBanner` をトーストに置き換える」という作業指示は、**この 5 箇所で必ず事故ります**。
同じ 1 つの部品が、**どちらが `null` でないかによって出来事にも状態にもなる**ので、
部品ごと動かすと**状態の方も一緒に消えます**。
→ **移すのは部品ではなく、`errorMessage` という入力の方**です。

**C. 状態だけ（16 箇所）→ 本文に残す**

    settings/{roles,general,agents,storage,users,policies,policies/[id],version,mcp,sso}/page.tsx
    files/page.tsx, files/new/page.tsx, files/[id]/page.tsx
    notifications/page.tsx, reports/page.tsx, reports/manage/page.tsx

いずれも `apiFetch` が失敗したときだけ出ます。**操作の結果ではありません。**

## 2. 裁定が「全部トーストへ」だった場合に起きること

design としては反対ですが、**決まればそのとおりにします**。その場合に起きることを書いておきます:

- 一覧が読めていない画面が、トーストが消えたあと**空の一覧に見える**（16 箇所すべて）
- 設定画面は**保存できない理由が消える**ので、利用者は同じ操作を繰り返す
- 🚨 **回復手段がなくなる**わけではありません（再読み込みすれば再びトーストが出る）が、
  **一度消えると、消えたことに気づけません**

## 3. 裁定が出たあとの作業（どちらでも機械的に流せます）

- **分ける場合**: B の 5 箇所で `errorMessage` を `ErrorBanner` から外し、
  トーストへ渡す。A の 1 箇所は丸ごとトーストへ。C の 16 箇所は**触らない**
- **全部移す場合**: 22 箇所すべてを外し、`?error=` と `result.message` の両方をトーストへ

どちらも**辞書のキーはそのまま使えます**（`i18n/notice.ts` の許可リスト、`i18n/error.ts`）。
🚨 **許可リストは残すこと。** URL のクエリを辞書キーとして受けているので、
任意の文字列を通すと**未定義キーが画面に出ます**。

## 4. この文書の置き場所について

「調べた結果」なので `docs/`（`AGENTS.md` §8）。
**裁定が出たら `knowledge/decisions/` へ「決定」として書き直します。**
