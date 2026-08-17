"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** 送信ボタンの文字 */
  submitLabel: string;
  /**
   * 送信ボタンのアイコン。
   * 🚨 **省略できるようにしない**（`DESIGN.md` §3-1「アイコンは既定に落とさない」）。
   *    共有化の 1 回目でここを外し、やりとり画面の `<Send />` が**黙って消えた**
   *    （作業者が自分で見つけて申告した）。**渡す口が無いと、寄せた瞬間に落ちる。**
   */
  submitIcon: ReactNode;
  pending: boolean;
  /** 送信ボタンの左に置くもの。 */
  before?: ReactNode;
  /** 入力欄の下に積むもの。 */
  below?: ReactNode;
  disabled?: boolean;
  textareaId?: string;
  textareaName?: string;
  textareaAriaInvalid?: boolean;
};

type ChatTextareaProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  rows?: number;
  ariaInvalid?: boolean;
};

export function ChatComposer({
  value,
  onChange,
  placeholder,
  submitLabel,
  submitIcon,
  pending,
  before,
  below,
  disabled,
  textareaId,
  textareaName,
  textareaAriaInvalid,
}: Props) {
  return (
    <>
      <ChatComposerField
        id={textareaId}
        name={textareaName}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        ariaInvalid={textareaAriaInvalid}
      />
      {below}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {before}
        <Button type="submit" loading={pending} disabled={disabled}>
          {submitIcon}
          {submitLabel}
        </Button>
      </div>
    </>
  );
}

export function ChatComposerField({
  id,
  name,
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows = 3,
  ariaInvalid,
}: ChatTextareaProps) {
  return (
    <Textarea
      id={id}
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      maxLength={20000}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      aria-invalid={ariaInvalid || undefined}
    />
  );
}
