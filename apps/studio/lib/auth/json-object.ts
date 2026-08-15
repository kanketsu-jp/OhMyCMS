/**
 * `json` 列（`directus_users.auth_data` 等）を、**混ぜられる形**へ読み直す。
 *
 * 🚨 **なぜ要るか**: `auth_data` は **複数の書き手が共有する列**で、
 *    `allowlist.ts` が `saml_allowed_*` を、Google の経路が `picture` を書く。
 *    丸ごと代入すると**他人の記録が消える**ので、**読んでから混ぜる**しかない。
 *    列の型が `json`（`jsonb` ではない）なので、SQL の `||` は使えない（実測 2026-08-15）。
 *
 * 🚨 **ドライバによって、文字列で返ることもオブジェクトで返ることもある。**
 *    片方だけ扱うと、**環境によって静かに `{}` になり、他人の記録を消す**。
 *    ここは何も import しない（どこからでも読めるように）。
 *
 * 🚨 **`lib/auth/saml/` の下に置かないこと。** `lib/auth/sessions.ts` も同じ処理を要るが、
 *    **セッションは SAML ではない**。SAML の名前空間の下に置くと、
 *    **関係の無い側が SAML を import する**ことになる（auth の指摘・2026-08-15）。
 *    2026-08-15 時点で、同じ処理が **3 箇所**にあった
 *    （`sessions.ts` / `saml/allowlist.ts` / ここ）。**ここへ寄せて 1 つにする。**
 *
 * 🚨 **これは競合を解かない。** 同時に2人が読んで書けば、後の人が勝つ。
 *    いまは「ログイン時に自分の行を更新する」だけなので実害が無いが、
 *    **列を jsonb にして `||` で混ぜるのが本来**（migration が要るので、今日はやらない）。
 */
export function asJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asJsonObject(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  // 🚨 **コピーを返す。元の参照を返さない**（auth の判断・2026-08-15）。
  //    いまの呼び出し方（`{ ...asJsonObject(x), newKey }`）では**どちらでも同じ結果**なので、
  //    差が見えない。**見えないまま参照を返す形にしておくと、
  //    「戻り値を書き換える呼び出し元」が1つ現れた日に、DB から読んだ行を直接壊す。**
  //    コピーなら、その日が来ても壊れない。費用はほぼゼロ。
  return { ...(value as Record<string, unknown>) };
}
