---
type: area
title: 権限と認可（permissions）
description: ロール→ポリシー→permission の階層でコレクション単位・行単位・列単位の権限を判定する。エージェントは委任元の権限∩capabilitiesの二階建て。これまでに見つかった穴5件と塞ぎ方、検証の作法をまとめる。
tags: [permissions, security, auth, items, files]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://apps/studio/lib/permissions/resolve.ts"
  - resource: "repo://apps/studio/lib/items/service.ts"
  - resource: "repo://apps/studio/lib/items/query.ts"
  - resource: "repo://apps/studio/lib/files/service.ts"
  - resource: "repo://apps/studio/app/api/collections/route.ts"
  - resource: "repo://packages/sdk/README.md"
  - resource: "repo://.temp/2026-08-13/specs/F2-0-security-holes.md"
  - resource: "repo://.temp/2026-08-13/specs/F2-1-relation-permission-bypass.md"
stale_after: 2027-02-13
x_rag_okf:
  id: areas/permissions
  source_commit: 1603f6a
  authorship: agent
---

# 権限と認可（permissions）

**このプロジェクトで最も事故が多く、最も重要な領域。** v0.9 MVP の期間中に穴が5件見つかり、すべて塞いだ
（[[relation-permission-boundary]] 参照。最も深刻だったのは5件目）。

## 責務

「誰が」「どのコレクションの」「どの行・列を」「読み書きできるか」を1箇所（`lib/permissions/resolve.ts`）で
判定し、その結果を `lib/items/*` `lib/files/service.ts` `lib/schema/*`（管理系）が使う。
**判定ロジックを複数箇所に持たない**のが設計原則（[[folders-are-not-owned]] の教訓にも出てくる
「2つ作ると必ず片方が腐る」）。

## 主要なファイル

| パス | 責務 |
|---|---|
| `apps/studio/lib/permissions/resolve.ts` | 判定の本体。`resolvePermission`（items/files/folders 用）と `requireAdminAccess`（管理系 API 用） |
| `apps/studio/lib/items/service.ts` | `listItems` / `getItem` / `createItems` / `updateItem` / `deleteItem`。判定結果を実際の SQL に反映する |
| `apps/studio/lib/items/query.ts` | フィルタ・ソート・ページネーションのパース。`applyFilter` は permissions と items 両方から呼ばれる共通部品 |
| `apps/studio/lib/files/service.ts` | `directus_files` / `directus_folders` を**通常のコレクションとして** `resolvePermission` に載せている |
| `apps/studio/app/api/collections/route.ts` ほか管理系 route | `requireAdminAccess(actor, capability)` を呼ぶ。`items` 系とは別の入口 |

## 権限モデルの構造

```
directus_access（ロール or ユーザー → policy の紐付け）
        │
        ▼
directus_policies（admin_access フラグを持つ。true なら無条件で全許可）
        │
        ▼
directus_permissions（policy × collection × action(read/create/update/delete) → permissions(行フィルタ) + fields(列)）
```

`resolvePermission(actor, collection, action)` の処理順（`resolve.ts`）:

1. actor がエージェントなら、まず `capabilityAllows` でコレクション別の capability を見る（無ければ即 DENIED）
2. actor を人間ユーザーに変換（エージェントは `onBehalfOf` を引く）
3. ロール階層（親ロールを辿る）から `directus_access` 経由で policy 一覧を集める
4. policy のどれかが `admin_access:true` なら **無条件 allow・allowedFields:"*"**（`tenantScope` があれば行フィルタとして残る）
5. `directus_permissions` から `collection × action` に一致する行を集め、`fields`（列の和集合）と
   `permissions`（行フィルタの OR 合成。変数 `$CURRENT_USER` 等を実値に置換）を組み立てる
6. 該当行が無ければ DENIED

戻り値 `PermissionResolution = { allowed, allowedFields: string[] | "*", rowFilter: FilterObject | null, admin }`
が、items/files 側の判定と SQL 構築の両方に使われる。

## 判定の効き方

| 仕組み | 何をするか | 効かないとどうなるか |
|---|---|---|
| **allowedFields（列権限）** | `assertFieldAllowed` が `fields=`/`filter=`/`sort=`/書き込み payload の列名を照合。既定は許可された列のみ返す（`fields` 未指定時） | 見えてはいけない列（例 `secret`）が漏れる |
| **rowFilter（行フィルタ）** | `applyFilter` で SQL の WHERE に AND 合成。一覧・単体取得・更新・削除すべてに適用 | 他人の行が丸ごと見える／触れる |
| **書き込み後の再検証** | `assertRowsVisibleAfterWrite`（`items/service.ts`）。INSERT/UPDATE 後の行を `rowFilter` 付きで読み直し、見えなければロールバック | 「触ってよい行か」だけ見て「書いた結果まだ自分の行か」を見ない穴になる（後述 穴C・D） |

### 403 と 404 の出し分け

- **行が見えない**（rowFilter に一致しない）→ WHERE で絞られて 0 件 → **404 `ITEM_NOT_FOUND`**
- **列が明示的に許可されていない**（`fields=secret` を要求）→ **403 `FIELD_FORBIDDEN`**
- **コレクションそのものに権限が無い**（`directus_permissions` に該当行が0）→ **403 `PERMISSION_DENIED`**
- **管理系 API**（`/api/collections` 等）に委任元が管理者でない→ **403 `ADMIN_ACCESS_REQUIRED`**、
  capability が足りない → **403 `CAPABILITY_DENIED`**

「行が見えない」を 404 にすることで、存在確認（enumeration）を避けつつ、明示的な列拒否とは区別している。
エラーコードの全一覧は `packages/sdk/README.md` §5 を参照。

## エージェントの capabilities（人間 ≠ エージェントの二階建て）

[[two-tier-auth]] の実装。ログインは人間の身元確認のみで、エージェントは委任元から**委任される別主体**。

```
エージェントの実効権限 = 委任元ユーザーの権限 ∩ capabilities
```

`capabilities` の形（`packages/sdk/README.md` §2 実測）:

```jsonc
{
  "collections": { "articles": ["read", "create", "update", "delete"] },
  "admin": ["schema:read", "schema:write", "settings:read", "settings:write"]
}
```

🚨 **`collections` と `admin` は既定が逆**（`resolve.ts` の `capabilityAllows` / `capabilityAllowsAdmin`）。

| capabilities | items（行の読み書き） | 管理系（collections/fields/roles/policies/…） |
|---|---|---|
| 未指定（`null`） | 委任元の権限をそのまま継承 | 全部 403（既定は不許可） |
| `{admin:[...]}` だけ | 全部 403（`collections` を書かないと items は1件も触れない） | 指定範囲だけ許可 |
| `{admin:[...], collections:{...}}` | 列挙したコレクションだけ | 指定範囲だけ許可 |

理由（`resolve.ts` のコメントより）: items 側は「委任元をそのまま継承」が安全側（後から絞る）、
管理系は「明示しない限り拒否」が安全側（スキーマ破壊・権限昇格に直結するため）。
`collections` にワイルドカードが無いため、「管理操作もできて全コレクションも触れる」トークンは
現状**表現できない**（未解決の課題として `packages/sdk/README.md` に記録あり）。

## これまでに見つかった穴 5 件

`F2-0`（穴 A〜D）と `F2-1`（穴 E）で発見。**すべて修正済み**（`apps/studio/lib/items/service.ts` /
`lib/files/service.ts` の現状コードで確認: `assertRowsVisibleAfterWrite` と、
`listItems`/`getItem` の `resolvePermissionMap`（relation targets 全件を `resolvePermission` に通す）が実装されている）。

| # | 穴 | 症状 | 塞ぎ方 |
|---|---|---|---|
| **A** | `lib/files/service.ts` の全関数が `actor` を捨てていた（引数名が `_actor`） | 認証さえ通れば誰でも他人のファイルを読める・書き換えられる・消せる | `directus_files`/`directus_folders` を通常コレクションとして `resolvePermission` に載せ、行フィルタ・列フィルタを適用 |
| **B** | エージェントの `capabilities` が管理系ルート（`requireAdminAccess`）に効かなかった | capabilities を絞ったトークンでもコレクションの作成・削除ができた | `requireAdminAccess(actor, capability)` に capability 引数を追加し `capabilityAllowsAdmin` で判定 |
| **C** | `createItems` が `rowFilter` を一度も見ていなかった | 他人名義の行を作れた（`owner=B` で POST → 201） | `assertRowsVisibleAfterWrite`: INSERT 後の行を rowFilter 付きで読み直し、見えなければロールバック |
| **D** | `updateItem` が「更新後の行」を検証していなかった | 自分の行を他人へ owner 書き換えで押し付けられた | 同上の再検証を UPDATE 後にも適用 |
| **E** | リレーションを辿るとき相手側コレクションの `resolvePermission` を一度も呼んでいなかった（[[relation-permission-boundary]]） | 直接読むと403のコレクションが、`child?fields=parent.*` 経由なら全列そのまま返った。踏み台の行を自作すれば任意行を吸い出せた。`deep._filter` は当たり外れで値を復元できるオラクルになっていた | `resolveRelationsForItems` で relation targets 全件の `resolvePermission` を先に解決し（`resolvePermissionMap`）、相手側の `allowedFields`・`rowFilter` を適用。相手に権限が無ければ `parent:null`/`children:[]` |

**穴 A・B は「認可そのものが無かった」、穴 C・D は「書き込み後の状態を検証していなかった」、
穴 E は「境界を跨ぐ経路（リレーション）に判定を通していなかった」**という3種の失敗パターン。

## 検証の作法

[[relation-permission-boundary]] と `.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §5 の教訓:

1. **否定形は肯定形とセットで確認する。** 「A に B の行が見えない」は、B の行を誰も作っていなければ
   自明に真になる。必ず「B の行は実在する（管理者から見える）」→「A は自分の行が見える」→
   「A から B は見えない」の順で確認する。`acceptance/checks/08-row-permission.mjs` はこの順序を
   コードで固定している
2. **対照実験を必ず入れる。** `parent:null` は「権限で塞いだ結果」と「リレーションがそもそも解決できていない
   （検証が空振り）」のどちらでも起きる。**管理者で同じクエリが通ることを確認して初めて前者だと言える**
3. **検証対象が、検証したいコミットのビルドかを先に確認する。** 古いコンテナ・古い `.next` を見て
   「まだ漏れる」（偽の赤）や「直っている」（偽の緑）と誤報した事故が3回起きている。
   `git show <fix-commit> -- <path> | grep '^\+function '` で新しい関数名を拾い、
   検証対象にその関数が実際に含まれているかを `grep -c` で数えてから測る
4. **独立検証は実装者とは別の担当者が行う。** `git archive HEAD` から焼いた本番イメージに対して、
   スクリプトを1文字も改変せずに実行する

## 注意点（Gotchas）

- `capabilities` を一度でも指定したエージェントトークンは、`collections` も必ず書く。書き忘れると
  「テーブルは作れるが行は1件も読み書きできない」トークンになる（実測で確認済み・`packages/sdk/README.md`）
- Bearer トークンで「人間ユーザー」になる経路は存在しない（`directus_users.token` 列は未使用）。
  Bearer と Cookie を両方送ると **Bearer が勝つ**
- フォルダには所有者列が無い（[[folders-are-not-owned]]）。行フィルタは「コレクション単位の権限」までしか
  効かず、フォルダ単位の細かい出し分けはできない。これは欠陥ではなく Directus と同じ設計判断
- N+1 回避（リレーション解決を「親1本 + 子 IN 句」でまとめる設計）を、権限判定の追加で壊さないこと。
  行ごとに `resolvePermission` を呼ぶと N+1 が復活するため、コレクション単位で先に解決してから流す
  （`resolvePermissionMap` の役割）

## 他の領域との関係

- **[[acceptance]]**: 受入基準8（他人の行に ID 直打ちしても 403/404）と9（SVG/HTML の attachment 強制）は
  この権限モデルの回帰テストそのもの。穴Eの再発は `acceptance/checks/05-06-mcp.mjs` に組み込まれている
- **`apps/studio` 全体との関係**は [[apps-studio]] 参照（`lib/permissions` は `next/*` に依存しないドメイン層）

## 根拠

- 実装: `apps/studio/lib/permissions/resolve.ts`（全文）、`lib/items/service.ts`（`assertRowsVisibleAfterWrite`
  `resolvePermissionMap` `resolveRelationsForItems`）、`lib/files/service.ts`（`permissionForAction` の
  全メソッドでの使用）、`app/api/collections/route.ts`（`requireAdminAccess` の呼び出し）
- `packages/sdk/README.md` §1・§2・§5・§7（実測した認証・capabilities・エラーコード・権限の効き方）
- `.temp/2026-08-13/specs/F2-0-security-holes.md`（穴 A〜D の発見・修正方針・受入基準）
- `.temp/2026-08-13/specs/F2-1-relation-permission-bypass.md`（穴 E の発見・修正方針・受入基準）
- `knowledge/decisions/relation-permission-boundary.md`、`two-tier-auth.md`、`folders-are-not-owned.md`
