"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { SHORTCUTS } from "@/components/admin/shortcuts";
import { useShortcut } from "@/components/admin/use-shortcut";
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
  /**
   * まだ押させない。**憲章 §3c「未入力なら確定ボタンを無効にする」**（薄くするのでなく `disabled`）。
   *
   * 🚨 `pending` とは別物。`pending` は「いま実行中」、`disabled` は「そもそも内容が足りない」。
   *    2026-08-15、ヘッダーへ移す作業で **内容に基づく判定が3画面で消えた**
   *    （SSO の `!ready` / ストレージの `!dirty` / 権限付与の「対象が0件」）。
   *    prop が無いと表現できないので、置き換え先として足した。
   */
  disabled?: boolean;
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
  disabled = false,
}: Props) {
  const headerSlot = useSlot("header-primary-action");
  const mobileSlot = useSlot("mobile-primary-action");

  const variant = destructive ? "destructive" : role === "secondary" ? "outline" : "default";
  // 🚨 補助は**必ず主要の左**に出す。portal は mount の順に並ぶので、
  //    ページが補助を先に描くか後に描くかで左右が入れ替わってしまう。
  //    順番をページに委ねず、ここで決める。
  const order = role === "secondary" ? "order-first" : undefined;

  useShortcut(
    SHORTCUTS.save,
    () => {
      // 🚨 `disabled` はボタンだけでなく**ここでも**見る。見ないと、押せないボタンの
      //    ぶんまで ⌘S が送ってしまい、「画面では止まっているのに保存される」ことになる。
      if (!form || role !== "primary" || pending || disabled) return;

      const target = document.getElementById(form);
      if (!(target instanceof HTMLFormElement)) return;

      // 実測 2026-08-15: ブラウザで要求の本数を数えて確認済み（見た目では判定していない）。
      // 項目のフォームに焦点→保存で POST /admin/actions/items/... が1本。
      // 検索ダイアログに焦点→0本（ガード①）。右パネルの報告フォームに焦点→0本（ガード②）。
      // 🚨 ガード②のときダイアログは開いていない。PC の右パネルはダイアログではないので
      //    ガード①だけでは防げず、両方が要る。
      // 🚨 「正しい側で1本」も対で測る。ガードだけ見ると、何も起きない実装でも0本で緑に見える。

      // 開いているダイアログがあるなら、その中の話。裏のページを保存しない。
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      // PC の右パネルはダイアログではない。別フォームに焦点があればそちらを優先する。
      const active = document.activeElement;
      const activeForm = active instanceof Element ? active.closest("form") : null;
      if (activeForm && activeForm !== target) return;

      target.requestSubmit();
    },
    { whileTyping: true },
  );

  // PC: 文字つき。SP: アイコンだけ（行の中の操作と同じで、文脈は画面が持っている）
  const pc = renderAction({
    href,
    form,
    onClick,
    label,
    icon,
    pending,
    disabled,
    variant,
    order: cn(order, "hidden md:inline-flex"),
    compact: false,
  });
  const sp = renderAction({ href, form, onClick, label, icon, pending, disabled, variant, order, compact: true });

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
  disabled,
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
  disabled: boolean;
  variant: "default" | "outline" | "destructive";
  order?: string;
  compact: boolean;
}) {
  const size = compact ? "icon" : "sm";
  const text = compact ? null : label;

  if (href) {
    // 🚨 リンクに `loading` は無い（押した先で画面が変わるだけなので二重送信が起きない）。
    // 🚨 `disabled` も同じく効かない。**行き先があるなら押せないという状態は無い**ので、
    //    リンクに `disabled` を渡す設計にしない（渡しても黙って無視される、を避けるための申し送り）。
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
      disabled={disabled}
      aria-label={compact ? label : undefined}
      className={order}
    >
      {icon}
      {text}
    </Button>
  );
}
