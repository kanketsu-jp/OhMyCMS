/**
 * ファイル一覧の「表示形式ごとの設定」を、URL から読み取る所。
 *
 * 🚨 **表示形式は画面ではなく、同じデータの見え方**（`decisions/list-views-are-switchable-layouts`）。
 *    だから設定も**形式ごと**に分かれる:
 *      表   … 出す項目（列）
 *      カード … 1 行に並べる数
 *
 * 🚨 **状態は URL に持つ**（`files-view-switch.tsx` と同じ理由）。
 *    URL を共有すると相手も同じ見え方になり、リロードでも残り、
 *    サーバ側で最初から正しい形を返せる。
 *
 * 🚨 **知らない値は既定へ落とす。エラーにしない。**
 *    クエリは手で編集されるし、古いブックマークからも来る。
 *    見え方が壊れているだけで、中身は見せられる（`page.tsx` の `view` と同じ扱い）。
 */

/** 表に出せる項目。 */
export const FILE_COLUMNS = ["name", "type", "size", "uploaded"] as const;
export type FileColumn = (typeof FILE_COLUMNS)[number];

/**
 * 🚨 **名前も消せる**（2026-08-17 に変えた）。
 *
 * それまでは「名前を消すと、どの行が何なのか言えなくなる（開く手段が無くなる）」として
 * 消せなくしていた。**その理由は正しかったが、原因は名前ではなく『行が開けないこと』**だった。
 *
 * 🚨 base2 の実測（Directus・`layouts/tabular`）:
 *    **Directus には「消せない列」が無い。** 行のどこをクリックしても詳細へ行けるから。
 *    ＝ **消せなかったのは、私たちが「名前のリンクからしか開けなかった」から**。
 *
 * ✅ 同じ日に**行のどこでもクリックで開ける**ようにしたので、名前も消せるようになった。
 *    ＝ 🚨 **「見習えない」ではなく「順番が在った」**。
 */
export const ALWAYS_ON_COLUMN = null;

/** 何も指定が無いときに出す列。 */
export const DEFAULT_COLUMNS: readonly FileColumn[] = FILE_COLUMNS;

/** カードを 1 行に並べる数。🚨 既定 3・1〜5 から選べる（設問 316 の備考）。 */
export const CARD_COLUMN_CHOICES = [1, 2, 3, 4, 5] as const;
export type CardColumns = (typeof CARD_COLUMN_CHOICES)[number];
export const DEFAULT_CARD_COLUMNS: CardColumns = 3;

/**
 * `?cols=type,size` を読む。
 *
 * 🚨 **空文字は「全部消した」として尊重する**（`?cols=` → 名前だけ）。
 *    ここで既定へ戻すと、**全部外したのに戻ってくる**ように見えて操作が効かない。
 * 🚨 **指定が無い（`undefined`）ときだけ既定**。「無い」と「空」を分ける。
 */
export function readColumns(raw: string | string[] | undefined): readonly FileColumn[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return DEFAULT_COLUMNS;
  const wanted = new Set(value.split(",").map((one) => one.trim()));
  // 🚨 並びは URL の順ではなく **FILE_COLUMNS の順**にする。
  //    URL の順を信じると、同じ選択でも並びが変わる URL が何通りもできる。
  return FILE_COLUMNS.filter((column) => wanted.has(column));
}

/** `?cards=4` を読む。🚨 1〜5 の外は既定へ落とす。 */
export function readCardColumns(raw: string | string[] | undefined): CardColumns {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return (CARD_COLUMN_CHOICES as readonly number[]).includes(parsed)
    ? (parsed as CardColumns)
    : DEFAULT_CARD_COLUMNS;
}

/**
 * カードの列数を Tailwind の class にする。
 *
 * 🚨 **文字列を組み立てない**（`grid-cols-${n}` は Tailwind が拾えず、**無言で効かない**）。
 *    ここに全部書いておくのは冗長に見えるが、**書かないと動かない**。
 * 🚨 狭い画面では **1 列**に落とす。指定の列数は `sm:` から効かせる
 *    （**指定どおりに 5 列を狭い画面へ出すと、1 枚が読めない大きさになる**）。
 */
export function cardGridClass(columns: CardColumns): string {
  switch (columns) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-1 sm:grid-cols-2";
    case 3:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
    case 4:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-4";
    case 5:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-5";
  }
}

/**
 * 列の幅（`?w=name:240,type:120`）。
 *
 * 🚨 **URL に持つ**（列の選択・1 行の数と同じ場所）。
 *    Directus は**サーバの preset**に持つが、それは**あちらが preset の仕組みを持っている**から。
 *    私たちは「見え方は URL」と決めており（`files-view-switch.tsx`）、
 *    **幅だけ別の場所に置くと、共有した URL で幅だけ戻る**。
 *
 * 🚨 **最小 64px。** Directus は 32px だが、この表は**名前が長い**（ファイル名）ので、
 *    32px まで詰められると**掴んで戻すこともできなくなる**（掴む所が消える）。
 *
 * 🚨 **上限は置かない。** 横に流れる表なので、広げても他を壊さない
 *    （`overflow-x-auto` が受ける）。
 */
export const MIN_COLUMN_WIDTH = 64;

/** `?w=name:240,type:120` を読む。🚨 知らない列・壊れた数は捨てる。 */
export function readColumnWidths(raw: string | string[] | undefined): Partial<Record<FileColumn, number>> {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === "") return {};
  const out: Partial<Record<FileColumn, number>> = {};
  for (const part of value.split(",")) {
    const [key, width] = part.split(":");
    const column = FILE_COLUMNS.find((one) => one === key);
    const px = Number(width);
    // 🚨 数でないもの・小さすぎるものは**黙って捨てる**（エラーにしない。URL は手で編集される）
    if (column && Number.isFinite(px) && px >= MIN_COLUMN_WIDTH) out[column] = Math.round(px);
  }
  return out;
}

/** 幅の表を `?w=` の文字列へ戻す。🚨 並びは `FILE_COLUMNS` の順（同じ選択で同じ URL になる）。 */
export function writeColumnWidths(widths: Partial<Record<FileColumn, number>>): string {
  return FILE_COLUMNS.filter((column) => widths[column] !== undefined)
    .map((column) => `${column}:${widths[column]}`)
    .join(",");
}
