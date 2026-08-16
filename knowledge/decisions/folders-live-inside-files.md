---
type: decision
title: フォルダは独立した画面を持たない（ファイルの中に畳む）
description: フォルダ専用の一覧画面は 2026-08-14 に files へ統合され、/admin/folders は /admin/files への転送だけが残っている。ナビにフォルダの導線は無く、それが正常。受入 #3 の必須機能一覧に「フォルダ」が残っていて FAIL になっていたので、検査の側を実装に合わせる。統合したこと自体はコミットに記録が在るが、なぜ統合したかの理由はどこにも書かれていない。
tags: [design, ux, acceptance]
status: active
generated:
  by: agent
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://apps/studio/app/(admin)/admin/folders/page.tsx"
  - resource: "repo://acceptance/checks/03-gui-reach.mjs"
  - resource: "repo://knowledge/decisions/folders-are-not-owned.md"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/folders-live-inside-files
  authorship: agent
---

# フォルダは独立した画面を持たない（ファイルの中に畳む）

> 由来: 2026-08-17。受入 #3（GUI 到達）が
> **「必須機能への導線がナビに揃っている → 欠け: フォルダ」** で FAIL していた。
> 「ナビから消えた（退行）」なのか「畳んだ（意図）」なのかを実測で分けた結果、**畳んだほう**だった。
>
> 関連: [フォルダは「誰かの持ち物」にしない](./folders-are-not-owned.md)（**所有**の話。こちらは**画面**の話）

## 1. 決定

**フォルダは `/admin/files` の中で扱う。フォルダ専用の一覧画面は持たない。**
**ナビに「フォルダ」の導線が無いのは正常であり、受入もそれを期待しない。**

## 2. 実測（2026-08-17・受入と同じ計器 `establishSession` で取得した生 HTML）

```
/admin/folders …………………… **HTTP 307**
実体 `app/(admin)/admin/folders/page.tsx` … **`redirect("/admin/files")` の 4 行**
ソースに `admin/folders` へのリンク … **0 件**
   🟢 対照 `admin/files` … **11 ファイル**（＝ この探し方は「在り」も出せる）
```

## 3. いつ・何が起きたか（**引いた**）

```
`f143301` **2026-08-14 04:53**
「フォルダをファイルへ統合する（ナビからフォルダを消し /admin/folders を /admin/files へ転送・
  breadcrumb 追加・root判定）」
同じコミットの中身:
   `folders-manager.tsx` **削除（-108）** → `folder-grid.tsx` **新規（+109）**
   `new-folder-form.tsx` **新規（+71）** ／ `layout.tsx` **-1**（＝ ナビの 1 行）
   `breadcrumb.tsx` **新規（+94）**
＝ 🚨 **「ナビから消えた」ではなく「作り直して統合した」。意図された変更。**
```

🚨 **ただし「なぜ統合したか」は、どこにも書かれていない。**
コミット本文は変更内容の列挙だけで、判断の理由が無い。
**この決定は「そうなっている」ことを固定するもので、「そうすべき理由」を再構成したものではない。**
理由を知っている人が居たら、ここへ 1 行足すこと。

## 4. 受入への反映

`acceptance/checks/03-gui-reach.mjs` の必須機能一覧（roster）から
`["/admin/folders", "フォルダ"]` を外す。

🚨 **実装は直さない。** 実装は一貫している（転送だけを残し、リンクを持たない）。
**古いのは検査の期待のほうだった。**

## 5. アンチパターン

- ❌ ナビに「フォルダ」を戻す（**統合の設計に反する**）
- ❌ `/admin/folders` の転送を消す（**古いリンク・ブックマークが 404 になる**）
- ❌ 受入の roster に戻す（**この決定を読まずに「欠けている」と判断しない**）
- ❌ 「なぜ統合したか」を推測で書き足す（**記録が無いことは、無いと書く**）

## 6. レビュー観点

- [ ] `/admin/folders` が転送のままか（301/307 で `/admin/files` へ）
- [ ] ナビに `admin/folders` へのリンクが増えていないか
- [ ] 受入 #3 の roster にフォルダが戻っていないか
