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

/**
 * アップロードしたファイルを **本当に捨てる**（行も実体も）。
 *
 * 🚨 **なぜ要るか（2026-08-17 実測）。** `DELETE /api/files/<id>` は**論理削除**で、
 *   ゴミ箱へ入れるだけ。**捨てたつもりで、行も実体も残る**。
 *   ゴミ箱に **69 件**（実体つき 68 件）が溜まり、そのうち **49 件が V1-B の走行**だった。
 *   後片付けが `.catch(() => {})` で握り潰していたので、**誰も気づけなかった**。
 *   ＝ 🚨 **「打った」を報告する道具を、確かめずに使っていた形**。
 *
 * 🚨 **1cdf06d（storage）より前は、そもそも完全削除ができなかった**
 *   （`400 SYSTEM_IDENTIFIER`）。だからこの 2 段目は、それ以降にしか書けない。
 *
 * 🚨 **握り潰さない。** 消えなかった件数を返すので、**呼び手は details に出すこと**。
 *   「片付けた」ではなく「**何件が消えて、何件が残ったか**」を書く。
 *
 * @returns {Promise<{tried:number, softDeleted:number, purged:number, remaining:number, notes:string[]}>}
 */
export async function purgeUploadedFiles(session, ids) {
  const tried = ids.length;
  const notes = [];
  let softDeleted = 0;
  for (const id of ids) {
    const r = await session.request(`/api/files/${id}`, { method: "DELETE" });
    if (r.status === 204) softDeleted += 1;
    else notes.push(`論理削除に失敗: ${id} → HTTP ${r.status}`);
  }

  // 🚨 key は**一覧が返す値をそのまま使う**（自分で組み立てない）。
  //   ただし「どの行が自分の id か」は key を開かないと分からないので、そこだけ解く。
  //   形の正本は `lib/trash/service.ts:85`（`Buffer.from(JSON.stringify(v)).toString("base64url")`）。
  const idOf = (key) => {
    try {
      return JSON.parse(Buffer.from(String(key), "base64url").toString("utf8"))?.primaryKey?.id ?? null;
    } catch {
      return null;
    }
  };

  const wanted = new Set(ids);
  const list = await session.get("/api/trash");
  const rows = Array.isArray(list.json?.data) ? list.json.data : [];
  if (list.status !== 200) notes.push(`ゴミ箱の一覧を読めません → HTTP ${list.status}`);

  let purged = 0;
  for (const row of rows) {
    const id = idOf(row.key);
    if (!id || !wanted.has(id)) continue;
    const r = await session.request("/api/trash", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: row.key }),
    });
    if (r.status === 204) purged += 1;
    else notes.push(`完全削除に失敗: ${id} → HTTP ${r.status} ${r.json?.error?.code ?? ""}`);
  }

  // 🚨 **総数では確かめない**（打ち消し合う）。**自分の id が残っていないか**で確かめる。
  const after = await session.get("/api/trash");
  const afterRows = Array.isArray(after.json?.data) ? after.json.data : [];
  const remaining = afterRows.filter((row) => wanted.has(idOf(row.key))).length;

  return { tried, softDeleted, purged, remaining, notes };
}
