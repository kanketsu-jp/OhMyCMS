---
type: decision
title: リレーションを辿るときも、相手側コレクションの権限を必ず通す
description: 関連先を取りに行くとき相手側の resolvePermission を呼んでいなかったため、権限の無いコレクションの任意の行を読めた。境界を跨ぐ経路にも同じ判定を通すと決めた。
tags: [permissions, security, items]
status: active
generated:
  by: rag-okf
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://apps/studio/lib/items/service.ts"
  - resource: "repo://apps/studio/lib/items/query.ts"
  - resource: "repo://apps/studio/lib/items/filter.ts"
stale_after: 2027-02-13
x_rag_okf:
  id: decisions/relation-permission-boundary
  authorship: agent
---

# リレーションを辿るときも、相手側コレクションの権限を必ず通す

## 背景

認可の穴を4件塞いだ直後（`F2-0`）、別の担当者が**本番ビルドのコンテナ**に対して破りに行ったところ、
**5件目の穴**が出た。**いちばん深刻だった。**

前提: A は `child` にだけ read/create。**`parent` には permission 行が1つも無い。**

```
直接:   GET /api/items/parent            → 403 PERMISSION_DENIED（正しい）

子経由: GET /api/items/child?fields=id,parent.*  → 200
        {"parent":{"title":"B の親","secret":"TOP-SECRET-OF-B"}}   ← 全列そのまま
```

🚨 **「たまたま繋がっている親が見える」だけではなかった。**
A は `child` に create 権限を持つので、**親の id さえ分かれば踏み台の子を自作して読み出せた。**
実測で 3 件すべて吸い出せた。

🚨 **`fields` を塞いでも `deep` の `_filter` がオラクルになった。**
当たりなら返り、外れなら `null`。**総当たりで値を復元できる。**

方向も両方向で成立した:
- **m2o**: 親が漏れる
- **o2m**: 子が漏れる。**しかも多段で連鎖した**（2段先の祖父の `secret` まで）
- m2m / m2a: 🟢 閉じていた（未実装のガードに到達していたため）

## 決定

> 基準日: 2026-08-13

**リレーションを辿るときも、相手側コレクションの `resolvePermission` を必ず通す。**

1. 相手側の `allowedFields` で列を絞る（許可外の列は返さない）
2. 相手側の `rowFilter` を適用する（見えない行は `parent: null` / `children: []`）
3. 🚨 **`deep` の `_filter` も相手側の `allowedFields` で検証する**（オラクルを塞ぐ）
4. 🚨 **子の `allowedFields` で親の列名を照合する作りをやめた**（意味的に間違っていた。
   子に同名の列があれば通ってしまう）
5. 相手側に permission が1つも無ければ、リレーション自体を返さない

## 理由

**「自分のコレクションの中」を閉じただけでは足りない。** `F2-0` は行の作成・更新・ファイルを閉じたが、
**境界を跨ぐ経路が残っていた。**

権限の判定を「読み取りの入口」だけに置くと、**関連を辿る経路が判定を迂回する**。
判定は**データを取りに行くすべての経路**に乗せる必要がある。

## 影響

- `lib/items/service.ts` に +328 行（`filter.ts` +15 / `query.ts` +31）
- **N+1 回避を壊さないこと**が制約になった（権限判定を行ごとに呼ぶと N+1 が復活する）。
  コレクション単位で権限を解決してから流す形にしてある
- `relations.ts` は**無変更**。m2m/m2a の `UNSUPPORTED_RELATION` ガード2箇所はそのまま
- **受入ハーネスの基準5 に回帰テストとして入れた**（`acceptance/checks/05-06-mcp.mjs`）。
  再発したらハーネスが落ちる

## 検証（実装者とは別の担当者が、本番イメージに対して実施）

| 攻撃 | Before | After |
|---|---|---|
| `child?fields=parent.secret` | 200 `{"secret":"TOP-SECRET-OF-B"}` | 200 **`{"parent":null}`** |
| 踏み台を3件作って吸い出す | 3件すべて取得 | **`[null,null,null]`** |
| `deep` の `_filter`（当たり/外れ） | 判別できた | **どちらも 403** |
| o2m `parent?fields=children.secret` | 200 B の子2件 | 200 **`{"children":[]}`** |
| 2段ネスト `children.gp.secret` | 200 `GRANDPARENT-SECRET` | 200 **`{"children":[]}`** |
| 🟢 **対照: 管理者で同じ URL** | 200 secret が返る | **200 secret が返る** |

🚨 **最後の対照が決定的。** `parent: null` は
**(a) 権限で塞いだ結果** と **(b) リレーションがそもそも解決できていない（＝検証が空振り）** の
**どちらでも起きる**。管理者で同じクエリが通ることを確認して初めて (a) だと言える。

## 教訓（他の機能にも効く）

- **「中身を返さなければ安全」ではない。存在を知られること自体が漏洩。**
  → 横断検索でも同じ性質の事故が起きうる（[[global-search-permission]] があれば参照）
- **否定形の検証は、肯定形とセットで初めて意味を持つ。**
  今回は「対象データが無い」ではなく「**機能が動いていない**」で空振りする形だった
- **検証対象が、検証したいコミットのビルドか**を先に確認する。
  一度、修正前のコンテナで検証して「まだ漏れる」と誤報した

## 根拠

- 発見・検証: `.temp/2026-08-13/f0c/f0e-relation-probe.sh` / `f0e-relation-escalation.sh` / `f0e-o2m-m2m-probe.sh`
- 仕様: `.temp/2026-08-13/specs/F2-1-relation-permission-bypass.md`
- 修正: commit `2df5938`（受入基準13項目を実測して全通過）
- 独立検証: 実装者とは別の担当者が `git archive HEAD` から焼いた本番イメージに対して、
  スクリプトを1文字も改変せずに実行

## 関連

[[two-tier-auth]] / [[cli-mcp-over-rest]] / [[folders-are-not-owned]]
