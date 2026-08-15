# 右パネル ⑤ ログ・履歴 — 設計（範囲 B: ログを本物にする）

> security ペイン設計・2026-08-15。司令塔決定: **B を今回の範囲。C（フル版管理・復元）は別トラックで設計から。**
> これは実装仕様（Codex/Sonnet へ渡す素）。**検証は security（委譲不可）。**

## 0. 🚨 Codex/Sonnet はまず規約を読む（規約パス一覧）

- `AGENTS.md`（§3.5 サーバ側で拒否 / §3.6 lib に next 非依存 / §3.8 i18n 必須・リテラル禁止 / §4 検証の掟）
- `knowledge/decisions/no-nested-surfaces.md`（面は1段まで）
- `knowledge/areas/permissions.md` + `apps/studio/lib/permissions/resolve.ts`（行フィルタの強制点）
- `.claude/security-charter.md`（漏洩・認可の観点）
- 本ファイル（この設計）

## 1. 範囲（B）

**やる**: 記事の作成/更新/削除を `directus_activity` に記録し、右パネルに「そのページ分の活動」を表示する。
**やらない（C・別トラック）**: 版スナップショット（`directus_revisions`）・版の閲覧・**復元（上書き）**。
→ 🚨 ただし C の security 設計フラグ（§4 の 1・2）は**このドキュメントに残す**（引き継ぎで消さないため）。

## 2. 実測した現実（着手前提）

- `directus_activity` テーブルは**存在する**が、**記事の保存経路 `lib/items/service.ts` は書いていない**（grep=0。書くのは schema 変更のみ）。
- 読む API が無い。「ログ・履歴」権限アクションが無い（今は create/read/update/delete の4つ）。

## 3. 実装（3 パート）

### 3-1. 書込（`lib/items/service.ts` の3関数に足す）

対象: `createItems`(:970) / `updateItem`(:1018) / `deleteItem`(:1065)。
成功して commit する**同一トランザクション内**で `directus_activity` に1行 insert する。

`directus_activity` の実カラム（実測。この形で書く）:
| 列 | 入れる値 |
|---|---|
| `action` | `"create"` / `"update"` / `"delete"` |
| `user` | 人間なら actor の userId、エージェントなら null |
| `actor_type` / `actor_id` | `"human"`/`"agent"` と対応 ID（既存の actor 概念に合わせる） |
| `collection` | 対象コレクション名 |
| `item` | 対象の主キー（複数作成は行ごとに1行） |
| `ip` / `user_agent` | リクエストから（`items/service.ts` は素の値で受け取る。**next/* を import しない**＝§3.6。route 側で渡す） |
| `timestamp` | default now |

🚨 **トランザクション整合**: 記事の書込が成功したときだけログを積む（記事が失敗したのにログだけ残る/その逆を作らない）。
🚨 **排他**: `items/service.ts` は**全ペインが触る共有ファイル**。着手前に「いま入れます」を hrdr で宣言し、`--only` でコミット。

### 3-2. 読取 API

`GET /api/activity?collection=<name>&item=<id>`（命名は既存 route 規約に合わせる）。
- 🚨 **認可はサーバ側で**（§3.5）。**新設する「ログ・履歴」アクション**で gate（§3-4）。`resolve.ts` を通し、
  **権限の無いコレクションの活動は 403/空**にする（app 層だけに頼らない）。
- 返すのは表示用の最小値（who=表示名 or 匿名 / when / action / item）。**IP・user_agent はクライアントへ出さない**（運用者のみ）。
- ページング（上限つき。§4「全件取得を書かない」）。

### 3-3. 権限アクション「ログ・履歴」を追加

`app/api/permissions/route.ts` の `action: z.enum(["create","read","update","delete"])` に **`"log"`（または `"history"`）を足す**。
原典どおり各コレクションに「ログ・履歴」権限を持たせ、読取（と将来の復元）をこれで gate。
🚨 enum を1箇所で足すだけでなく、**それを消費する判定側**（resolve/permissions-service）も同じ語で見ているか確認（2箇所に割れると腐る）。

### 3-4. パネル UI（`components/admin/panel-logs.tsx` = 別ファイル）

- `page-info-panel.tsx` の ⑤ AccordionContent の `t("todo")` を `<PanelLogs .../>` に**差替え1行だけ**。
  🚨 **その1行を入れる前に hrdr で「いま入れます」宣言**（③④と同一ファイル・宣言順）。
- 面は**1段まで**（パネル内でカードを積まない）。§ no-nested-surfaces。
- 🚨 **右パネルは幅が狭い**。横に長い行は**自分のコンテナで横スクロール**。SP は全画面ダイアログ・タップ44px。
- 🚨 **空状態を2種類に分ける**（司令塔要求）:
  - 「まだ記録がありません」（正常・履歴ゼロ） … 200 かつ 0 件
  - 「読み込めませんでした」（失敗） … API エラー
  → **「機能した 0」と「動く 0」を画面で区別**する。同じ見た目にしない。
- 文言は**リテラル禁止（英語も）**。`i18n/messages/{ja,en}/panel.json` に両方。新名前空間なら `i18n/messages.ts` に登録。

## 4. 🚨 security 設計フラグ（5つ・C 分割で消さない）

1. **【C 引継ぎ】revisions は記事データの複製。** C で版スナップショットを積むと、記事の秘密/PII が
   **版という新しいコピー**になる（`secrets-storage-by-recoverability` の「バックアップに写る」と同型）。
   **保持期間・アクセス制御・ダンプ時の扱い**を C の設計で必ず決める。**B の activity には記事本文を入れない**（誰が何をしたかのメタのみ）ことで、B の段階では複製を作らない。
2. **【C 引継ぎ】復元（上書き）は特権的な書込。** C の復元 API は `updateItem` と**同じ行フィルタ（`resolve.ts`）を必ず通す**。
   🚨 すり抜けると**編集できないはずの記事を旧版で上書きできる**（v1 攻撃演習「リレーション経由/直接」と同型）。復元も「ログ・履歴」でなく**update 権限**で gate すべきか、C で決める。
3. **【B で実装】「ログ・履歴」を権限アクションに追加**し、読取をそれで gate（§3-3）。
   🚨 **ただし collection 単位までしか守れていない（→ フラグ5）。**
4. **【B で守る】保存経路は共有ファイル**（items/service.ts）→ 排他（宣言順・`--only`）。
5. **【B の穴・2026-08-15 security 実測】gate は `resolution.rowFilter` を適用していない。**
   `GET /api/activity` は `resolvePermission(actor, collection, "log").allowed` しか見ず、
   rowFilter を無視して**そのコレクションの全 item の活動を返す**（`route.ts:63-75`）。
   → **行フィルタ付き "log" を配ると、読めない item の活動（item_id / action / 時刻 / 編集者）が漏れる**。
   実測（隔離した sec_probe_ で resolvePermission を実呼び）: rowFilter=`{owner:{_eq:"keepme"}}` 非 null /
   route 相当=**2 件** / 正=**1 件** / `leaked_item2=true`。
   🚨 現状は **latent**（`directus_permissions`=0 行＝フィルタ付き "log" 未配布なので**アクティブな漏洩は無い**。
   `filtered_log=0` は「安全な 0」でなく「まだ出番が来ていない 0」）。
   **直し方**: `activity.item` を対象コレクションの実テーブルへ結合し `resolution.rowFilter` を適用（item READ と同じ強制。`lib/items/filter`）。
   番人が無い（このリポジトリは `*.test.ts`=0）ので、直すなら受入ハーネスに
   「ip/user_agent 非露出・"log" 無しで 403・フィルタ付き log で no-leak」を足す。
   **状態: 司令塔の a(既知の制限として文書化＋番人化) / b(先回りで直す) 判断待ち。権限機能にフィルタ運用が入る前に閉じる。**

## 5. 受入基準（🚨 security が実測。委譲不可）

- 🟢 記事を**作成/更新/削除**して `directus_activity` に **3 行**積まれ、**誰が・いつ・何を・どのコレクション/ID** が
  入っていることを**行を読み返して**確認（0 件が正常か未実行かを区別）。
- 🔴 **RED 対照**: 書込を外すと **0 行**になることを確認（積まれていることの対照。「動く 0」を排除）。
- 🟢 パネルに**そのページ分だけ**出る。🚨 **別コレクションの活動が混ざらない**対照（他コレクションを編集 → 出ないこと）。
- 🟢 **権限の無い利用者には出ない**（③のアクションで拒否されること。admin 対照で「本来は見える」も併記）。
  🚨 **ただしこの受入は collection 単位まで。** 行フィルタ付き "log" で読めない item の活動が漏れる件は
  §4 フラグ5 の既知の穴（実測済み・a/b 判断待ち）で、この受入では**まだ塞いでいない**（レビューする人はここを混同しない）。
- 🟢 **空状態の2種類**（履歴なし / 読込失敗）が**画面で区別**できる。
- `bun run lint` と i18n 検査（`check-i18n-*.mjs`）が通る。

## 6. 委譲ハンドオーバー（Codex/Sonnet へ）

- **前提**: `directus_activity` テーブルは存在（migration 済み）。actor 概念は既存（human/agent）。
- **後続**: C（版・復元）は別トラック。B はその土台（活動が溜まる）を作る。
- **排他**: `items/service.ts` と `page-info-panel.tsx` は共有。着手前に hrdr 宣言、`git commit --only <path>`。
- **影響範囲**: items 保存経路（全書込に1 insert 増）・新 API 1本・新 UI 1ファイル・permissions enum 1語・panel.json。
- **禁止**: `lib/` に next/* を import（§3.6）。リテラル文言（§3.8）。面の入れ子。IP/UA をクライアントへ返す。`git add`→`commit`（`--only` を使う）。
- **受入基準**: §5。**security が実測して緑にするまで完了ではない。**
