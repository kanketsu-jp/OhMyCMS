---
type: decision
title: ショートカットはエディタのキーバインドと衝突しない
description: 管理画面のショートカット（SHORTCUTS）は、うち同士だけでなく WYSIWYG（Tiptap）が実際に登録しているキーとも衝突しないことを検査対象にする。予約語は手で一覧化せず、node_modules の Tiptap 本体から抽出して Tiptap 自身を出典にする。
tags: [ui, apps-studio, acceptance]
status: stable
generated:
  by: "rag-okf:mcp"
  at: "2026-08-15T11:47:13.186Z"
verified: []
sources:
  - resource: "repo://apps/studio/components/admin/shortcuts.ts"
  - resource: "repo://apps/studio/scripts/check-shortcuts.mjs"
x_rag_okf:
  id: decisions/shortcuts-must-not-collide-with-editor
  source_commit: be350fa
  source_digest: "sha256:622a01d6b44117d2684ecd39f51624ae0fc6ae9bc53633b8730b4db478543da8"
  authorship: agent
---

# ショートカットはエディタのキーバインドと衝突しない

## 背景

管理画面のショートカット定義は `components/admin/shortcuts.ts` の `SHORTCUTS` 一箇所のみ
（堀池・2026-08-15 原文:「ショートカットは**被ってはいけない**」「戻る・検索・保存（⌘エンター）・
左サイドバーの開閉・右サイドバーの開閉・送信（⌘⇧エンター）」）。うち同士の被りは
`scripts/check-shortcuts.mjs` が既に検出していたが、WYSIWYG（Tiptap）が実際に登録している
キーとの衝突は検査していなかった（検査コメントの実測記録: 旧版120行に `mod+i` / Tiptap / 衝突
の語が0件だった）。

## 決定

> 基準日: 2026-08-15

管理画面のショートカットは、**うち同士だけでなく Tiptap が実際に登録しているキー**とも
衝突しないことを検査対象にする。予約語は**手で一覧化しない**——`node_modules` の Tiptap 本体
（`@tiptap/starter-kit` の依存グラフ）から `addKeyboardShortcuts()` を抽出し、Tiptap 自身を
出典にする。

現時点で衝突が2件見つかっている（**記録のみ・未決**）:

- `save`(`mod+enter`) と Tiptap の `Mod-Enter`（`@tiptap/core` / `@tiptap/extension-hard-break`）
- `toggleLeftSidebar`(`mod+b`) と Tiptap の `Mod-b`/`Mod-B`（`@tiptap/extension-bold`）

🚨 **承認は「これでよい」ではなく「いま在ることを記録した」。** 各衝突には記録日・未決かどうか・
決める人・何を決めるかを持たせ（`TIPTAP_CONFLICT_EXCEPTIONS`）、未決のものは検査実行のたびに
そう表示する。決める人は司令塔。

## 理由

手書きの予約語一覧は Tiptap を上げた日に嘘になる。`useShortcut` は入力中を避けるので実害が
出ないことがあるが、「入力欄の外では効いて、中では効かない」ショートカットはそれ自体が
説明しにくく、黙って据え置いてよい理由にはならない。

## 影響

- 守り手: `scripts/check-shortcuts.mjs`。
- 抽出の落とし穴（実測・スクリプトのコメントに記録済み）: `node_modules/@tiptap` 直下には
  宣言済みの5パッケージしかなく、`extension-italic` は `starter-kit` の依存の先（symlink 経由）
  にある。symlink を辿らない `find` は0件を返す。→ パッケージグラフ（`package.json` の
  `dependencies` + 実際の `require`/`import` 文）を辿って解決する。
- 検査自身の合格条件の中核は「抽出結果に `Mod-i` が `extension-italic` 出所で含まれること」。
  含まれなければ「衝突が無い」ではなく「見ていない」として検査自体を失敗させる。
- アプリ側が `addKeyboardShortcuts()` で既定を上書きできるため、`components/**` `app/**` も
  走査して「上書きあり」を追記で報告する（**判定＝衝突の有無は変えない**）。実測（2026-08-15）:
  `save`(`mod+enter`) は `components/admin/rich-text-field.tsx` で上書きされている。
- `save` は `whileTyping: true` で登録されている（`page-action.tsx:118` /
  `bug-report-composer.tsx:135` / `report-thread.tsx:87`）ため Tiptap の編集中でも発火しうるが、
  Tiptap 側の `Mod-Enter` と実際に同時に動くかは**未測定**（WYSIWYG を置いた画面での実測が要る。
  担当は未割り当て）。

## 根拠

- `apps/studio/components/admin/shortcuts.ts`
- `apps/studio/scripts/check-shortcuts.mjs`
- `node scripts/check-shortcuts.mjs` 実行結果（2026-08-15）: うち同士の被り0件。Tiptap の
  一意な組み合わせを18件抽出し、`Mod-i`(`extension-italic`出所)を検出。自己検査（囮1〜5・
  迂回3種の診断を含む）は全て想定どおり。本番判定は「Tiptap との衝突（未承認）: 0件」——
  ただし `save`/`toggleLeftSidebar` は `TIPTAP_CONFLICT_EXCEPTIONS` に記録済みのため
  「未承認」の集計から除外されているだけで、**衝突自体は消えていない**（各ショートカットの
  内訳表示では両方とも「🟡 衝突あり（記録済み・未決）」と出る）。
