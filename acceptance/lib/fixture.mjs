/**
 * 検証データの名前を、**実行ごとに一意**にするための接頭辞。
 *
 * ── なぜ要るか（2026-08-13 実測） ──
 * ハーネスを2人が同時に走らせたとき、両方が `acc-xss.html` という**同じ名前**で
 * ファイルを上げ、`acc-admin@example.com` という**同じセッション**を使い、
 * 片方の後片付けがもう片方の「アップロード → ヘッダ確認」の**間に割り込みました**。
 * 結果、実装は正しいのに受入基準9 が FAIL しました（手で再現したら attachment は付いていた）。
 *
 * 🚨 **「同時に走らせない」は運用ルールで、運用ルールは破られます。**
 *    壊れない作りにしておく方が強い。だから名前を実行ごとに分けます。
 *
 * ── 2種類あるのは識別子の制約のため ──
 *   `PREFIX`       … メールアドレス・ファイル名・ポリシー名など、ハイフンが使えるもの
 *   `TABLE_PREFIX` … コレクション名（＝テーブル名）。**ハイフンは使えない**
 *                    実測: {"code":"INVALID_IDENTIFIER","message":"識別子は小文字英字・数字・アンダースコアのみ"}
 *
 * ── 再現性 ──
 * `OHMYCMS_ACCEPTANCE_RUN_ID` を渡すと固定できます。
 * 失敗を再現したいとき、同じ名前でもう一度走らせるために使います。
 */

import { randomUUID } from "node:crypto";

/** 実行ごとの識別子。小文字英数字のみ（テーブル名にも使えるように）。 */
export const RUN_ID = (() => {
  const fromEnv = process.env.OHMYCMS_ACCEPTANCE_RUN_ID?.trim().toLowerCase();
  if (fromEnv && /^[a-z0-9]{1,12}$/.test(fromEnv)) return fromEnv;
  // UUID の先頭6桁で十分（同時に走るのはせいぜい数プロセス）。
  return randomUUID().replace(/-/g, "").slice(0, 6);
})();

/** メール・ファイル名・ポリシー名などに使う接頭辞。例: `acc-3f9a1c-` */
export const PREFIX = `acc-${RUN_ID}-`;

/** コレクション名（テーブル名）に使う接頭辞。例: `acc_3f9a1c_` */
export const TABLE_PREFIX = `acc_${RUN_ID}_`;

/**
 * 後片付けで「自分の実行が作ったもの」を見分ける。
 * 🚨 **他の実行のものまで消さないこと。** 同時に走っている相手の足を踏みます。
 */
export function isMine(name) {
  const text = String(name ?? "");
  return text.startsWith(PREFIX) || text.startsWith(TABLE_PREFIX);
}

/**
 * 昔の実行が残した `acc-` / `acc_`（識別子なし）のものかどうか。
 * 一覧に出して人が消せるようにするためのもので、**自動では消しません**
 * （いま走っている別の実行のものと区別が付かないため）。
 */
export function looksLikeLeftover(name) {
  const text = String(name ?? "");
  return (text.startsWith("acc-") || text.startsWith("acc_")) && !isMine(text);
}
