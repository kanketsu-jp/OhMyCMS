---
type: decision
title: v0.9 時点で堀池が決めた 6 件
description: ライセンス・配布形態・認可の強制点・ホワイトラベルの範囲・rag-okf の配布・旧プロジェクトの扱いについて、2026-08-13 に確定した回答。
tags: [scope, licensing, permissions, whitelabel]
status: active
generated:
  by: rag-okf
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://knowledge/decisions/two-tier-auth.md"
  - resource: "repo://knowledge/decisions/no-directus-fork.md"
stale_after: 2027-02-13
x_rag_okf:
  id: decisions/v09-open-questions-answered
  authorship: agent
---

# v0.9 時点で堀池が決めた 6 件

## 背景

v0.9 MVP を作る過程で、**司令塔では決められない論点が 6 件**出た。
設計ノート（Artifact）にまとめて提示し、2026-08-13 に全件の回答を得た。

## 決定

> 基準日: 2026-08-13

| # | 論点 | 決定 |
|---|---|---|
| 1 | OhMyCMS 自体のライセンス | **いまは決めず、未定のまま進める** |
| 2 | Docker イメージを顧客へ配布するか | **自社で運用するだけ**（SaaS / 受託運用） |
| 3 | 認可の強制点をアプリ層か DB 層（RLS）か | **v0.9 はアプリ層のみ。MCP 外部開放の前に再検討** |
| 4 | ホワイトラベルをどこまでやるか | **ロゴ・色・サービス名まで（GUI で完結）** |
| 5 | `@kanketsu/rag-okf` を npm 公開するか | **当面このPCだけで使う** |
| 6 | 旧プロジェクト `ai-native-cms` の扱い | **そのまま置いておく（読み取り専用）** |

## 理由と、それぞれが実装に与える影響

### 1. ライセンスは未定のまま

MVP には影響しない。ただし **LICENSE ファイルが無いまま外部へ公開することはできない**ので、
社外へ出す判断が出た時点で再度決める。

### 2. 自社運用のみ（配布しない）

**`sharp` の同梱ネイティブ `@img/sharp-libvips-*` が LGPL-3.0-or-later** である件は、
**配布を伴わないので義務が発生しない**。いまの実装のまま進めてよい。

🚨 **将来「顧客にイメージを渡す」判断が出たら、この決定ごと再検討する。**
最悪の場合、画像処理ライブラリの差し替えが必要になる。

### 3. 認可はアプリ層のみ（v0.9）

DB の RLS は入れない。**認可の穴はアプリ層で塞ぐのが正しい方針**。

🚨 **MCP を外部のエージェントへ開放する段階で必ず再検討する。**
アプリ層だけでは、DB へ直接触られる経路を守れない。

### 4. ホワイトラベルはロゴ・色・サービス名まで

**管理画面のレイアウト構造まで案件ごとに変える方式は採らない。**
Payload 型の 3 階層オーバーライドは不要になり、実装の難易度が一段下がる。

これは実装済みの設定機能（**環境変数は初期値・DB の設定が正**）と一致している。

### 5. rag-okf は当面このPCだけ

**npm へ公開しない。** したがって:

- **CI に `rokf` を入れない**（入らないため）
- Lefthook のナレッジ検査は `command -v rokf` で存在確認してからスキップする実装が正しい（実装済み）
- `knowledge/` 自体はただの Markdown なので、**CLI が無くても clone した人は読める**。
  困るのは索引更新と鮮度検査だけ

### 6. 旧プロジェクトはそのまま置いておく

`~/Develop/Projects/kk2/ai-native-cms` は **コミット 0 本・全ファイル untracked** のまま残す。
**読み取り専用**として全トラックに触らせない規約を維持する。

必要なものは `apps/studio` へ移植済み（TS/TSX 119 本の一致を実測で確認）。
`.reference/directus`（45MB・Directus のクローン）も残るが、これは読解用の資産。

## 根拠

- 2026-08-13 堀池の回答（設計ノート Artifact の回答フォームより。`unanswered` は 0 件）
- `sharp` の LGPL 依存は前身プロジェクトの調査記録
- TS/TSX 119 本の一致は F0 の移植時に実測

## 関連

[[two-tier-auth]] / [[no-directus-fork]] / [[no-organization-table]] / [[cli-mcp-over-rest]]
