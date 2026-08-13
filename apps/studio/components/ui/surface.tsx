"use client";

/**
 * 面（Surface）— 罫線・背景・影のいずれかを持つ「区切り」を出す唯一の入口。
 *
 * ルール: docs/design/surface-rules.md
 *   面はレベル1まで。レベル2 を作らない。
 *   面の中の入力欄は境界を持たない。余白は外側の器が持つ。
 *   SP ではカードにせず、上下の Divider だけで区切る。
 *
 * 🚨 **このファイルが「気をつける」を「構造で守る」に変える仕組みそのもの。**
 * 部品ごとには正しく作られていても、組み合わせで破れるのがこの問題の性質なので、
 * レビューではなく実行時に検出する。
 *
 *   1. 面の深さを Context で持ち回る
 *   2. 深さ2以上で面を作ろうとしたら開発時に警告し、**実際に面を出さない**（自動で降格する）
 *   3. 入力系は useInsideSurface() を見て、面の中なら罫線を外す
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/** 現在の面の深さ。0 = ページ本体（レベル0）。 */
const SurfaceDepthContext = React.createContext(0);

/** いま面の中にいるか（レベル1以上か）。入力系がこれを見て境界を落とす。 */
export function useInsideSurface(): boolean {
  return React.useContext(SurfaceDepthContext) > 0;
}

export function useSurfaceDepth(): number {
  return React.useContext(SurfaceDepthContext);
}

type SurfaceProps = React.ComponentProps<"section"> & {
  /**
   * 面の見せ方。**罫線・背景・影のうち1つだけ**を選ぶ（surface-rules.md §2-1）。
   * - "outline" … 罫線（既定）
   * - "muted"   … 背景色のみ（罫線なし）
   * - "plain"   … 面を出さない（余白だけ）
   */
  tone?: "outline" | "muted" | "plain";
  /**
   * 余白を自分で持つか。既定は持つ。
   * 🚨 中身の側は余白を持たないこと（surface-rules.md §2-3）。
   */
  padded?: boolean;
};

/**
 * 🚨 **余白を持つ。** 中に入れる要素は自分で padding を持たないこと。
 *
 * SP（コンテナ幅が狭いとき）は罫線・角丸を出さず、上下の Divider だけになる
 * （surface-rules.md §2-4。堀池指示「SP の場合はカードタイプではなく上下の Divider のみでいい」）。
 */
export function Surface({
  className,
  tone = "outline",
  padded = true,
  children,
  ...props
}: SurfaceProps) {
  const depth = React.useContext(SurfaceDepthContext);
  const nested = depth > 0;

  if (nested && process.env.NODE_ENV !== "production") {
    // 開発者向けの警告なので英語で書く（利用者に出る UI 文言ではない）。
    // 日本語で書くと i18n のハードコード検出器が拾ってしまう（実測で受入 #7 が落ちた）。
    console.warn(
      `[surface] Nested Surface detected (level ${depth + 1}). ` +
        "A surface must not contain another surface. " +
        "Use <SurfaceDivider> to separate sections instead. " +
        "This Surface renders without its own border/background. " +
        "See docs/design/surface-rules.md",
    );
  }

  // 入れ子は面を出さない。降格させることで「気づかないまま3重罫線」が構造的に起きない。
  const effectiveTone = nested ? "plain" : tone;

  return (
    <SurfaceDepthContext value={depth + 1}>
      {/*
        🚨 器と面を分ける。**要素は自分自身のコンテナクエリに反応できない**ので、
        外側の div でコンテナを宣言し、内側の section が @md/surface: に反応する。
        （1枚にまとめると SP スタイルのまま固定される。実測で確認済み）
      */}
      <div className="@container/surface min-w-0">
        <section
          data-slot="surface"
          data-surface-depth={depth + 1}
          data-surface-tone={effectiveTone}
          className={cn(
            "flex min-w-0 flex-col gap-4",
            padded && !nested && "px-0 py-4 @md/surface:p-4",
            // SP（狭い器）ではカードにせず上下の Divider だけ。@md 以上で初めて面になる。
            effectiveTone === "outline" &&
              "border-y border-border @md/surface:rounded-xl @md/surface:border",
            effectiveTone === "muted" && "@md/surface:rounded-xl @md/surface:bg-muted/40",
            className,
          )}
          {...props}
        >
          {children}
        </section>
      </div>
    </SurfaceDepthContext>
  );
}

/**
 * 面の中の区切り。**面を増やさずに**セクションを分けるための唯一の手段。
 * 「レベル1 の中にもう1つ区切りが要る」と思ったらこれを使う（surface-rules.md §2-1）。
 */
export function SurfaceDivider({ className, ...props }: React.ComponentProps<"hr">) {
  return (
    <hr
      data-slot="surface-divider"
      className={cn("border-0 border-t border-border", className)}
      {...props}
    />
  );
}

/** 面の見出し。**余白を持たない**（外側の Surface が持つ）。 */
export function SurfaceTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="surface-title"
      className={cn("font-heading text-base leading-snug font-medium", className)}
      {...props}
    />
  );
}

/** 面の説明文。**余白を持たない**。 */
export function SurfaceDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="surface-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
