---
type: decision
title: Directus をフォークしない
description: Directus は設計と API の形だけを参考にし、ソースをフォークして改造する方式は採らない。ホワイトラベルは Payload 型のファイルパス間接参照（Import Map）方式で実現する。
tags: [architecture, directus, whitelabel]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.temp/2026-08-13/decisions-log.md"
stale_after: 2027-02-09
x_rag_okf:
  id: decisions/no-directus-fork
  source_commit: 1603f6a
  authorship: agent
---

# Directus をフォークしない

## 背景

`idea.md` §バックエンドで Directus を設計のベース（コレクション・ストレージ・ユーザー・
権限・MCP対応 等）として参考にする方針を掲げているが、それを実装としてどう取り込むかは
別の判断が要る。

## 決定

> 基準日: 2026-08-13

Directus のソースをフォークして改造する方式は採らない。参考にするのは**設計と API の形**まで。

- ホワイトラベルの実現方式: **Payload 型のファイルパス間接参照（Import Map）方式**。
- 未決事項: 管理画面のレイアウト構造まで案件ごとに変えるか。そこまでやるなら
  3階層オーバーライドが要り、難易度が一段上がる。

## 理由

Medusa / Strapi / Saleor で、開発元自身がフォーク運用の破綻を認めている実例がある。
ロゴ変更すらフォークが要る構造になると、上流に追従できなくなる。

## 影響

- Directus のコードを直接取り込む・改変するのではなく、API の形（エンドポイント設計・
  コレクション/フィールド/リレーションのモデル等）だけを参考に自前実装する方針が
  `apps/studio` の設計全体に及ぶ。
- ホワイトラベル方式の詳細（Import Map の具体設計）は本ファイルの決定時点では未実装・
  未確認。実装が進んだ段階で `knowledge/areas/` 側に反映する。

## 🚨 ライセンス（2026-08-17 に実物を引いた）

> 由来: 堀池さん「**directus をクローンしてソースコードを解析して。…全て directus を見習う**」。
> 着手前にライセンスを確かめた。**この決定にライセンスの記述は 1 行も無かった**（実測 0 件）。

```
🚨 **BSL ではない。** クローンした実物（ルートの `license`・117 行）:
   名前 … **Monospace Sustainable Core License, Version 1.0**／略称 **`MSCL-1.0-GPL`**
   🟢 対照 `app/license`（管理画面側）… **ルートと同一**（`cmp` で確認）
```

**条項（要点）:**

```
許諾 …… use / copy / modify / 派生物の作成 / 再配布 を **Permitted Purpose** の範囲で認める
Permitted Purpose … **Competing Use 以外のすべて**
Competing Use … Licensor が課金している「**そのソフトウェア自体**」の商用提供と
                競合する形で第三者に提供すること
制限 …… ライセンスキーの機能を回避・無効化しない
🚨 再配布 … **条項は、コピー・改変・派生物のすべてに及ぶ**
将来 …… 🚨 **各版の公開から 4 年後に GPL-3.0 でも使えるようになる**（irrevocable）
```

### ✅ この家の判断: **コードは 1 行も写さない**

```
✅ **読み取って学ぶ** … 可（UI の考え方・情報の並べ方・操作の流れ・画面の分け方）
🚫 **写す** … しない
   理由 … 私たちは社内向けなので Permitted Purpose には収まりそうだが、
          🚨 **条項が派生物に及ぶ**＝ **写した部分を含む OhMyCMS が MSCL に縛られる**と読める
   ＝ 🚨 **これは技術の判断ではなく事業判断**なので、勝手に踏み越えない
🚨 写したくなったら、**そこで止めて司令塔へ聞く**
```

🚨 **この節は法的な結論ではない。** 読んだのは **117 行のテキストだけ**で、
**弁護士の確認を受けていない**。**判断が要る場面では堀池さんに上げること。**

## 根拠

- `knowledge-historys/ai-native-cms/source/03-v1-scope.md:125-166`
- `.temp/2026-08-13/decisions-log.md` D-005
- **Directus のルート `license`（2026-08-17 に `git clone --depth 1` して読んだもの・117 行）**
