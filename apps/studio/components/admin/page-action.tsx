"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 押し方は**ページの性質で決まる**（`lib/admin/page-actions.ts` の `kind`）。
 * ちょうど 1 つだけ渡すこと。
 *
 * - `href`    … 次の画面へ行く（一覧 → 新規作成）
 * - `form`    … ページの中の `<form id="...">` を、**その外にある**ボタンから送る。
 *               HTML の `form` 属性で成立する。ヘッダーへ「保存」を出すにはこれが要る。
 * - `onClick` … その場で何かする（すべて既読にする・報告を開く 等）
 */
type Props = {
  /** PC で出す文字。SP はアイコンだけなので `aria-label` にも使う */
  label: string;
  /** アイコン */
  icon: ReactNode;
  href?: string;
  form?: string;
  onClick?: () => void;
  /**
   * 実行中。押せなくしてスピナーを出す。
   * 🚨 二重送信の防止は `Button` の `loading` が持っている（`button.tsx` の申し送り参照）。
   */
  pending?: boolean;
  /**
   * 主要か補助か。**主要は 1 ページに 1 つだけ**（`page-actions.ts` の role と対応）。
   * 補助は枠線だけにして、主要との差を色で付ける。
   */
  role?: "primary" | "secondary";
  /** 取り消せない操作。塗らずに赤い枠線にする（憲章 §3b） */
  destructive?: boolean;
};

/**
 * そのページの**アクションボタン**。
 *
 * 由来（堀池・2026-08-15 原文・ヘッダーの構成）:
 * > 「その次にアクションボタン（**SPと同じ**）（一番右）」
 *
 * → **PC はヘッダー右の `#header-primary-action`**、**SP は下部ナビ右端の
 *   `#mobile-primary-action`** へ portal で差し込む。**どちらも同じ props から出す**ので、
 *   PC と SP で中身が食い違わない。
 *
 * 🚨 **以前は PC だけページの見出しの横に直接描いていた。** 見出しをページから
 *    撤去した（名前はパンくずが出す）ので、置き場所が無くなった。ヘッダーへ移した。
 *
 * 🚨 portal 先は**空でも幅を確保して**置いてある枠。埋めた瞬間に周りがずれないようにするため。
 *
 * 🚨 SSR では `document` が無いので、サーバ側の HTML には**どちらも出ない**（水和のあとに現れる）。
 *    その「サーバでは無い／クライアントには在る」を `useSyncExternalStore` で表す。
 *    `useEffect` の中で `setState` する形にすると React Compiler の lint が error にする。
 */
export function PageAction({
  href,
  form,
  onClick,
  label,
  icon,
  pending = false,
  role = "primary",
  destructive = false,
}: Props) {
  const headerSlot = useSlot("header-primary-action");
  const mobileSlot = useSlot("mobile-primary-action");

  const variant = destructive ? "destructive" : role === "secondary" ? "outline" : "default";
  // 🚨 補助は**必ず主要の左**に出す。portal は mount の順に並ぶので、
  //    ページが補助を先に描くか後に描くかで左右が入れ替わってしまう。
  //    順番をページに委ねず、ここで決める。
  const order = role === "secondary" ? "order-first" : undefined;

  // PC: 文字つき。SP: アイコンだけ（行の中の操作と同じで、文脈は画面が持っている）
  const pc = renderAction({ href, form, onClick, label, icon, pending, variant, order, compact: false });
  const sp = renderAction({ href, form, onClick, label, icon, pending, variant, order, compact: true });

  return (
    <>
      {headerSlot ? createPortal(pc, headerSlot) : null}
      {mobileSlot ? createPortal(sp, mobileSlot) : null}
    </>
  );
}

/** portal の行き先。無ければ null（サーバでは常に null）。 */
function useSlot(id: string): HTMLElement | null {
  return useSyncExternalStore(
    // 枠はレイアウトが常に置いているので、購読して変化を待つ必要はない
    () => () => {},
    () => document.getElementById(id),
    () => null,
  );
}

function renderAction({
  href,
  form,
  onClick,
  label,
  icon,
  pending,
  variant,
  order,
  compact,
}: {
  href?: string;
  form?: string;
  onClick?: () => void;
  label: string;
  icon: ReactNode;
  pending: boolean;
  variant: "default" | "outline" | "destructive";
  order?: string;
  compact: boolean;
}) {
  const size = compact ? "icon" : "sm";
  const text = compact ? null : label;

  if (href) {
    // 🚨 リンクに `loading` は無い（押した先で画面が変わるだけなので二重送信が起きない）。
    return (
      <Link
        href={href}
        aria-label={compact ? label : undefined}
        className={cn(buttonVariants({ variant, size }), order)}
      >
        {icon}
        {text}
      </Link>
    );
  }

  return (
    <Button
      // 🚨 `form` を渡すときは **`type="submit"`**。既定の `type` は `button` なので、
      //    付け忘れると**押しても何も起きない**（一番気づきにくい壊れ方）。
      type={form ? "submit" : "button"}
      form={form}
      onClick={onClick}
      variant={variant}
      size={size}
      loading={pending}
      aria-label={compact ? label : undefined}
      className={order}
    >
      {icon}
      {text}
    </Button>
  );
}
