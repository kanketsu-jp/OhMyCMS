/**
 * 管理画面のキーボードショートカット。**ここが唯一の定義**。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「ショートカットは被ってはいけない」
 * > 「戻る・検索・保存（⌘エンター）・左サイドバーの開閉・右サイドバーの開閉・送信（⌘⇧エンター）」
 *
 * 🚨 **呼び出し側に組み合わせを直接書かない。** 2箇所に書くと、片方だけ変えたときに
 *    「被っていないつもりで被る」。被りの検出は `scripts/check-shortcuts.mjs` が
 *    このファイルを読んで機械的に行う（人が一覧を眺めて確かめない）。
 *
 * 表記:
 *   `mod` = macOS の ⌘ / それ以外の Ctrl
 *   最後の要素が `KeyboardEvent.key`（小文字で比較する）
 */
export const SHORTCUTS = {
  /** 横断検索を開く。🚨 **既に検索が占有している**。他に割り当てないこと（f2j-state.md §11-9） */
  search: "mod+k",
  /** ひとつ前の画面へ戻る */
  back: "mod+arrowleft",
  /** 保存 */
  save: "mod+enter",
  /** 送信（保存より強い操作。⇧ を足して取り違えを防ぐ） */
  submit: "mod+shift+enter",
  /** 左サイドバーの開閉 */
  toggleLeftSidebar: "mod+b",
  /**
   * 右サイドバーの開閉。
   * 🚨 `mod+i` にしない。WYSIWYG（Tiptap）の斜体と衝突する。
   *    `useShortcut` は入力中を避けるので実害は出ないが、
   *    **「入力欄の外では効いて、中では効かない」ショートカットは説明できない**。
   */
  toggleRightSidebar: "mod+j",
} as const;

export type ShortcutName = keyof typeof SHORTCUTS;

/**
 * 表示用の記号。**辞書に持たせない。**
 *
 * 🚨 理由: 記号は言語ではなく**プラットフォーム**で変わる（mac は ⌘ / Windows は Ctrl）。
 *    辞書に "⌘←" と書くと、**Windows で嘘になる**（日本語/英語の切り替えでは直せない）。
 *    ショートカットの**名前**（「戻る」「検索」）は辞書（`common.shortcut_*`）が持つ。
 */
const MOD_SYMBOL = { mac: "⌘", other: "Ctrl" } as const;
const SHIFT_SYMBOL = { mac: "⇧", other: "Shift" } as const;
const ALT_SYMBOL = { mac: "⌥", other: "Alt" } as const;

/** `KeyboardEvent.key`（小文字）→ 画面に出す記号。無ければ大文字にするだけ。 */
const KEY_SYMBOL: Record<string, string> = {
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  enter: "↵",
  escape: "Esc",
  backspace: "⌫",
};

/** `"mod+shift+enter"` → mac: `"⌘⇧↵"` / それ以外: `"Ctrl+Shift+Enter"` */
export function formatShortcut(combo: string, isMac: boolean): string {
  const platform = isMac ? "mac" : "other";
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];

  const pieces: string[] = [];
  if (parts.includes("mod")) pieces.push(MOD_SYMBOL[platform]);
  if (parts.includes("alt")) pieces.push(ALT_SYMBOL[platform]);
  if (parts.includes("shift")) pieces.push(SHIFT_SYMBOL[platform]);

  const symbol = KEY_SYMBOL[key];
  // mac は記号を詰めて書く（⌘⇧↵）。Windows は語で書くので区切りが要る（Ctrl+Shift+Enter）。
  pieces.push(symbol ?? (isMac ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)));

  return isMac ? pieces.join("") : pieces.join("+");
}
