"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

import { AVATAR_EMOJIS } from "@/lib/admin/avatar-emojis";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

type PickerProps = {
  /** いま選ばれている絵文字（既定 🙂 まで解決済み）。押されたボタンに `✓` を出すのに使う。 */
  current: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * 絵文字の格子だけ（**Dialog を含まない**）。個人設定画面にそのまま置ける部品。
 *
 * 🚨 **面を増やさない**（憲章 §3b）。ボーダー・背景色・影・角丸をこの部品自身は持たない。
 * 置き場所の器（個人設定画面 / この下の `AvatarEmojiPicker` が包む `DialogContent`）が面を持つ。
 *
 * 🚨 「既定に戻す」ボタンは無い。既定の 🙂 が `AVATAR_EMOJIS` に入っているので、
 * それを押せば同じことが1タップでできる（`every-element-must-earn-its-place`）。
 */
type GridProps = {
  current: string;
  /**
   * 保存に成功したときだけ呼ぶ（省略可）。ダイアログから使うときは
   * `AvatarEmojiPicker` がこれで `onOpenChange(false)` を渡し、閉じる。
   * 個人設定画面に直接置くときは渡さない＝閉じるものが無いので何も起きない。
   * 🚨 失敗時は呼ばない（トーストだけ出してダイアログは開いたまま＝やり直せる）。
   */
  onSaved?: () => void;
};

export function AvatarEmojiGrid({ current, onSaved }: GridProps) {
  const t = useT("nav");
  const router = useRouter();

  // 🚨 行ごとの操作（絵文字ボタン）なので keyOf を渡す。省くと1個押している間、
  // 他の絵文字が全部押せなくなる（use-submit-once.ts のコメント参照）。
  const select = useSubmitOnce(
    async (emoji: string) => {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarEmoji: emoji }),
      });

      if (!response.ok) {
        // 出来事はトースト。文言はサーバでハードコードしないので、辞書側の一般文言で受ける。
        toast.error(t("avatar_error"));
        return;
      }

      router.refresh();
      onSaved?.();
    },
    (emoji) => emoji,
  );

  return (
    <div className="grid grid-cols-6 gap-2">
      {AVATAR_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={select.isPending(emoji)}
          onClick={() => void select.run(emoji)}
          className="relative flex aspect-square items-center justify-center rounded-lg text-2xl hover:bg-accent disabled:opacity-50"
        >
          {emoji}
          {/* 🚨 現在地は塗りでなく `✓`（憲章 §3b）。塗ると面が増える。 */}
          {emoji === current ? (
            <Check className="absolute top-0.5 right-0.5 size-3" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

/**
 * アカウント行のメニューから開く、アバター絵文字の選択ダイアログ。
 *
 * 🚨 **面は1段まで**（憲章 §3b）。このダイアログは `UserMenu` のメニューを閉じてから
 * 開く（`DropdownMenuItem` の `onSelect` で state を立て、メニューの外側にある
 * この Dialog を開く形。詳細は `user-menu.tsx` 側）。
 *
 * 中身は `AvatarEmojiGrid` を呼ぶだけの薄い包み。格子そのものの挙動（送信・トースト・
 * `✓` の出し方）はそちらに書いてある。
 */
export function AvatarEmojiPicker({ current, open, onOpenChange }: PickerProps) {
  const t = useT("nav");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("avatar_dialog_title")}</DialogTitle>
        </DialogHeader>
        <AvatarEmojiGrid current={current} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
