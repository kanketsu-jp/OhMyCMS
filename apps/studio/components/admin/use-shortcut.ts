"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * ショートカットの実装（React 側）。組み合わせの一覧は `shortcuts.ts` が持つ（ここには書かない）。
 *
 * 🚨 **入力中はショートカットを奪わない。** `⌘←` は macOS で「行頭へカーソルを移す」であり、
 *    `⌘B` は WYSIWYG の太字。入力欄の中でこれらを横取りすると、
 *    **文字が打てるのに編集操作だけができない**という直しにくい不具合になる。
 *    保存・送信のように入力中でも効いてほしいものだけ `whileTyping` を立てる。
 */

/** 文字を入力できる場所にフォーカスがあるか。 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * いま mac か。
 *
 * 🚨 サーバでは分からないので `useSyncExternalStore` で「サーバは false / クライアントは実測」を表す。
 *    `useEffect` + `setState` にすると React Compiler の lint が error にする
 *    （`page-action.tsx` に同じ理由の申し送りがある）。
 */
export function useIsMac(): boolean {
  return useSyncExternalStore(
    () => () => {},
    detectIsMac,
    () => false,
  );
}

/**
 * 押されたキーが組み合わせに一致するか。
 *
 * 🚨 修飾キーは「要る／要らない」の**両方向**で見る。`event.metaKey` を見るだけだと、
 *    `mod+enter`（保存）が素の Enter でも通ってしまう。
 *
 * 🚨 `mod` は**プラットフォームで実キーを分ける**。mac で `Ctrl+K` を `⌘K` と同じに扱うと、
 *    別物のはずの2つが同じ操作になる（司令塔の指摘・2026-08-15）。
 *    mac は `metaKey` だけ、それ以外は `ctrlKey` だけを見る。
 */
export function matchesShortcut(event: KeyboardEvent, combo: string, isMac: boolean): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  if (event.key.toLowerCase() !== key) return false;

  const wantMod = parts.includes("mod");
  const mod = isMac ? event.metaKey : event.ctrlKey;
  // 反対側の修飾キーが押されていたら、たとえ mod が合っていても一致させない。
  const otherMod = isMac ? event.ctrlKey : event.metaKey;
  if (wantMod !== mod) return false;
  if (otherMod) return false;

  if (parts.includes("shift") !== event.shiftKey) return false;
  if (parts.includes("alt") !== event.altKey) return false;
  return true;
}

export function useShortcut(
  combo: string,
  handler: () => void,
  options?: { whileTyping?: boolean },
): void {
  const whileTyping = options?.whileTyping ?? false;
  const isMac = useIsMac();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, combo, isMac)) return;
      if (!whileTyping && isTyping(event.target)) return;
      event.preventDefault();
      handler();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [combo, handler, whileTyping, isMac]);
}
