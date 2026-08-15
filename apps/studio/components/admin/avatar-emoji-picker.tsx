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

type Props = {
  /** いま選ばれている絵文字（既定 🙂 まで解決済み）。押されたボタンに `✓` を出すのに使う。 */
  current: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * アカウント行のメニューから開く、アバター絵文字の選択ダイアログ。
 *
 * 🚨 **面は1段まで**（憲章 §3b）。このダイアログは `UserMenu` のメニューを閉じてから
 * 開く（`DropdownMenuItem` の `onSelect` で state を立て、メニューの外側にある
 * この Dialog を開く形。詳細は `user-menu.tsx` 側）。
 *
 * 🚨 「既定に戻す」ボタンは無い。既定の 🙂 が `AVATAR_EMOJIS` に入っているので、
 * それを押せば同じことが1タップでできる（`every-element-must-earn-its-place`）。
 */
export function AvatarEmojiPicker({ current, open, onOpenChange }: Props) {
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
      onOpenChange(false);
    },
    (emoji) => emoji,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("avatar_dialog_title")}</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
