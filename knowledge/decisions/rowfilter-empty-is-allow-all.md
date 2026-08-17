---
type: decision
title: 行フィルタは空だと全行許可、壊れると拒否（fail-open しない）
description: 権限の行フィルタを生 JSON で手書きさせる。壊れた入力（非オブジェクト・存在しない列・parse できない JSON）は 400／500／クエリ拒否で fail-CLOSED。空・null・{} は allow-all＝標準の「行の制限なし」。🚨「空欄＝拒否」と誤解する余地が残る。対処は UI 側で「制限なし」を明示する（条件ビルダー・design の持ち場）。security が実測。
tags: [permissions, security]
status: accepted
date: 2026-08-17
---

## 決定

**壊れた行フィルタは認可を通さない（fail-closed）。空の行フィルタは「行の制限なし＝全行許可」になる（標準の意味）。**

- 非オブジェクト（配列・数値・文字列）・存在しない列・parse できない JSON は、保存時（400）か認可時（500／クエリ拒否）で止まる。**書き間違いが「全部許可」に化けることはない。**
- 空文字・`null`・`{}` は「行フィルタ無し」＝その権限が対象コレクションの**全行**に効く（＝行の制限を掛けていない、という標準の意味）。
- 🚨 **UI は「空＝制限なし（全行）」を明示する。**「空欄＝拒否」ではない。条件ビルダーで「制限なし」を選ばせる形にする（design の持ち場）。

## なぜ

権限の行フィルタは生 JSON のテキスト欄（`policy-permissions-manager.tsx` の `filterJson`）で手書きさせている。「書き間違えたフィルタが『条件なし＝全部許可』に倒れないか（fail-open なら書き間違いが権限の穴になる）」を確かめる必要があった。

## 測ったこと（2026-08-17・security 実測・dev DB・使い捨て・対照つき）

| filter | 認可結果 | 判定 |
|---|---|---|
| `{"owner":{"_eq":"keepme"}}` | 絞る → 1 行 | 🟢 対照: フィルタは効く／権限者は通る |
| `null`（フィルタ無し） | 全行 → 2 行 | 標準の「行の制限なし」 |
| `{}` 空 | 全行 → 2 行 | 同上（0 条件） |
| 配列 `[1,2]` ／ 数値 `123` | **500 INVALID_PERMISSION_FILTER** | 🟢 fail-closed |
| 存在しない列 | クエリが「存在しない列です」で拒否 | 🟢 fail-closed |

機構:

- `lib/permissions/resolve.ts` の `asFilter` は非オブジェクトを **500 で弾く**（`isRecord` でない値を拒否）。
- `lib/items/filter.ts` の `applyFilter` は `null`／`{}` を 0 条件（全行）にし、存在しない列をスキーマ照合して拒否する。
- 保存側 `lib/admin/permissions-api.ts` は JSON を `parse` して壊れた JSON を **400** で弾く。
- 🚨 ただし**空文字は 201 で保存でき、`null` 同様 allow-all** になる。

## 🚨 残る誤解の余地

**「フィルタを消す＝拒否」と読む余地がある。** 実際は「フィルタを消す＝行の制限なし＝全行許可」。
権限そのものを持っている（例: read を許可した）うえで行の制限を掛けていない、という標準の意味だが、
UI がそれを明示しないと「空にしたから安全」と誤読されうる。

同型のもう 1 つ: エージェント `capabilities` も生 JSON で、壊れると拒否（fail-closed）だが、
`null`／空は「委任元の権限を全継承」になる（`lib/permissions/resolve.ts` の `capabilityAllows`）。
＝ 生 JSON を手書きさせる入力は「空＝無制限」の footgun を共有する。

## 対処（design の持ち場）

条件ビルダー（Directus の `system-filter` 相当・自作）を入れ、「制限なし」を明示的な選択肢にする。
`$CURRENT_USER` の置換機構は既に在る（`lib/permissions/variables.ts`）ので、「自分のものだけ」等は接続可能。
直接編集の口を残すなら、サーバ側で形（非オブジェクト拒否＋列名の実在）を検証する。

## sources

- apps/studio/lib/permissions/resolve.ts
- apps/studio/lib/items/filter.ts
- apps/studio/lib/admin/permissions-api.ts
- apps/studio/lib/permissions/variables.ts
- apps/studio/components/admin/policy-permissions-manager.tsx
