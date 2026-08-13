---
type: area
title: 受入ハーネス（acceptance）
description: pnpm acceptance で v0.9 MVP の受入基準9項目を機械判定するハーネス。依存0本・肯定形と否定形を必ずセット・未実装はSKIPでPASSにしない、が設計原則。
tags: [acceptance, testing, permissions, ci]
status: active
generated:
  by: agent
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://acceptance/run.mjs"
  - resource: "repo://acceptance/lib/result.mjs"
  - resource: "repo://acceptance/checks/08-row-permission.mjs"
  - resource: "repo://acceptance/manual-3.md"
  - resource: "repo://acceptance/compose.acceptance.yml"
  - resource: "repo://.temp/2026-08-13/specs/00-phase-plan-and-contract.md"
  - resource: "repo://.temp/2026-08-13/specs/F6-design-system-x.md"
stale_after: 2027-02-13
x_rag_okf:
  id: areas/acceptance
  source_commit: 1603f6a
  authorship: agent
---

# 受入ハーネス（acceptance）

`acceptance/`（2,926行、2026-08-13時点）は、v0.9 MVP の完了条件（`.temp/2026-08-13/specs/00-phase-plan-and-contract.md`
§5 の受入基準9項目）を **`pnpm acceptance` 一発で機械判定する**ハーネス。旧PJ izukurasan の `SPEC.md` の
受入基準を下敷きにしている。

## 何をするものか

```bash
pnpm acceptance                  # docker を触らずに判定できるものだけ実行
pnpm acceptance --docker         # docker compose down -v → up も含めて実行（🚨 全ペインを止めてから）
pnpm --silent acceptance --json  # 機械可読な出力（CI 用）
pnpm acceptance --only 7,8       # 指定した項目だけ
pnpm acceptance --red 8          # RED確認: その項目をわざと壊してFAILになることを見る
```

判定は **PASS / FAIL / SKIP / BLOCKED / MANUAL** の5種類（`acceptance/lib/result.mjs`）。
**PASS 以外が1つでもあれば未達（exit≠0）。** SKIP も MANUAL も「通った」扱いにしない。

## 受入基準 9 項目

`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §5 が正。

| # | 基準 | 検証方法 |
|---|---|---|
| 1 | `docker compose up` だけで DB もアプリも起動し `/api/health` が200 | クリーン(volume削除後)から実測 |
| 2 | 環境変数だけで設定が完結する（`.env.example` の値だけで起動できる） | 実測 |
| 3 | ブラウザだけで「コレクション作成→フィールド追加→権限設定→アイテム登録→ファイル添付」が完結 | 手動（curl では不可） |
| 4 | CLI で同じことができる | 実行して実測 |
| 5 | MCP 経由で同じデータにアクセスでき、権限が同じように効く | 権限の無いデータに MCP から触って拒否されることを実測 |
| 6 | 管理者トークンで MCP 接続すると設定も編集できる | 実測 |
| 7 | UI が日本語（英語にも切替）。ハードコードされた文言が無い | 辞書を切り替えて表示が変わることを実測 |
| 8 | 他人の行に ID 直打ちしても 403/404（フィルタで隠すだけになっていない） | 別ユーザーのトークンで実測 |
| 9 | SVG/HTML をアップして配信しても script が実行されない（attachment 強制） | 実測 |

## ディレクトリ構成

| パス | 責務 |
|---|---|
| `run.mjs` | エントリポイント。引数パース・`studio-acc` の自動起動・9項目の実行・集計・レポート出力 |
| `checks/01-docker-up.mjs` `02-env-only.mjs` | 基準1・2。`--docker` 時のみ実行 |
| `checks/03-06-pending.mjs` | 基準3（→ MANUAL を返す） |
| `checks/04-cli.mjs` | 基準4（CLI） |
| `checks/05-06-mcp.mjs` | 基準5・6（MCP。穴Eの回帰テストもここに同居） |
| `checks/07-i18n.mjs` | 基準7 |
| `checks/08-row-permission.mjs` | 基準8。肯定形→否定形の順序をコードで固定した実装（後述） |
| `checks/09-svg-attachment.mjs` | 基準9 |
| `lib/http.mjs` | `Session`（Cookie保持の HTTP クライアント）・`probeStatus`・`waitForHealth` |
| `lib/mcp.mjs` | MCP クライアントのヘルパ |
| `lib/proc.mjs` | `docker compose` 呼び出し・`REPO_ROOT`・稼働中コンテナの検出 |
| `lib/report.mjs` | テーブル/JSON 出力の整形 |
| `lib/result.mjs` | `STATUS` 定数・`result()` / `assertion()` / `statusFromAssertions()` |
| `compose.acceptance.yml` | 受入ハーネス専用の `studio-acc`（開発ビルド）サービス定義 |
| `manual-3.md` | 基準3の手動手順書（合格の見え方を各ステップに明記） |

## 設計の原則

- **依存 0 本。** Node 標準機能のみ（ブラウザ自動操作ライブラリも入れない）。理由: 依存とメンテが増えると
  「ハーネス自体の面倒を見る」ことが MVP の判定より優先されてしまうため
- **肯定形と否定形を必ずセット。** `lib/result.mjs` の `statusFromAssertions` は、`assertion` 配列に
  `positive` と `negative` のどちらかが1つも無ければ**それだけで FAIL** にする（ハーネス側の不備として扱う）。
  理由: 「A に B の行が見えない」は B の行が存在しなければ自明に真になるため、否定形だけのチェックは
  何も検証していないのと同じになりうる
- **未実装は SKIP で PASS にしない。** `STATUS.SKIP` のコメントに明記: 「実装がまだ無い（packages/cli,
  packages/mcp 等）。PASS にしてはいけない」
- **PASS 以外が1つでもあれば未達（exit≠0）。** CI がこの exit code をそのまま使える
- **RED 確認（`--red`）。** 検証対象のポリシーをわざと壊して FAIL になることを確かめる仕組みが
  `checks/08-row-permission.mjs` に埋め込まれている（`admin_access` を意図的に `true` にする）。
  「PASS しか出ないハーネスは何も検証していない」という考え方から、誰でも赤を再現できる入口を残してある

### 基準8 の実装に見る「肯定形→否定形」の型

`checks/08-row-permission.mjs` は次の順で assertion を積む（この順序自体がドキュメント）:

1. 管理者から B の行が見える（行が実在することの裏取り）
2. A が自分の行を GET できる（A の権限が生きていることの裏取り）
3. A の一覧が1件以上ある（0件なら「他人の行が無い」は自明）
4. ここから初めて否定形（A から B の GET/PATCH/DELETE、filter 経由、owner 書き換え、認証なし、
   一般ユーザーの管理API叩き、など9種類）

## `--docker` は F9 の総合受入のときだけ

`--docker` は `docker compose down -v → up` を行う。`down -v` は**共有 DB ボリューム
（`ohmycms_ohmycms-db-data`）を消す**ため、他ペイン・他トラックが検証用に作ったデータ
（ユーザー・ポリシー・権限行・ファイル・エージェントトークン等）も巻き添えで消える。

`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` の運用ルール:

- `--docker` を走らせてよいのは **F9（総合受入検証）のときだけ**
- それまで受入基準1・2は **BLOCKED のままでよい**（未達ではなく「まだ判定していない」扱い）
- F9 の直前に司令塔が全トラックへ「DB を消します」と予告する

## ポートの割り当て

**同じにすると自分の足を踏む。** 実際に一度、基準1の `up` が studio-acc の3999と衝突して FAIL した
（2026-08-13、`run.mjs` 冒頭のコメントに実測記録あり）。

| 用途 | ポート |
|---|---|
| 受入基準1・2 が立てる**本番構成スタック**（`--docker` 時） | **3998**（`DOCKER_PORT`） |
| **studio-acc**（受入基準8・9 が使う開発ビルド。ハーネスが自動起動） | **3999**（`DEV_PORT`） |
| ホストの `pnpm dev`（全トラック共用・1本のみ） | 3000 |
| Postgres | 5436 |

studio-acc が開発ビルドである理由: 本番ビルドは `next build` が `NODE_ENV` をインライン展開するため
`dev-login` の分岐ごと消える。基準8・9はログイン済みセッションを3つ（管理者・A・B）使い分ける必要があり、
本番ビルドでは検証できない。Docker コンテナ内でも `dev-login` は使えない（`.env` を `ALLOW_DEV_LOGIN=true`
にしても本番ビルドなら404）ため、権限検証をコンテナで行う場合は `psql` で管理者1行+セッション1行だけ
INSERT し、そこから先はすべて API 経由で操作する（`00-phase-plan-and-contract.md` §2 のブートストラップ手順）。

## 現在の結果

2026-08-13 実測（`--docker` 無し）:

| # | 結果 |
|---|---|
| 1・2 | **BLOCKED**（`--docker` を付けていないため未実行。設計どおり） |
| 3 | **MANUAL** |
| 4〜9 | **PASS** |

`.temp/2026-08-13/specs/00-phase-plan-and-contract.md` の想定では、`--docker` を付けたF9相当の
総合実行で基準1・2も PASS になり、**8 PASS / 1 MANUAL（基準3）** が完了状態になる。

これは実際に達成済み: `.temp/2026-08-13/specs/F6-design-system-x.md` 冒頭（F6仕様の前提条件）に
「MVP v0.9 の受入は 8 PASS / 1 MANUAL（`#3` は実ブラウザで通過済み）」と明記されている
（F6はF2の後続フェーズなので、この時点までに `--docker` 込みの総合実行が行われている）。

## 注意点（Gotchas）

- `rm -rf apps/studio/.next` の前に**必ず dev サーバーを落とす**こと。落とさずに消すと Turbopack の
  キャッシュが壊れて500になり、コード起因の500と見分けがつかなくなる（実際に同じセッションで2回踏んだ実績あり）
- ホストの `apps/studio/.next` を触ってよいのは studio 担当トラックのみ。他トラックが本体のビルドを
  確認したいときはコンテナの中で行う
- クリーンビルドの確認は必ず再ビルドしてから。古い成果物を見て偽の緑になる事故が実際に起きている
- `compose.acceptance.yml` は本番構成に持ち込まない専用ファイル。`container_name` を固定した
  `compose.yml` と併用することで、既存の `db` サービスを再利用しつつ別名サービス（`studio-acc`）を
  並行して立てられる（`down -v` はしない）

## 他の領域との関係

- **[[permissions]]**: 基準8・9は権限モデルの回帰テストそのもの。穴C〜Eの再発防止として実装されている
- **[[apps-studio]]**: 検証対象は `apps/studio` の REST API。`acceptance/` 自体は `apps/studio` の外側
  （リポジトリ直下）に置かれた独立ツール

## 根拠

- 実測: `pnpm --silent acceptance --json`（2026-08-13）
- `acceptance/run.mjs`（全文）、`acceptance/lib/result.mjs`（全文）、`acceptance/checks/08-row-permission.mjs`（全文）
- `acceptance/manual-3.md`（基準3の手動手順書）
- `acceptance/compose.acceptance.yml`
- `.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §2（ポート割当・DBの使い捨て・dev-loginの制約）・§5（受入基準9項目）
