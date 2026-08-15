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
 * コードや外部ツールへ写す値を表示する。余白は持つが、面は作らない。
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
          "min-w-0 overflow-x-auto scroll-fade-x py-2 font-mono text-xs leading-5",
          preClassName,
        )}
      >
        <code className={cn("whitespace-pre", codeClassName)}>{value}</code>
      </pre>
    </div>
  );
}
