---
type: decision
title: i18n は必須（旧PJの方針を反転）
description: 全UI文言を辞書化し日本語・英語に対応する。旧PJで堀池が明示していた「i18n は作らない」という決定を反転させたもの。🚨 ただし実行時に増える欄の名前は DB 側（ohmycms_field_labels）で、配線済みは項目一覧の見出しと入力欄のラベルまで。右パネルの列選択は未検証で、フィールド一覧に欄名を出す前に内部列の扱いを決める必要がある。
tags: [i18n, ui, apps-studio]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
  - resource: "repo://.temp/2026-08-13/specs/00-phase-plan-and-contract.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/i18n-required
  source_commit: 1603f6a
  authorship: agent
---

# i18n は必須（旧PJの方針を反転）

## 背景

**この決定は旧PJの決定を反転（supersede）させたものである。** 旧PJ（`ai-native-cms`）では
堀池が明示的に「翻訳・i18n は作らない」と指示していた
（`knowledge-historys/ai-native-cms/source/05-mvp-plan.md:34-56`）。今回の `idea.md`
§完全日本語対応 で、この方針を**必須に反転**させた。rag-okf の `supersedes` に相当する
反転であり、旧方針を採用する理由が今回のPJでは失われた（むしろ逆転した）ことを示す。

## 決定

> 基準日: 2026-08-13

全 UI 文言を辞書化し、日本語と英語に対応する。将来さらに言語を足せる形にする。

## 理由

既存 CMS が全滅した最大の理由が「管理画面の日本語化が、そのCMSの用意した範囲で
天井を打つ」ことだった。自作の最大の利得は**全文言が自前の辞書にある状態**にできることで、
ここを削ると自作する意味そのものが薄れる。

## 影響

- F1（i18n 基盤）完了後、全トラックが「UI に日本語・英語の文字列を直接書かず、必ず辞書キーを
  通す」契約に従う（`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §2-3）。
  F1 完了前に UI を触るトラックは新しい文言を追加しない。
- v0.9 MVP の受入基準 #7「UI が日本語（英語にも切り替わる）。ハードコードされた文言が無い」
  に直結する（同spec §5）。

## 実行時に増える文言（欄名）— 2026-08-16 追記

設問286 A で、**利用者が作ったフィールドの表示名**は
`directus_fields.translations`（`{"ja":"本文","en":"Body"}`）に持つと決めた。
**ビルド時に確定する `i18n/messages/<locale>/*.json` には、実行時に増える欄の名前を置けない**ため。

- 読むときは必ず `lib/schema/labels.ts` の `fieldLabel(field, locale)` を通す
  （各所で `?? field.field` と書くと、フォールバックの順序と空文字の扱いが必ず割れる）
- 辞書が無ければ**生の識別子に落ちる**ので、名前を付けるまで画面は変わらない（実測済み）
- 配線済み: **項目一覧の見出し / 入力欄のラベル**。🚨 **右パネルの列選択は未検証**
  （同じ関数を呼んでいるが、Client の `useLocale` は別経路。開いた状態で測れていない）

🚨 **フィールド一覧（`/admin/collections/<c>`）に欄名を出す前に、決めることが 1 つある。**
`body_rich_plain` のような**本文の検索用に自動生成される内部の列**が、
**フィールド一覧にだけ出ている**（項目一覧・入力欄は `meta.hidden` で除いている）。
**欄名を付けられるようにすると、利用者はこの内部の列にも名前を付けようとする。**
→ **隠すか、自動生成の列だと印を出すかを、フィールド一覧へ着手する人が先に決めること。**
（2026-08-16 時点では**まだ決めていない**。いま隠す作業はしていない）

## 根拠

- `knowledge-historys/izukurasan/03-findings.md` §2、同 README §4
- 反転元: `knowledge-historys/ai-native-cms/source/05-mvp-plan.md:34-56`
- `.temp/2026-08-13/decisions-log.md` D-009
