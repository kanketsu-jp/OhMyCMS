"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 「右クリック」と「長押し」を、同じメニューの入口として扱う。
 *
 * 🚨 これは**記事の引き写しではない**。堀池が挙げた4本の記事はすべて D&D の話で、
 *    「長押し = 右クリック」を実装したものは1本も無かった（2026-08-15 に確認）。
 *    設計の根拠は MDN と挙動の理屈で、**実機での確認が別に要る**。
 *    詳細: `~/.claude/skills/touch-dnd-and-longpress/SKILL.md`
 *
 * 押さえている点:
 *  1. **マウスは `contextmenu` に任せる**。長押しを両方に効かせると二重に開く
 *  2. 🚨 **動いたら取り消す**。指が動いているのは「スクロールしたい」なので、
 *     そこでメニューを開くと**画面が動かせなくなる**
 *  3. 🚨 **`pointercancel` も拾う**。OS がジェスチャを奪ったとき `pointerup` は来ない
 *  4. 🚨 **開いた直後の `click` を1回だけ捨てる**。指を離すと `click` が続けて飛び、
 *     **メニューを出した対象がそのまま選択・遷移する**
 */

/** 長押しと判定するまでの時間。ドラッグ開始（150〜300ms）とは**別の値**にする。 */
const LONG_PRESS_MS = 500;
/** これ以上動いたらスクロールの意思とみなして取り消す。 */
const MOVE_TOLERANCE_PX = 10;

export type LongPressMenuState = {
  /** 開いているか。 */
  open: boolean;
  /** 閉じる。 */
  close: () => void;
  /** 対象の要素に展開して渡すもの。 */
  handlers: {
    onContextMenu: (event: React.MouseEvent) => void;
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onClickCapture: (event: React.MouseEvent) => void;
  };
};

export function useLongPressMenu(): LongPressMenuState {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // 🚨 「いま開いたばかり」の印。次の click を1回だけ捨てるために使う。
  const justOpened = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  // 付けっぱなしのタイマーを残さない（要素が消えても走り続けるのを防ぐ）。
  useEffect(() => clear, [clear]);

  // 🚨 座標は持たない。メニューは**掴んだタイル自身**を起点に出す。
  //    座標に出すと、画面の端で見切れる場合の面倒を自前で持つことになる。
  const openMenu = useCallback(() => {
    setOpen(true);
    justOpened.current = true;
  }, []);

  return {
    open,
    close: useCallback(() => setOpen(false), []),
    handlers: {
      onContextMenu: (event) => {
        // マウスの右クリック。既定のメニューを止めて、こちらを出す。
        event.preventDefault();
        openMenu();
      },
      onPointerDown: (event) => {
        // 🚨 マウスは contextmenu に任せる（両方に効かせると二重に開く）。
        if (event.pointerType === "mouse") return;
        start.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(openMenu, LONG_PRESS_MS);
      },
      onPointerMove: (event) => {
        if (!start.current) return;
        const dx = Math.abs(event.clientX - start.current.x);
        const dy = Math.abs(event.clientY - start.current.y);
        // 🚨 動いたら取り消す。ここを消すと、スクロールしようとするたびにメニューが出る。
        if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) clear();
      },
      onPointerUp: clear,
      // 🚨 OS がジェスチャを奪ったときは pointerup が来ない。ここで必ず片付ける。
      onPointerCancel: clear,
      onClickCapture: (event) => {
        // 🚨 長押しで開いた直後の click を1回だけ捨てる。
        //    捨てないと、メニューを出した対象がそのまま開かれる。
        if (!justOpened.current) return;
        justOpened.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}
