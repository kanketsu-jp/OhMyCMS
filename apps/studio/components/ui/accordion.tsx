"use client"

/**
 * 開閉。`@shadcn/accordion`（registry: radix-vega）を写したもの。**自作していない**（憲章 §2）。
 * registryDependencies も npm の依存も無い。
 *
 * registry から変えたのは1点だけ:
 *   IconPlaceholder（registry 内部の部品で、このリポジトリには無い）を lucide-react に置換。
 *   🚨 英語リテラルは元から無いので、辞書へ逃がすものは無かった。
 */
import * as React from "react"
import { Accordion as AccordionPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

type AccordionProps = Omit<
  React.ComponentProps<typeof AccordionPrimitive.Root>,
  "type" | "value" | "defaultValue" | "onValueChange"
> & {
  type?: "single" | "multiple"
  value?: string | string[]
  defaultValue?: string | string[]
  onValueChange?: (value: string | string[]) => void
}

function Accordion({
  className,
  type = "multiple",
  ...props
}: AccordionProps) {
  const rootClassName = cn("flex w-full flex-col", className)

  if (type === "single") {
    return (
      <AccordionPrimitive.Root
        data-slot="accordion"
        className={rootClassName}
        {...(props as Extract<
          React.ComponentProps<typeof AccordionPrimitive.Root>,
          { type: "single" }
        >)}
        type="single"
      />
    )
  }

  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={rootClassName}
      {...(props as Extract<
        React.ComponentProps<typeof AccordionPrimitive.Root>,
        { type: "multiple" }
      >)}
      type="multiple"
    />
  )
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("not-last:border-b", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          // 🚨 **指で押せる高さをここで与える。**写したままだと文字の分（22px）しか無く、
          // SP で憲章 §7 の 44px を大きく割る（実測）。
          // 使う側で1つずつ足すと、次に accordion を使う人が必ず忘れる（§6 共通部品側で持つ）。
          // 🚨 `h-` ではなく `min-h-`。見出しが2行になったときにはみ出すため。
          "min-h-(--control-h) md:min-h-(--control-h-pc)",
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          className="pointer-events-none shrink-0 group-data-[state=open]/accordion-trigger:hidden"
        />
        <ChevronUpIcon
          data-slot="accordion-trigger-icon"
          className="pointer-events-none hidden shrink-0 group-data-[state=open]/accordion-trigger:inline"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-open:animate-accordion-down data-closed:animate-accordion-up"
      {...props}
    >
      <div
        className={cn(
          "h-(--radix-accordion-content-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
