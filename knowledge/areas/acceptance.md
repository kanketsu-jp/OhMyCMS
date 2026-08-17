---
type: area
title: 受入ハーネス（acceptance）
description: pnpm acceptance で v0.9 MVP の受入基準を機械判定するハーネス。🚨 実装は 10 本（2026-08-15 に #10「MCP の全ツールを実プロトコルで叩く」が増え、長らく総覧が 9 のままだった）。🚨 2026-08-17 に測り直して 1 PASS / 2 FAIL / 7 BLOCKED（BLOCKED 5 本は dev-login が HTTP 0 の 1 原因）。依存0本・肯定形と否定形を必ずセット・未実装はSKIPでPASSにしない、が設計原則。
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
stale_after: 2027-02-13
x_rag_okf:
  id: areas/acceptance
  source_commit: 1603f6a
  authorship: agent
---

# 受入ハーネス（acceptance）

`acceptance/`（2,926行、2026-08-13時点）は、v0.9 MVP の完了条件（**受入基準 10 項目。下の §「受入基準」に中身が在る**）を **`pnpm acceptance` 一発で機械判定する**ハーネス。旧PJ izukurasan の `SPEC.md` の
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

## 受入基準（**基準は 10 項目・実装は 10 本**）

🚨 **2026-08-17 に、正本の中身をここへ移した**（design）。
それまでは `.temp/2026-08-13/specs/00-phase-plan-and-contract.md` §5 を「正」として参照していたが、
**`.temp/` は `.gitignore` の対象で、追跡ファイルは 0 本**（polish の実測）。
＝ 🚨 **合格条件の正本が、clone した人には読めない場所に在った。**
**受入が終わったかを、手元にツリーが在る人しか判定できない状態だった。**

🚨 **移したのは「合格条件」だけ**（§5 は 72 行）。**移していない範囲を書く**:

```
🟢 移した … 下の 10 項目の表 ＋「**全部が実測で通って初めて完了**」
           （出どころ: **idea.md §v0.9 と、旧 PJ izukurasan の SPEC.md の受入基準を統合**）
🚨 移していない … 「検証コマンドの落とし穴（`find` の除外）」
                「対象が、検証したいコミットのビルドか（**3 回目の同型事故**）」
                「受入基準の穴を塞ぐ注意（否定形は肯定形とセット 等）」
   理由 … 🚨 **これは「合格条件」ではなく「測り方の教訓」**で、
          [[checks-must-declare-blind-spots]] と重なる。**2 箇所目を作らない**
```

🚨 **ハーネスは 10 本走る。** 走る本数は `V09_CHECKS` を引くこと。

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
| 10 | MCP の 22 ツールを、本物のプロトコルで 1 回ずつ叩く | 全ツールを実プロトコルで呼び出し、出力スキーマの不一致が無いことを実測 |

🚨 **この表は 10 項目。ハーネスも 10 本走る。**

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

運用ルール（🚨 **出どころは `.temp/` に在った文書。中身をここへ写した**）:

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

### 🚨 2026-08-17 に測り直した（**こちらが最新**・design）

```
① 既定（v0.9・10 本）… **1 PASS / 2 FAIL / 7 BLOCKED**   591 秒・木 `2443c2c`・`--docker` 無し
🟢 PASS … #7 i18n（ja 857 / en 857・ハードコード 0）
🔴 FAIL … #3 GUI 到達（ナビ 0 本）／ #10 MCP 全ツール（ツール 0 個）
🚨 BLOCKED 7 … #1 #2（`--docker` 未指定・設計どおり）
              #4 #5 #6 #8 #9 … 🚨 **5 本とも同じ理由**（`dev-login が HTTP 0`）

② `--v1`（V1・5 本）… **2 PASS / 3 BLOCKED**   156 秒・木 `752434a`
🟢 PASS … V1-C Tiptap ／ V1-D メール OTP
🚨 BLOCKED … V1-B（保存先が local。s3 でない）／ V1-A（Keycloak :3108 が無い）／
            V1-E（`relation "ohmycms_settings" does not exist`）
```

🚨 **①と②は違う木を測っている**（①の 591 秒の間に他の人がコミットした）。**合算しないこと。**
🚨 **BLOCKED は「未達」ではない。** そして **BLOCKED 5 本は 1 つの原因**なので、
**「5 本落ちている」ではなく「1 つの原因で 5 本が測れていない」**と読む。
🚨 **掃除（90 日で消す）は 1 本も測られていない**——**受入に項目が無い**（v0.9 10 本 / V1 5 本のどちらにも）。

### 🚨 V1（`--v1`）の結果 — **v0.9 とは別に測る**

🚨 **`--v1` を付けないと V1 は 1 本も走らない**（`run.mjs`「v0.9 の記録と混ぜない」）。
**既定の実行では V1 の出現が 0 件になる。** 「全部走らせた」と書く前に、**走った本数を数えること**。

```
2026-08-17 実測 … **3 PASS / 2 BLOCKED**   28 秒・木 `334dc87`・**5 本走った**
🟢 V1-A SAML（SSO） …… PASS（往復＋セッション／改竄・リプレイを弾く）
🟢 V1-C Tiptap ………… PASS
🟢 V1-D メール OTP …… PASS
🚨 V1-B ストレージ …… BLOCKED
   ＝ 🚨 **「台が無い」ではない。台は在り、アプリが S3 へ置けない**
     （`POST /api/files` → **502 `STORAGE_ERROR`** ／ バケットにアプリが置いた鍵 **0 件** ／
      同じ SDK・同じ env で**直に PUT すると 200**。storage の実測）
   🟢 別の計器でも裏取り … `directus_files` が **24 → 24**（**1 件も入っていない**）
🚨 V1-E 初回起動 ……… BLOCKED（使い捨て側で `relation "ohmycms_settings" does not exist`）
🟢 対照 V1-C / V1-D は**別の木（`752434a`）でも同じ PASS**（＝ 台が変わっても動かない）
```

🚨 **BLOCKED を「落ちた」と読まない。** ただし **V1-B は「まだ測っていない」でもない**——
**測ろうとして、アプリ側で止まった。** **この 2 つを混ぜると、直す人が台を疑いに行く。**

🚨 **V1 の状態を書く場所は、ここ 1 箇所だけ**（`areas/v1-scope.md` は 2026-08-17 に
状態を持たない形へ直された。**2 箇所に書くと片方が腐る**）。

### 2026-08-13 実測（**古い。残すのは「達成済み」の出どころを辿るため**）

2026-08-13 実測（`--docker` 無し）:

| # | 結果 |
|---|---|
| 1・2 | **BLOCKED**（`--docker` を付けていないため未実行。設計どおり） |
| 3 | **MANUAL** |
| 4〜9 | **PASS** |

当時の想定では（🚨 **出どころは `.temp/` の文書で、clone した人は読めない**）、`--docker` を付けたF9相当の
総合実行で基準1・2も PASS になり、**8 PASS / 1 MANUAL（基準3）** が完了状態になる。

これは実際に達成済みとされていた（🚨 **根拠も `.temp/` に在り、clone した人は読めない**）: F6 仕様の前提条件に
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
- 🚨 **`.temp/2026-08-13/specs/00-phase-plan-and-contract.md`**（§2 ポート割当・DB の使い捨て・
  dev-login の制約／§5 受入基準 9 項目）… **`.gitignore` 対象。clone した人は読めない**
  🚨 **§5 の中身は上へ移した**（2026-08-17）。**§2 はまだ移していない**——
  ポート割当は [[port-allocation]] に在るが、**DB の使い捨てと dev-login の制約は移していない**
