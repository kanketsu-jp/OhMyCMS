import type { ComponentProps } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonGroupVariants = cva(
  "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

type ButtonGroupBaseProps = ComponentProps<"div">;

type ButtonGroupProps = ButtonGroupBaseProps & {
  orientation?: "horizontal" | "vertical";
};

/**
 * 主操作とそのオプションを隙間なく束ねるボタングループ。
 *
 * 🚨 触るときの注意:
 * - オプションがある操作は、単独ボタンを離して並べずこの部品で接続する（DESIGN.md §2-1）。
 * - 子の角丸と境界線を自動で調整するため、呼び出し側で個別に打ち消さない。
 *
 * 参考: DESIGN.md §2-1 ／ knowledge/decisions/action-button-and-edit-mode.md
 */
function ButtonGroup({
  className,
  orientation,
  ...props
}: ButtonGroupProps) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

export { ButtonGroup };
