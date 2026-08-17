---
type: decision
title: 項目のプレビュー（Directus の content-item-preview）は v1 で作らない
description: Directus は content モジュールに preview のルートを持ち、live-preview（外部サイトを iframe で出し、バージョンを切り替えて見る仕組み）を載せている。OhMyCMS には表示先のサイトも、バージョンの概念も無いので、作っても閉じる行き止まりが書けない。v1 では作らず、作るときに何が要るかを書き残す。
tags: [apps-studio, v1, schema]
status: active
generated:
  by: agent
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://apps/studio/app/(admin)/admin/content/[collection]/page.tsx"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/content-preview-not-in-v1
  authorship: agent
---

# 項目のプレビューは v1 で作らない

## Directus は何を持っているか（引いた・2026-08-17）

`app/src/modules/content/routes/preview.vue` … 依存を見ると、この画面が何であるかが分かる。

```
useVersions ………………… 項目の「版」を切り替える
useVisualEditing ………… 表示先のサイト側と通信して、その場で編集する
LivePreview ……………… 外部サイトを iframe で出す部品
renderStringTemplate … プレビュー先の URL をテンプレートから組み立てる
```

＝ **「この項目が、実際のサイトでどう見えるか」を、外部サイトを開いて見せる画面**。

## こちらに無いもの（＝ 作っても閉じられない）

| Directus が前提にしているもの | OhMyCMS |
|---|---|
| **表示先のサイト**（プレビュー URL のテンプレート） | 🚨 **無い**。CMS 単体で、表示先を持っていない |
| **項目の版（versions）** | 🚨 **無い** |
| 表示先と通信する仕組み（visual editing） | 🚨 **無い** |

🚨 **「Directus に在るから作る」は理由にならない**（DESIGN.md §0）。
この画面が閉じる行き止まりは「**利用者が、公開後の見た目を確かめたい**」だが、
**公開先が無い**ので、いま作っても**空の枠**になる。

## 決定

**v1 では作らない。** K3（動的パス配下を Directus に見習う）の 4 番目は、これで閉じる。

## 作るときに要るもの（先に書いておく）

1. **表示先の URL をどこに持つか** … コレクションごとの設定（Directus は `preview_url` を持つ）
2. **その URL を組み立てる仕組み** … 項目の値を差し込むテンプレート
3. 🚨 **外部サイトを iframe で出すときの安全** … 表示先は利用者が入れた URL になるので、
   `sandbox` と `referrerpolicy` を決めてから作る（**ここを決めずに作らない**）
4. 版（versions）が要るかは別の判断。**プレビューは版が無くても作れる**

## 関連

- [[singleton-is-a-flag-without-behavior]] — 同じ「作らない理由を残す」形
- [[list-views-are-switchable-layouts]] — 一覧の表示形式（こちらは v1 で作った）
