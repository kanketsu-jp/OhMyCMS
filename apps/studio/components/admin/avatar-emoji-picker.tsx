"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

import { AVATAR_EMOJIS } from "@/lib/admin/avatar-emojis";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

/**
 * 絵文字の格子（**Dialog を含まない**）。個人設定画面にそのまま置ける部品。
 *
 * 🚨 **面を増やさない**（憲章 §3b）。ボーダー・背景色・影・角丸をこの部品自身は持たない。
 * 置き場所の器（個人設定画面側）が面を持つ。
 *
 * 🚨 「既定に戻す」ボタンは無い。既定の 🙂 が `AVATAR_EMOJIS` に入っているので、
 * それを押せば同じことが1タップでできる（`every-element-must-earn-its-place`）。
 *
 * 由来: アイコン変更はメニューのダイアログから個人設定画面へ移設され（オーナー指示）、
 * ダイアログ版の入口（`AvatarEmojiPicker`）は呼び出し元が0件になったため削除した
 * （実測: AvatarEmojiPicker importers 0, AvatarEmojiGrid importers 1）。
 */
type GridProps = {
  current: string;
};

export function AvatarEmojiGrid({ current }: GridProps) {
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
          className="relative flex aspect-square items-center justify-center rounded-lg text-2xl hover:bg-accent active:bg-accent disabled:opacity-50"
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
