"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ConfirmDialog, submitFormById, type ConfirmSpec } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowOption = {
  label: string;
  icon?: ReactNode;
  /** 押したときに送る form の id（サーバへ POST する行で使う）。`onSelect` とは排他。 */
  formId?: string;
  /** 押したときに走らせる処理（クライアントで消す行で使う）。`formId` とは排他。 */
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /**
   * 渡すと、押したときに**確認を挟む**（`knowledge/decisions/confirm-by-reversibility-and-reach`）。
   *
   * 🚨 **既定は確認なし**（渡さなければ、いままでと 1 文字も変わらない）。
   * 🚨 **「これは危ない」を部品が決めない**——**呼ぶ側が渡したときだけ**出す（司令塔の条件①）。
   */
  confirm?: ConfirmSpec;
};

/**
 * 表の**行**の「その他」メニュー（▾）。
 *
 * 🚨 **基準: 行の操作が 1 つならそのまま出す。2 つ以上なら、破壊的なほうをこの中へ。**
 *    （`knowledge/decisions/action-button-and-edit-mode.md`。堀池さん 283 A
 *      「主アクションを別のものにし、削除はオプションへ」を**行へ延ばしたもの**）
 *    理由は 283 A と同じで、**押し間違いを減らす**こと。
 *    🚨 **操作が 1 つしかない行をここへ入れないこと。**
 *    項目が 1 つだけのメニューは、押す回数が 1 → 2 に増えて隠れるだけになる。
 *
 * 🚨 **この部品を作った理由は「同じ形を 3 か所へ書き写さない」ため。**
 *    ゴミ箱（`trash-manager.tsx`）が先に持っていた形を、そのまま部品にしてある。
 *    見た目を変えるときは**ここだけ**を変える。
 *
 * 🚨 **項目は必ず `DropdownMenuItem`**（素の `<button>` は矢印キーの輪に入らない。
 *    `file-tile-menu.tsx` に同じ注記がある）。
 */
export function RowOptions({ label, options }: { label: string; options: RowOption[] }) {
  // 🚨 **どの項目が確認待ちか**を、メニューの外で持つ。
  //    Radix の `DropdownMenu` は項目を選ぶと閉じるので、
  //    ダイアログを項目の中に置くと**開く前に外れる**（`confirm-dialog.tsx` の申し送り）。
  const [pending, setPending] = useState<RowOption | null>(null);

  const run = (option: RowOption) => {
    if (option.onSelect) {
      option.onSelect();
      return;
    }
    if (option.formId) submitFormById(option.formId);
  };

  if (options.length === 0) return null;

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="outline" aria-label={label}>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.label}
            variant={option.destructive ? "destructive" : undefined}
            disabled={option.disabled}
            // 🚨 `formId` のときは `<form>` を submit する。`type="submit" form="..."` を
            //    使わないのは、`DropdownMenuItem` が `<div role="menuitem">` を描くため
            //    （form 属性はボタンにしか効かない）。
            onSelect={() => {
              // 🚨 確認が要る項目は、ここでは実行しない（閉じたあとにダイアログを出す）。
              if (option.confirm) {
                setPending(option);
                return;
              }
              run(option);
            }}
          >
            {option.icon}
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
    <ConfirmDialog
      spec={pending?.confirm ?? null}
      onClose={() => setPending(null)}
      onConfirm={() => {
        if (pending) run(pending);
      }}
    />
    </>
  );
}
