---
type: decision
title: i18n はライブラリを使わず自前実装にする
description: next-intl は next.config.ts の編集が必須で、URL にロケールを出さない設計では主機能も不要だったため、依存追加ゼロの自前実装を選んだ。
tags: [i18n, frontend, dependencies]
status: active
generated:
  by: rag-okf
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://apps/studio/i18n/config.ts"
  - resource: "repo://apps/studio/package.json"
stale_after: 2027-02-13
x_rag_okf:
  id: decisions/i18n-own-implementation
  authorship: agent
---

# i18n はライブラリを使わず自前実装にする

## 背景

[[i18n-required]] で「全UI文言を辞書化し、日本語と英語に対応する」ことを必須と決めた。
実装にあたり、App Router 向けの定番である `next-intl` を第一候補として検討した。

このプロジェクトは複数のトラックが同じ作業ツリーを並列で触っており、
`apps/studio/next.config.ts` の編集権はインフラ担当のトラックにあった。

## 決定

> 基準日: 2026-08-13

**`next-intl` を採用せず、依存追加ゼロの自前実装にする。**

- 辞書は `apps/studio/i18n/messages/{ja,en}.json`（JSON。正本は JSON という [[json-as-source-of-truth]] と整合）
- ロケールの決定順は **Cookie → `Accept-Language` → 環境変数 `OHMYCMS_DEFAULT_LOCALE`（既定 `ja`）**
- **URL にロケールを出さない**（`/ja/admin` のような形にしない）
- 整合性は検査スクリプトで担保する
  - ハードコード検出（`.tsx` に日本語・英語のリテラルが残っていないか）
  - キー集合の差分検出（`ja.json` と `en.json` のキーが完全一致するか）

実測: 196 キー / 13 名前空間 / ハードコード 0 件 / キー差分 0 件。

## 理由

1. **`next-intl` のサーバ側 API は `next.config.ts` の編集なしには成立しない。**
   `next-intl` 4.13.6 を隔離インストールして `plugin/getNextConfig.js` を読んだ結果、
   `createNextIntlPlugin()` の実体は `next.config.ts` へ
   `turbopack.resolveAlias['next-intl/config']`（webpack 側は `resolve.alias`）を注入するだけのものだった。
   プラグイン無しで `next-intl/config` を解決すると
   `"Couldn't find next-intl config file"` を throw するスタブが返る。
   → `next.config.ts` の編集権が別トラックにある構成では採用できない。

2. **URL にロケールを出さない設計では、`next-intl` の主機能が不要。**
   `next-intl` の目玉は routing と middleware によるロケール解決だが、
   管理画面ではロケールを URL に出さないと決めている（理由は下記）ため、そもそも要らない。

3. **管理画面の URL にロケールを出さない理由**:
   管理画面はログインした本人のための画面で、共有 URL として言語を持つ必要が薄い。
   さらに、**管理画面のパスを変えると Cookie の path と噛み合わなくなる事故**がある
   （Strapi で管理パスを変えたら Cookie path が追随せず 401 ループした実例）。

4. **依存を増やすとルートの `pnpm-lock.yaml` を書き換えることになり、並列作業と衝突する。**

## 影響

- **良い面**: 実行時依存ゼロ。文言の解決が自前なので、辞書の持ち方・フォールバックを自由に設計できる。
  「全文言が自前の辞書にある」という自作 CMS の最大の利得をそのまま実現できる。
- **引き受けたコスト**: 複数形（plural）や性別などの ICU メッセージ構文は自前では持たない。
- **将来 ICU が必要になったら**: `use-intl`（`next-intl` のコアで、同梱されている）が
  **`next.config.ts` の編集を必要としない**ので、そこへ移るのが最短。
  この時点で判断を見直すこと。

## 根拠

- `next-intl` 4.13.6 の `plugin/getNextConfig.js` および `dist/esm/*/config.js` を実際に読んだ結果（2026-08-13 実測）
- Strapi で管理パス変更時に Cookie path が追随せず 401 ループした実例
  （前身プロジェクトの検証記録。アーカイブは共有リポジトリには含めていない）
- 実測値: 196 キー / 13 名前空間 / ハードコード検出 0 件 / `ja`・`en` のキー差分 0 件
- ロケール決定順の実測（4通り）:
  - 環境変数 未設定 + Cookie 無 + `Accept-Language` 無 → `ja`
  - `OHMYCMS_DEFAULT_LOCALE=en` + Cookie 無 + `Accept-Language` 無 → `en`
  - `OHMYCMS_DEFAULT_LOCALE=en` + `Accept-Language: ja` → `ja`（ヘッダが環境変数に勝つ）
  - `OHMYCMS_DEFAULT_LOCALE=en` + `Cookie=ja` → `ja`（Cookie が最優先）

## 関連

[[i18n-required]] / [[json-as-source-of-truth]] / [[use-proxy-not-middleware]]
