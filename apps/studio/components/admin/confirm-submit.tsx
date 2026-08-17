"use client";

import { useState, type ReactNode } from "react";

import { ConfirmDialog, submitFormById, type ConfirmSpec } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * **サーバ側のフォームのまま**、確認を出してから送るボタン。
 *
 * 由来: 2026-08-17。`knowledge/decisions/confirm-by-reversibility-and-reach.md` を実装するとき、
 * **戻せない削除のうち 3 つが `<form action="/admin/actions/…" method="post">`** で、
 * `AlertDialog`（フックを使う）をそのままは入れられなかった。
 *
 * 🚨 **画面ごと client component にしない**（司令塔の案🅐）。
 *   確認のために作りを変えると、**サーバ側フォームである理由**（route handler で受ける・
 *   `redirect` で戻す・JS 無しでも動く）が全部こちらに移ってくる。
 *   → **フォームは 1 行も触らず、送信ボタンだけを client にする。**
 *
 * ## 🚨 JS が無いときに壊れないこと（**これがこの部品の肝**）
 *
 * **引き金は `type="submit"` のまま**にして、**JS が動いているときだけ既定の送信を止める**。
 * ```
 * JS 有り … 押す → 既定を止める → 確認が出る → 進めると requestSubmit()
 * JS 無し … 押す → 🚨 **そのまま送信される**（確認は出ないが、**操作はできる**）
 * 水和の前 … 同上（**壊れているのではなく、まだ強化されていない**）
 * ```
 * 🚨 **`type="button"` にすると、JS が無い人は削除できなくなる。** そこが分かれ目。
 *
 * 🚨 **ダイアログの実体はここに書かない**（`confirm-dialog.tsx` に 1 本だけ）。
 *   ▾ の項目（`PageAction` / `RowOptions`）にも同じものが要るので、
 *   **3 つ書くと、次に文面の型を直す人が 1 つ落とす**。
 */
export function ConfirmSubmit({
  formId,
  title,
  description,
  confirmLabel,
  tone = "danger",
  children,
  variant = "destructive-ghost",
  size = "sm",
  ariaLabel,
  className,
}: ConfirmSpec & {
  /** 送りたい `<form>` の id。**このボタンはその中に在っても外に在ってもよい**。 */
  formId: string;
  /** 引き金の中身（アイコン＋文言）。 */
  children: ReactNode;
  variant?: "destructive" | "destructive-ghost" | "outline" | "ghost";
  size?: "sm" | "default";
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        // 🚨 `submit` のまま。JS が無ければ、そのまま送信される（上の申し送り）。
        type="submit"
        form={formId}
        variant={variant}
        size={size}
        aria-label={ariaLabel}
        className={className}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </Button>
      <ConfirmDialog
        spec={open ? { title, description, confirmLabel, tone } : null}
        onClose={() => setOpen(false)}
        onConfirm={() => submitFormById(formId)}
      />
    </>
  );
}
