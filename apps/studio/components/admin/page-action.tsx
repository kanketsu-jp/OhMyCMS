"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** 押したときの行き先 */
  href: string;
  /** PC で出す文字。SP はアイコンだけなので `aria-label` にも使う */
  label: string;
  /** SP の右下に出すアイコン */
  icon: ReactNode;
};

/**
 * そのページの**主要アクション**。
 *
 * 憲章 §7（堀池さん原文）:
 * 「その画面ですぐにしたいアクション（編集、保存など）は**右下**に配置して、
 *   それだとナビが少なくなるので、左端にはサイドメニューを表示するためのアイコンを設けておく。」
 *
 * → **SP は下部ナビの右端**（`#mobile-primary-action`）へ portal で差し込む。
 *   **PC はページの見出しの横**にそのまま出す（下部ナビが無いので）。
 *
 * 🚨 portal 先は `mobile-nav.tsx` が**空でも幅を確保して**置いてある枠。
 * 埋めた瞬間に中央のナビがずれないようにするため（design ⑨-⑤）。
 *
 * 🚨 SSR では `document` が無いので、サーバ側の HTML には PC 用だけが出て、
 * SP 用は水和のあとに現れる。
 *
 * 🚨 その「サーバでは無い／クライアントには在る」を **`useSyncExternalStore`** で表す。
 * `useEffect` の中で `setState` する形にすると、React Compiler の lint が
 * 「Calling setState synchronously within an effect can trigger cascading renders」で
 * **error にする**（実際に落ちた）。getSnapshot は同じ要素を返すので安定している。
 */
export function PageAction({ href, label, icon }: Props) {
  const slot = useSyncExternalStore(
    // 枠は下部ナビが常に置いているので、購読して変化を待つ必要はない
    () => () => {},
    () => document.getElementById("mobile-primary-action"),
    () => null,
  );

  return (
    <>
      {/* PC: 見出しの横に文字つきで出す */}
      <Link
        href={href}
        className={cn(buttonVariants({ size: "sm" }), "hidden md:inline-flex")}
      >
        {icon}
        {label}
      </Link>
      {/* SP: 下部ナビの右端へ。**アイコンだけ**（行の中の操作と同じ考え方で、文脈は画面が持っている） */}
      {slot
        ? createPortal(
            <Link
              href={href}
              aria-label={label}
              className={cn(
                buttonVariants({ size: "icon" }),
                "size-(--control-h)",
              )}
            >
              {icon}
            </Link>,
            slot,
          )
        : null}
    </>
  );
}
