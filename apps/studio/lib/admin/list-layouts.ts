/**
 * コレクション一覧の表示形式。
 *
 * 🚨 状態を URL に持つのは、**新しい保存用の表を作らない**ため。
 *    URL ならリンクを共有するだけで同じ見え方を渡せて、サーバ側でも最初から選択済みの
 *    表示形式として描ける。DB の migration も要らない。
 *
 * 🚨 代わりに、利用者ごとの「前回の続き」は残らない。
 *    URL に `?layout=` を持たずに来たときは既定の表示形式へ戻る。
 *
 * 🚨 kanban と map は後から挿せる。**ただし「この配列へ足すだけ」ではない。**
 *    【測った 2026-08-17】一時的に 2 件足して確かめた:
 *      🟢 `?layout=kanban` / `?layout=map` … その場で受け付けられた（既定へ落ちない）
 *      🟢 対照 `?layout=zzbogus` … tabular へ落ちたまま（fail-closed は壊れない）
 *      🚨 一方で `layoutParamPrefix` が **型で落ちる**（TS2366 …ending return statement）
 *    ＝ **足す場所は 2 つ**（この配列と、下の接頭辞）。
 *      2 つ目は**コンパイラが名前で教えてくれる**ので、忘れたまま出荷はできない。
 *      🚨 描き分けを足さない限り、選んでも表のまま出る（＝ 挿すときは描き分けも要る）。
 *    icon は名前だけを持つ。ここはサーバでもクライアントでも読むので、lucide の部品は import しない。
 */
export const LIST_LAYOUTS = [
  { id: "tabular", nameKey: "layout_tabular", icon: "table" },
  { id: "cards", nameKey: "layout_cards", icon: "grid" },
  { id: "calendar", nameKey: "layout_calendar", icon: "calendar" },
] as const;

export type ListLayoutId = (typeof LIST_LAYOUTS)[number]["id"];

export const DEFAULT_LIST_LAYOUT: ListLayoutId = "tabular";

/** ?layout= を解釈する。知らない値・空・配列は既定へ落とす。 */
export function resolveLayout(raw: string | string[] | undefined): ListLayoutId {
  if (typeof raw !== "string" || raw === "") return DEFAULT_LIST_LAYOUT;
  return LIST_LAYOUTS.some((layout) => layout.id === raw)
    ? (raw as ListLayoutId)
    : DEFAULT_LIST_LAYOUT;
}

/**
 * 表示形式ごとの URL 設定を分けるための接頭辞。
 *
 * 表で並べ替えた条件が、カレンダーへ移っても消えないように `tab.*` / `crd.*` / `cal.*`
 * のように別々の検索パラメータとして持つ。
 */
export function layoutParamPrefix(id: ListLayoutId): string {
  switch (id) {
    case "tabular":
      return "tab.";
    case "cards":
      return "crd.";
    case "calendar":
      return "cal.";
  }
}
