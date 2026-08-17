/**
 * **その 1 行を、人にどう見せるか。** 答えはここ 1 つ。
 *
 * 🚨 **同じ問いが 4 箇所に出ます**——カード表示 / 関連の相手 / 横断検索 / ゴミ箱。
 *    2026-08-17 の時点で、答えは **2 つに割れていました**:
 *      ・`directus_collections.display_template` … **列も API も型も在るが、読む所が 0 件**
 *        （🟢 対照 同じ問い合わせでコレクションは 15 本取れる ＝ 見ていない 0 ではない）
 *      ・`lib/trash/service.ts` の `DISPLAY_FIELDS` … **実際に効いているのはこちらだけ**
 *    ＝ 🚨 **3 つ目を足す前に、1 つへ寄せる**（司令塔・design の判断）。
 *
 * 🚨 **ここに UI は無い。** 雛形を「書かせる」画面は**まだ作らない**——
 *    `display_template` は 15 本すべて null ＝ **誰も欲しがっていない**
 *    （`knowledge/decisions/every-element-must-earn-its-place.md`）。
 *    **いま要るのは「探す側」だけ**なので、器（列・API・型）には触っていない。
 *
 * 🚨 **Next.js に依存しない**（`AGENTS.md` §3.6）。引数と戻り値だけで完結する。
 */

/**
 * 雛形が無いときに探す欄。**上から順に、最初に見つかったもの**を使う。
 *
 * 🚨 **順番が仕様。** 並べ替えると、**同じ行が別の名前で表示される**。
 *    由来は `lib/trash/service.ts` にあった同名の配列で、**1 文字も変えずに移した**
 *    （寄せ替えの受入は「**表示が 1 文字も変わらないこと**」だったため）。
 * 🚨 `id` が最後に在るのは「**名前が何も無い行でも、空文字にしない**」ため。
 */
export const DISPLAY_FIELDS = [
  "title",
  "name",
  "filename_download",
  "email",
  "collection",
  "field",
  "id",
] as const;

/** 雛形の中の `{{ field }}`。**空白は許す**（`{{title}}` と `{{ title }}` は同じ）。 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * 値を「見せる文字列」にする。
 *
 * 🚨 **string と number しか採らない。** `true` / `{}` / 配列 を名前に使うと、
 *    利用者には `[object Object]` に見える——**名前が無いより悪い**（誤解を生む）。
 *    採れない値は「無い」として扱い、次の欄へ進む。
 */
function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * 雛形を当てる。**1 つでも埋まらなければ、雛形は使わない**。
 *
 * 🚨 **虫食いを見せない。** `{{title}} / {{owner}}` の `owner` が空のとき、
 *    「`カタログ / `」のような**半端な名前**を出すより、
 *    **既定の探し方に落ちるほうが読める**（利用者は「壊れている」と読まずに済む）。
 * 🚨 **置換できる欄が 1 つも無い雛形**（`{{}}` を含まない素の文字列）は、
 *    **全行が同じ名前になる**ので使わない——**区別できない名前は、名前ではない**。
 */
function applyTemplate(template: string, row: Record<string, unknown>): string | null {
  let matched = 0;
  let missing = false;
  const filled = template.replace(PLACEHOLDER, (_all, field: string) => {
    matched += 1;
    const text = asText(row[field]);
    if (text === null) {
      missing = true;
      return "";
    }
    return text;
  });
  if (matched === 0 || missing) return null;
  const trimmed = filled.trim();
  return trimmed === "" ? null : trimmed;
}

export type RowLabelInput = {
  /** その行。 */
  row: Record<string, unknown>;
  /** そのコレクションの雛形（`directus_collections.display_template`）。無ければ null。 */
  displayTemplate?: string | null;
  /**
   * 主キーの列名。**最後の手段**として 1 本目を使う。
   * 🚨 複合キーでも **1 本目だけ**（由来の実装がそうだった。
   *    「3 つ組を繋げて見せる」は**別の判断**なので、ここでは変えない）。
   */
  primaryKeys?: readonly string[];
};

/**
 * その 1 行の見出しを返す。
 *
 * 順番: ① 雛形（在って、全部埋まるとき） → ② `DISPLAY_FIELDS` を上から → ③ 主キーの 1 本目。
 * 🚨 **必ず文字列を返す**（見つからなければ空文字）。**呼ぶ側で `?? ""` を書かせない**。
 */
export function rowLabel({ row, displayTemplate, primaryKeys }: RowLabelInput): string {
  if (typeof displayTemplate === "string" && displayTemplate.trim() !== "") {
    const fromTemplate = applyTemplate(displayTemplate, row);
    if (fromTemplate !== null) return fromTemplate;
  }
  for (const field of DISPLAY_FIELDS) {
    const text = asText(row[field]);
    if (text !== null) return text;
  }
  const firstKey = primaryKeys?.[0];
  return firstKey ? String(row[firstKey] ?? "") : "";
}
