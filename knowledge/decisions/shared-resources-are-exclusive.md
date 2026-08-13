---
type: decision
title: 共有資源（受入ハーネス・Docker・node_modules）は同時に1つしか使わない
description: 複数の作業者に「各自で受入ハーネスを打て」と配った結果、2ペインが同時に走ってコンテナとポートを取り合った。共有資源は担当を1つに決め、他は依頼する形にすると決めた。
tags: [acceptance, ci, testing, ops]
status: active
generated:
  by: rag-okf
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://acceptance/run.mjs"
  - resource: "repo://acceptance/lib/proc.mjs"
  - resource: "repo://compose.yml"
stale_after: 2027-02-13
x_rag_okf:
  id: decisions/shared-resources-are-exclusive
  authorship: agent
---

# 共有資源（受入ハーネス・Docker・node_modules）は同時に1つしか使わない

## 背景

Bun 移行（`bun install`）で `node_modules` が丸ごと入れ替わった直後、司令塔が全ペインへ
**「各自が自分の作業を進める前に `bun run acceptance` を打って 8 PASS を確認せよ」**と配った。

意図は良かった（**先に基準線を取らないと、後から出るエラーが自分の変更のせいか移行のせいか
区別できない**）。しかし**配り方が間違っていた**。

実測: **sdk と ui の2ペインが同時にハーネスを走らせていた。**

ハーネスは Docker のコンテナとポートを掴む。同時に走ると:

- コンテナ名・ポートを取り合って**両方が誤って FAIL する**
- 片方が `down` させたスタックを、もう片方が「起動していない」と判定する

🚨 **これは「誤った RED」を生む。** 今日3回踏んだ「否定形が空振りする」形の4つ目。
しかも**原因がハーネスの外にある**ので、実装を疑って時間を溶かす。

同種の事故を既に2回起こしている:

| 事故 | 症状 | 真因 |
|---|---|---|
| ポート競合 | 本番スタックと `studio-acc` が取り合う | 両方が同じポートを使っていた（→ `DOCKER_PORT=3998` に分離） |
| 自分を数える | ハーネスが必ず FAIL する | 自分自身のコンテナを数えていた（→ `ohmycms-studio-acc` を除外） |

**3回とも「共有の資源を、複数の主体が同時に触った」**という同じ形。

## 決定

> 基準日: 2026-08-13

**共有資源は「担当を1つに決め、他は依頼する」形にする。各自で打たない。**

| 資源 | 誰が触るか | 他の人は |
|---|---|---|
| **受入ハーネス**（`bun run acceptance`） | **1ペインだけ**（その時の受入担当） | 結果をもらう。知りたければ依頼する |
| **Docker**（`docker compose` の上げ下げ） | **1ペインだけ**（基盤担当） | 起動済みのものを叩くのは可 |
| **`node_modules`**（`install`） | **司令塔が窓を仕切る** | 窓の間は `install`/`build`/`lint`/`tsc` を打たない |
| ホストの `.next` | **1ペインだけ** | 触らない |

**同時でも安全なもの**（排他にしない）: `lint` / `tsc` / 単体テスト / ブラウザでの目視 /
既に起動しているサーバへの HTTP リクエスト。

### 🚨 検証用コンテナは、1つずつ別のプロジェクト名にする（2026-08-14 追記）

> 基準日: 2026-08-14

**`docker compose -p <名前>` の名前を、検証用コンテナごとに分ける**（`ohmycms-<用途>`）。
**共通の名前に集めない。**

    ❌ minio も keycloak も  -p ohmycms-verify
    ✅ minio → -p ohmycms-verify  /  keycloak → -p ohmycms-saml

**なぜ。** compose は「そのプロジェクトに属するのに、いま渡されたファイルに書いていない」
コンテナを **orphan** と呼び、`--remove-orphans` を付けると**消す**。
名前を共有していると、**互いに相手を orphan として消せる状態**になる。

実際に起きたこと: SAML のテスト IdP（Keycloak）を **`-p ohmycms-verify`** で立てたところ、
compose が起動時にこう警告した。

    Found orphan containers ([ohmycms-minio-init ohmycms-minio]) for this project.
    ... you can run this command with the --remove-orphans flag to clean it up.

**storage の minio が同じプロジェクト名を先に使っていた。**
🚨 **どちらかが `--remove-orphans` を付けた瞬間に、相手の検証環境が消える。**
（このリポジトリでは 2026-08-13 に**実際に minio が消える事故**が起きている。
そのときの対策が「別プロジェクト名にする」だったが、**「別」の粒度を決めていなかった**ため、
検証用が1つの名前に集まってしまった。）

**判断の基準**: プロジェクト名は「**その compose ファイルが上げ下げしてよい範囲**」を宣言するもの。
**1ファイル1プロジェクト名**にしておけば、`down` や `--remove-orphans` の影響が
そのファイルの中に閉じる。

**移すときは `--remove-orphans` を付けない**（付けると、移す前の同居相手が巻き込まれる）。
移し終えたら **移動前後でコンテナ一覧を突き合わせる**。

    docker ps --format '{{.Names}}' | sort > /tmp/before.txt
    …移動…
    docker ps --format '{{.Names}}' | sort | diff /tmp/before.txt -

🚨 **「消していないつもり」を、消していない証拠に置き換える。** 実測が無いと、
消えたことに数時間気づかない（相手のペインが次に使うまで分からない）。

## 理由

**「各自で確認せよ」は、確認対象が各自のものであるときにだけ正しい。**
ハーネスと Docker は**プロセスとポートという1つしかない実体**を掴むので、
「各自で」と言った瞬間に競合する。

判定を1箇所に集約しても情報は失われない。**結果を配ればよい**。
むしろ**判定が1箇所にある方が、食い違いが起きない**。

## 影響

- 司令塔は「全員に○○を打たせる」形の指示を出す前に、**その○○が共有資源を掴むか**を確認する
- 作業者は、共有資源を掴むコマンドを打つ前に**司令塔へ一報する**
- 🚨 **これは作業者の落ち度ではない。** 上の事故は**司令塔の配り方**が原因だった。
  作業者は指示どおりに動いただけなので、責める対象を間違えないこと

## 教訓

- **「各自で確認して」と言う前に、確認手段が共有資源かを見る。**
  共有資源なら、担当を決めて結果を配る形にする
- **誤った RED は、誤った GREEN と同じくらい危険。**
  実装は正しいのに落ちるので、直す必要のないものを直しはじめる
- 排他が要る資源は**契約に書く**。口頭の合意は次の担当者に伝わらない

## 根拠

- 発生: 2026-08-13、Bun 移行の窓が閉じた直後
- 過去の同型事故: `acceptance/run.mjs` の `DOCKER_PORT = 3998` /
  `acceptance/lib/proc.mjs` の `ohmycms-studio-acc` 除外（どちらもこの形の修正跡）

## 関連

[[relation-permission-boundary]] / [[no-nested-surfaces]]
