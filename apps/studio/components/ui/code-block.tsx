import * as React from "react";

import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

type CodeBlockProps = {
  value: string;
  targetId: string;
  title?: React.ReactNode;
  className?: string;
  preClassName?: string;
  codeClassName?: string;
};

/**
 * コードや外部ツールへ写す値を表示する。
 *
 * 🚨 2026-08-15: **見た目を付けた。** それまで「余白は持つが、面は作らない」としており、
 * 実測でも **背景 rgba(0,0,0,0) / 罫線 0px / 角丸 0px** だった。
 * 堀池さん（原文）:「**MCP の画面のコードブロックは実装されていない**」——
 * **部品には寄っていたが、利用者からは等幅の文字が流れているだけに見えていた。**
 * ＝ **使われていることは、見えていることではない。**
 *
 * ## なぜ「背景だけ」で、罫線を足さないか
 * 面の規約（`knowledge/decisions/no-nested-surfaces.md`・`surface-rules` §2-1）は
 * **罫線・背景・影のうち 1 つだけ**を使うと決めている。ここは面の**中**に置かれるので、
 * 罫線を足すと**面の中に面がある**形（＝入れ子）に見える。背景だけなら段が増えない。
 * 🚨 罫線を足したくなったら、先に面の監査（`scripts/audit-surface-depth.mjs`）を通すこと。
 *
 * ## 横に長いコード
 * 横スクロールは **この `pre` の中だけ**で起きる（`overflow-x: auto`）。
 * 🚨 **ページ全体が横に動いてはいけない。** 実測で確かめること
 * （`documentElement.scrollWidth - clientWidth` が 0 のまま）。
 *
 * 🚨 **`overflow-x-auto` を外すと壊れる。数字で残す**（2026-08-15 実測）:
 *   外した状態  SP の `/admin/settings/mcp` で **あふれ = 217px**（ページが横に伸びた）
 *   戻した状態  `/admin/settings/mcp`・`/settings/agents`・`/settings/policies/<id>`
 *               すべて SP / PC とも **あふれ = 0px**
 *   ＝ 外れていても**その画面を開かなければ気づかない**ので、消す前にこの数字を思い出すこと。
 */
export function CodeBlock({
  value,
  targetId,
  title,
  className,
  preClassName,
  codeClassName,
}: CodeBlockProps) {
  return (
    <div data-slot="code-block" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {title ? <h2 className="font-heading text-base leading-snug font-medium">{title}</h2> : null}
        <CopyButton value={value} selectTargetId={targetId} data-copy-target={targetId} />
      </div>
      <pre
        id={targetId}
        className={cn(
          // 🚨 背景だけで「コードブロック」を表す（罫線と併用しない。上の JSDoc の理由）。
          //    余白は横も持つ。横が 0 だと、背景が文字にぴったり付いて「箱」に見えない。
          "min-w-0 overflow-x-auto scroll-fade-x rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-5",
          preClassName,
        )}
      >
        <code className={cn("whitespace-pre", codeClassName)}>{value}</code>
      </pre>
    </div>
  );
}
