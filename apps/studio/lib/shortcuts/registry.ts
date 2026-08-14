/**
 * ショートカットの一元管理。
 *
 * 🚨 契約 `AGENTS.md §3.6`: ここは `next/*` を import しない（将来 Hono へ切り出す資産）。
 *    React にも依存しない。**定義だけ**を持ち、購読は呼び出し側（client component）が行う。
 *
 * ── なぜ一元管理するか ──
 * 堀池（2026-08-15）の指示:
 * > 「ショートカットのカスタム / **ショートカットは被ってはいけない** /
 * >   戻る・検索・保存（⌘エンター）・左サイドバーの開閉・右サイドバーの開閉・
 * >   送信（⌘⇧エンター）そのた必要そうなもの」
 *
 * 🚨 **各コンポーネントが `document.addEventListener` を勝手に足すと、衝突に気づけない。**
 *    実際 `components/admin/global-search.tsx:71` が `⌘K` を自前で購読しており、
 *    後から誰かが `⌘K` を別用途に割り当てても**エラーにならず、片方だけ動く**。
 *    → **定義をここに集め、重複はテストで落とす**（`registry.test.ts`）。
 *
 * ── 表記について ──
 * 表示は `kbd` コンポーネントに渡す。**修飾キーの表記は OS で変わる**（mac は ⌘、他は Ctrl）ので、
 * ここでは**論理名**（`mod`）だけを持ち、表示側で解決する。
 */

/** 修飾キー。`mod` は mac で ⌘ / それ以外で Ctrl に解決される。 */
export type Modifier = "mod" | "shift" | "alt";

export type Shortcut = {
  /** 一意な識別子。重複はテストで落とす。 */
  id: string;
  /** 押すキー（`event.key` と比較する。1文字は小文字、特殊キーは "Enter" 等）。 */
  key: string;
  /** 同時に押す修飾キー。順序は問わない（比較時に集合として扱う）。 */
  modifiers: Modifier[];
  /** 何をするか。辞書キー（`AGENTS.md §3.8`: ここに文言を書かない）。 */
  labelKey: string;
  /**
   * 🚨 入力欄にフォーカスがあるときも効かせるか。
   * 既定は false（文字入力を奪わないため）。`mod` を伴うものだけ true にしてよい。
   */
  worksInInput?: boolean;
};

/**
 * 🚨 **ここに無いショートカットを各コンポーネントで直接購読しない。**
 * 追加するときは必ずこの配列に足す（そうしないと重複検査が効かない）。
 */
export const SHORTCUTS: Shortcut[] = [
  {
    // 既存実装: components/admin/global-search.tsx が購読している。
    // 🚨 **⌘K は検索が占有済み**。他の用途に割り当てない。
    id: "search",
    key: "k",
    modifiers: ["mod"],
    labelKey: "shortcut_search",
    worksInInput: true,
  },
  {
    id: "save",
    key: "Enter",
    modifiers: ["mod"],
    labelKey: "shortcut_save",
    // 入力中に保存したいので入力欄でも効かせる。
    worksInInput: true,
  },
  {
    id: "submit",
    key: "Enter",
    modifiers: ["mod", "shift"],
    labelKey: "shortcut_submit",
    worksInInput: true,
  },
  {
    id: "back",
    key: "[",
    modifiers: ["mod"],
    labelKey: "shortcut_back",
  },
  {
    id: "toggle_left_sidebar",
    key: "b",
    modifiers: ["mod"],
    labelKey: "shortcut_toggle_left_sidebar",
  },
  {
    id: "toggle_right_sidebar",
    key: "i",
    modifiers: ["mod"],
    labelKey: "shortcut_toggle_right_sidebar",
  },
];

/** 比較用の正規化キー。修飾キーは並び順に依存しないよう整列する。 */
export function shortcutSignature(shortcut: Pick<Shortcut, "key" | "modifiers">): string {
  const mods = [...shortcut.modifiers].sort().join("+");
  // key は大文字小文字を無視して比較する（`event.key` は Shift 併用で大文字になるため）。
  return `${mods}|${shortcut.key.toLowerCase()}`;
}

/**
 * 重複しているショートカットを返す。**空配列なら衝突なし。**
 * 🚨 「0 件」を「検査していない」と混同しないよう、テスト側で**わざと衝突させた対照**も見る。
 */
export function findConflicts(shortcuts: Shortcut[] = SHORTCUTS): string[][] {
  const bySignature = new Map<string, string[]>();
  for (const shortcut of shortcuts) {
    const signature = shortcutSignature(shortcut);
    const ids = bySignature.get(signature) ?? [];
    ids.push(shortcut.id);
    bySignature.set(signature, ids);
  }
  return [...bySignature.values()].filter((ids) => ids.length > 1);
}

/** id が重複していないか。定義ミスを早く見つけるため。 */
export function findDuplicateIds(shortcuts: Shortcut[] = SHORTCUTS): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const shortcut of shortcuts) {
    if (seen.has(shortcut.id)) duplicated.add(shortcut.id);
    seen.add(shortcut.id);
  }
  return [...duplicated];
}

/**
 * キーイベントが、そのショートカットに一致するか。
 *
 * @param isMac `mod` を ⌘(metaKey) と解釈するなら true、Ctrl なら false。
 */
export function matches(
  shortcut: Shortcut,
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  isMac: boolean,
): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;

  const wantsMod = shortcut.modifiers.includes("mod");
  const hasMod = isMac ? event.metaKey : event.ctrlKey;
  if (wantsMod !== hasMod) return false;

  // 🚨 `mod` を要求しないショートカットで ⌘/Ctrl が押されていたら不一致にする
  //    （⌘B とただの B を同じものとして扱わない）。
  const otherMod = isMac ? event.ctrlKey : event.metaKey;
  if (otherMod) return false;

  if (shortcut.modifiers.includes("shift") !== event.shiftKey) return false;
  if (shortcut.modifiers.includes("alt") !== event.altKey) return false;

  return true;
}
