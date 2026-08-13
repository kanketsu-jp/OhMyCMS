"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";

type Props = {
  id: string;
  name: string;
  defaultValue: string;
};

/** `<input type="color">` は `#rrggbb` しか受け取らない。`#fff` を展開し、読めなければ黒に倒す。 */
function toPickerValue(raw: string): string {
  const value = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#000000";
}

/**
 * アクセント色の入力。**OS のカラーピッカー**と16進の手入力を並べ、双方向で同期する。
 *
 * 🚨 **自作のピッカーを作らない。** shadcn にカラーピッカーは無い（471件を棚卸し済み）。
 * ネイティブの `<input type="color">` なら**モバイルでもちゃんとしたピッカーが出る**。
 *
 * 🚨 **色見本を罫線で囲まない**（面が1段増える。憲章 §1）。塗りだけで示す。
 *
 * 手入力を残すのは、**ブランド色は普通コードで渡される**から（「#1D9BF0 にして」と言われる）。
 * ピッカーだけにすると、持っている値を入れられない。
 */
export function ColorField({ id, name, defaultValue }: Props) {
  const t = useT("settings");
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="flex items-center gap-2">
      {/* 🚨 name を持たせない。送信するのは下の手入力のほうで、二重に送らない */}
      <input
        type="color"
        aria-label={t("project_color_picker_label")}
        value={toPickerValue(value)}
        onChange={(event) => setValue(event.target.value)}
        className="size-(--control-h) shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0 md:size-(--control-h-pc)"
      />
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="font-mono"
        spellCheck={false}
      />
    </div>
  );
}
