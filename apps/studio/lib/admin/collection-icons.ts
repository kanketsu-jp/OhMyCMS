/**
 * コレクションが選べるアイコンの一覧。**唯一の定義**。
 *
 * 由来: 堀池さん 2026-08-17（K2）原文:
 * 「コンテンツの中身（admin/content/:dynamic_path）に関しては、
 *   それぞれのコンテンツが固有のアイコンを持つようにしてください。」
 *
 * 🚨 **画面と API の両方がこの 1 本を参照する。** 片方に配列を写経しない
 * （写経すると、片方に足してもう片方は弾く、が必ず起きる。
 *  `lib/admin/avatar-emojis.ts` に同じ申し送りがある）。
 *
 * ## なぜ絵文字ではなく線画なのか（司令塔の決め・2026-08-17）
 *
 * 堀池さんの常設指示が「**全て directus を見習う**」で、Directus は
 * `directus_collections.icon` に**アイコン名の文字列**を持つ（`packages/types/src/collection.ts:16`）。
 * 🚨 **「アバターが絵文字だから揃えるべき」は当たらない。** アバターは**人**、
 * コレクションのアイコンは**もの**で、いま左サイドバーは
 * database / files / tag / users / settings / bell / trash2 の**線画**、アバターだけ絵文字。
 * ＝ 既に「人は絵文字・ものは線画」で割れている。コレクションを絵文字にすると**その割り方が壊れる**。
 *
 * ## 🚨 なぜ固定の一覧なのか（**任意の名前は描けない**）
 *
 * 【測った 2026-08-17】`lucide-react` 1.31.0 の名前付き書き出しは **6,065 件**、
 * 遅延読み込みの口（`dynamicIconImports` のようなもの）は **0 件**
 * （`package.json` の `exports` を引いた）。
 * ＝ **任意の名前を後から描くには 6,065 件を全部束ねるしかない。**
 * だから**先に import したものだけ**を選べるようにする。
 *
 * 🚨 **最初から多くしない**（司令塔・2026-08-17）。多いと選ぶ画面が使えなくなる。
 * **足りないと言われてから増やす。** 増やすのはこの配列に 1 行足すだけ。
 *
 * 🚨 **絵は、既にこのリポジトリで使っているものから採る**（同じ意味に 2 つの絵を作らない）。
 * 下の 12 個はすべて `components/` か `app/` で既に使われている。
 */
export const COLLECTION_ICONS = [
  "table",
  "database",
  "file",
  "files",
  "folder",
  "folder-tree",
  "image",
  "list",
  "tag",
  "users",
  "key-round",
  "shield-alert",
] as const;

export type CollectionIcon = (typeof COLLECTION_ICONS)[number];

/**
 * 既定のアイコン。**アイコンを選んでいないコレクションはこれ**。
 *
 * 🚨 **空にしない**（司令塔の決め・表示名と同じ考え方）。いまサイドバーが出しているものと
 * 同じ `table` にしてあるので、**この列を足しても既存の見た目は 1 ミリも変わらない**。
 */
export const DEFAULT_COLLECTION_ICON: CollectionIcon = "table";

/**
 * 保存してよい値か。**サーバ側の検証はこれを通す**
 * （`AGENTS.md` §3.5「画面で絞ってサーバが何でも受ける形にしない」）。
 *
 * 🚨 `null` は「選んでいない」で**正しい値**。呼ぶ側が `value !== null && !isCollectionIcon(value)`
 * の形で使う（`app/api/auth/me/route.ts:87` の `isAvatarEmoji` と同じ形）。
 */
export function isCollectionIcon(value: unknown): value is CollectionIcon {
  return typeof value === "string" && (COLLECTION_ICONS as readonly string[]).includes(value);
}
