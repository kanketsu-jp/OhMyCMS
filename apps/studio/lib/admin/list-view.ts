/**
 * 一覧の見え方（表示する列・1ページの件数）を **URL から決める**ための解釈。
 *
 * 🚨 状態を URL に置いたのは、**保存先のテーブルを増やさずに済む**から。
 *    Directus は `directus_presets` に利用者ごとの表示を保存するが、このCMSにその表は無い。
 *    URL なら **リンクを送るだけで同じ見え方を共有**でき、後から「保存された表示」を足すときも
 *    URL が正本という形が残る。
 *
 * 🚨 **URL は他人が書ける**ので、知らない値は必ず既定へ落とす（fail-closed）。
 *    ここで例外を投げると、**壊れたリンクを踏んだ人には一覧そのものが見えなくなる**。
 *    列が見えないより、既定の列が見えるほうがましだと判断した。
 *
 * 🚨 件数に**上限**を置いているのは、`?limit=99999` で**サーバが全件引いて落ちる**から。
 *    許可リストに完全一致するときだけ採用する（範囲で判定しない）。
 *
 * 🚨 Next.js に依存させない（AGENTS.md §3.6）。解釈は素の文字列を受け取って素の値を返す。
 */
export const LIST_LIMITS = [20, 50, 100] as const;
export const DEFAULT_LIST_LIMIT = 20;
export const DEFAULT_COLUMN_COUNT = 8;

/** ?cols= を解釈する。許可リスト方式・fail-closed。 */
export function resolveColumns<T extends { field: string }>(
  raw: string | undefined,
  fields: T[],
): T[] {
  const fallback = fields.slice(0, DEFAULT_COLUMN_COUNT);
  if (raw === undefined || raw === "") return fallback;

  const requested = new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  if (requested.size === 0) return fallback;

  // 🚨 並びは **fields の順**に揃える（URL に書かれた順に従わない）。
  //    列の並び替えは別の機能で、ここで**URL 経由の副作用として入ってこない**ようにする。
  const resolved = fields.filter((field) => requested.has(field.field));
  // 実在する列が1本も無いときは既定へ。**列が0本の表**を描いても何も読めない。
  return resolved.length > 0 ? resolved : fallback;
}

/** ?limit= を解釈する。許可リストに無い値は既定へ落とす。 */
export function resolveLimit(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_LIST_LIMIT;

  const value = Number(raw);
  return LIST_LIMITS.includes(value as (typeof LIST_LIMITS)[number])
    ? value
    : DEFAULT_LIST_LIMIT;
}
