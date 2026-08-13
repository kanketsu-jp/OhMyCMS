# 【未決】フィールド名を日本語で付けられるようにする（`directus_fields.translations`）

> 2026-08-14 design。**堀池さんの判断を1つ待っている状態**で夜が明けました。
> 実装仕様は完成しており、**承認が下りればそのまま作業者へ渡せます**。
> 🚨 元は `.temp/design-audit/field-create-directus-spec.md §7-1` にありましたが、
> **`.temp/` は掃除で消える**ので、判断が要る部分をここへ写しました。

---

## 1. いま何が残っているか

堀池（原文）:

> 「**コレクションとそのフィールドの編集は directus をもっと参考にして。**」
> 「**使うのは非技術者なので、そのような表現はしない。**」

この指摘のうち、**「どんな項目か」を先に聞く**部分は入りました（`52f6681` + 置き場所の移動）。
**残っているのは1つだけです:**

```
app/(admin)/... のフィールド追加フォーム
  キー  [ title            ]   ← pattern="[A-Za-z_][A-Za-z0-9_]*"
```

🚨 **非技術者に、いまも英数字のキーを打たせています。**「タイトル」と打てません。

## 2. なぜすぐ直せないか

**表示名を保存する場所がありません。**

`directus_fields` の列（`lib/db/migrations/20260804000700_create_directus_fields.ts` 実測）:

```
special / interface / options / display / display_options / locked / readonly /
hidden / required / sort / width / group / note / conditions / validation / validation_message
```

**`translations` がありません。** Directus は表示名を `directus_fields.translations`
（`[{language, translation}]` の JSON）に持ちます。

| 案 | 内容 | 評価 |
|---|---|---|
| **(a)** | `translations` 列を足す migration を1本 | Directus と同じ形。**design の推し** |
| (b) | `note` を流用 | ❌ `note` は**説明文**。意味が違うものを入れると後で戻せない |
| (c) | 保存せずキーを整形して表示 | ❌ 日本語だと `field_1` →「Field 1」。**問題が消えない** |

## 3. 🚨 判断が要る理由（ここだけが本当のリスク）

- **migration は全員の DB に効きます**（`decisions/migrations-are-shared`）
- **器の形を決めること自体が、後の判断を縛ります**
  （テナントの表を「機能の設計より先に作らない」と決めたのと同じ理屈）

一方で、**リスクを大きく見積もりすぎていた可能性**も併記しておきます:

| | 新機能（例: テーマ切替） | (a) の `translations` |
|---|---|---|
| 新しい機能か | 新機能 | **既に出ている指摘の未完部分** |
| 発明が要るか | 要る | **Directus の列名・形をそのまま使う** |
| 戻せるか | — | **null 許容の json を1列。`down` も書く** |
| 判断が固定されるか | する | **する**（唯一の本当のリスク） |

## 4. 承認された場合に渡す仕様

### (1) migration

`apps/studio/lib/db/migrations/<YYYYMMDDHHMMSS>_add_translations_to_directus_fields.ts`

```ts
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_fields", (table) => {
    table.json("translations");
  });
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_fields", (table) => {
    table.dropColumn("translations");
  });
}
```

🚨 **いちばん危ないのは migration ではありません。**
**`lib/schema/service.ts` の `FIELD_META_COLUMNS`（実測 `:38-50`）に `"translations"` を足し忘れる**と、
**列だけ増えて保存も読み出しもされません**。migration が通ったことで成功と誤認しやすい、
**いちばん分かりにくい失敗**です。

### (2) 入力（`components/admin/field-create-form.tsx`）

```
  表示名        [ タイトル                    ]     ← 🚨 pattern を当てない
   キー: field_1                    （変更）        ← 自動生成。押したときだけ編集できる
```

キーの生成:
1. 表示名が **ASCII を含むなら** snake_case 化（`Product Name` → `product_name`）
2. **含まないなら** `field_1` / `field_2` …（**そのコレクションで衝突しないまで**）
3. **生成したキーは必ず画面に出す。隠さない**
4. 「変更」を押したときだけ編集でき、**そのときだけ** `pattern="[A-Za-z_][A-Za-z0-9_]*"` を当てる

### (3) 表示（読む側）

- 一覧と `item-form.tsx` のラベルで、**`translations` にいまの locale のものがあればそれを、無ければキーを**出す
- 🚨 **解決を1箇所にまとめる**。`lib/schema/` に `fieldLabel(field, locale)` を置き、両方から呼ぶ
  （`resolveFieldInterface()` と同じ形）
- 🚨 **`lib/` に Next.js を持ち込まない**（`AGENTS.md §3.6`）

### (4) 受入基準

```
pnpm migrate && pnpm --filter @ohmycms/studio migrate:rollback && pnpm migrate   # 🚨 往復すること
node scripts/audit-surface-depth.mjs --base http://localhost:3102 --session <token> \
  --paths '/admin/collections/<コレクション>,/admin/collections/<コレクション>/fields/new'
```

- **違反 0 件**（両方のページ）
- 🚨 **表示名に「タイトル」と入れて1つ作り、一覧と編集フォームの両方で「タイトル」と出ること。**
  **期待値は書かない。出た結果をそのまま報告する**
- 🚨 **キーが自動生成になっていること**（日本語がキーに入っていないこと）
- 🚨 **作ったフィールドは測定後に必ず消すこと**（共有 DB）
- `bun run lint` / `check-i18n-hardcoded.mjs` / `check-i18n-keys.mjs` / `check-i18n-usage.mjs`

### (5) やらないこと

- **既存フィールドに表示名を埋める移行を書かない。** 空なら**キーを出す**だけでよい
- 🚨 **`translations` を「多言語の翻訳機能」に育てない。** いまは**表示名を1つ置く器**。
  多言語のフィールド名は別の話

## 5. 却下された場合

③ は `52f6681` までで完了扱いになり、**フィールド名の英数字制約だけが v1 以降に残ります**。
そのときは、この文書に「却下した理由」を1行足して残してください
（**判断の履歴が消えると、同じ議論をもう一度やることになります**）。
