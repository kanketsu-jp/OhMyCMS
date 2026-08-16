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
    /*
     * 🚨 **玉の大きさを固定する。列数で割らない。**
     * かつて `grid grid-cols-6` だった。6 列を親の幅で割るので、**画面が広いほど玉が育つ**:
     *   【実測 2026-08-16 / `/admin/profile`】
     *     PC 1440 … 格子 768px → 玉 **121px 四方**（絵文字は 24px。**5 倍の箱**）
     *     SP  390 … 格子 358px → 玉 **53px 四方**（こちらは妥当）
     *   ＝ **同じ操作が、画面幅で 2 倍以上の大きさに変わっていた**（堀池さん指摘「余白がでかい」）
     * → `flex flex-wrap` ＋ 玉を **44px 固定**（`size-11`）。
     *   44px はこの案件のタップ最小寸法。**PC でも SP でも同じ大きさ**になる。
     */
    <div className="flex flex-wrap gap-2">
      {AVATAR_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={select.isPending(emoji)}
          onClick={() => void select.run(emoji)}
          // タッチ端末には hover が無いので、hover: だけだとこの24個の絵文字ボタンは
          // タップしても見た目が反応しない。`active:` を hover: と対で足すのはオーナー指示
          // （2026-08-15・hover: には必ず active: を対にする）に従ったもの。
          // 🚨 未検証: 実機でのタップ感触は誰も確認していない。確かめたのは生成後のCSSに
          // `:active` + `bg-accent` の組が存在すること（Tailwindに握りつぶされていないこと）だけ。
          className="relative flex size-11 shrink-0 items-center justify-center rounded-lg text-2xl hover:bg-accent active:bg-accent disabled:opacity-50"
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
