import type { Knex } from "knex";

/**
 * `ohmycms_saml_requests` に「ライブラリが保存した値そのもの」を持たせる。
 *
 * 🚨 **なぜ要るか（実測で踏んだ）。**
 *    `@node-saml/node-saml` の `CacheProvider` は、`getAsync` の戻り値を
 *    **`new Date(値)` で時刻として解釈する**（`saml.js` の SubjectConfirmation 検証）:
 *
 *        const result = await this.cacheProvider.getAsync(subjectInResponseTo);
 *        if (result) {
 *          const createdAt = new Date(result);          // ← 値は「時刻の文字列」でなければならない
 *          if (nowMs < createdAt.getTime() + ...) foundValidInResponseTo = true;
 *        }
 *
 *    ここで**キーを返してしまうと `Invalid Date` → `NaN` → 比較が必ず偽**になり、
 *    正しい応答なのに `SubjectInResponseTo is not valid` で落ちる。
 *    しかも失敗時にライブラリが台帳の行を消すので、あとから調べると
 *    「`InResponseTo` が台帳に無い」という**別の症状**しか見えない。
 *
 *    `created_at` を代わりに返しても**いまは**同じ値になるが、
 *    「ライブラリが渡す値＝作成時刻」という前提に寄りかかることになるので、渡された値を持つ。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_saml_requests", (table) => {
    table.text("value");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ohmycms_saml_requests", (table) => {
    table.dropColumn("value");
  });
}
