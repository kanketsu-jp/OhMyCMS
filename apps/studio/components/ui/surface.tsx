"use client";

/**
 * 面（Surface）— 罫線・背景・影のいずれかを持つ「区切り」を出す唯一の入口。
 *
 * ルール: knowledge/decisions/no-nested-surfaces.md
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
/**
 * 🚨 **面の深さを配る器。`Surface` 以外からも使う。**
 * ダイアログやポップオーバーは `bg-popover` を持つので**それ自体が面**だが、
 * `Surface` ではないので、中の入力が「面の外」と判断して罫線を選んでしまう。
 * 実測（2026-08-15）: ダイアログを開くと中の Input が罫線を持ち、面の深さが2になった。
 * → 浮いた面を作る部品は、ここから深さ1を配る。
 */
export const SurfaceDepthContext = React.createContext(0);

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
  // 🚨 **`padded` は 2026-08-15 に削除した。復活させないこと。**
  //    かつて `padded?: boolean`（既定 true）があり、`px-0 py-4 @md/surface:p-4` を出していた。
  //    原典（.temp/2026-08-13/idea.md:66・堀池さん原文）が否定しているのは、まさにこの余白:
  //    > 「ボーダー＋**Padding はいらない**。**親要素にすでに Padding がある**のと、
  //    >   カードコンポーネントを多用するのはデザインスキルが低い」
  //    「親が持っている」を実測で確かめてから外した（願望で外していない。§下の記録）。
  //    削除時点で `padded` を渡している呼び出しは **0 件**（app/ components/ lib/ を grep）。
};

/**
 * 🚨 **面は余白を持たない。** 上下左右とも 0 で、余白は**親（main）が持つ**。
 *
 * ## なぜ 0 なのか（2026-08-15・原典 idea.md:66 の理由をそのまま適用した）
 * 原典が Padding を否定した理由は「**親要素にすでに Padding がある**」。
 * ＝ 横だけ落として縦を残す根拠は原典に無い。**縦横とも落とすのが原典どおり**。
 *
 * ## 実測（:3102 / `/admin/profile` / `scripts/audit-surface-depth.mjs --measure`）
 * 🚨 **先に「親が本当に持っているか」を測ってから外した。**
 * ```
 * main (px-4 pt-6 pb-24 md:px-8)   SP padding 上=24 右=16 下=96 左=16
 *                                  PC padding 上=24 右=32 下=24 左=32   ← 縦横とも在る
 * 面  変更前                        SP 上16 右0  下16 左0 ／ PC 上16 右16 下16 左16
 *     Step1 @md/surface:p-4 を外す  SP 変化なし   ／ PC 右左 16→0
 *     Step2 py-4 も外す             SP・PC とも   上0 右0 下0 左0
 * ```
 * 🚨 **`--measure` の「余白」を根拠にしないこと。** あれは*文字の箱と要素の箱の差*で、
 * 子要素の margin が混ざる（main は `px-4`＝16px なのに「余白 左=24px」と出た）。
 * padding を見るなら `padding 上/右/下/左` のほうを読む。
 *
 * 面の中の section どうしの間隔は `gap-4` が持つので、padding を外しても詰まらない。
 *
 * SP・PC とも罫線・角丸は出さず、面と面のあいだの Divider だけになる
 * （surface-rules.md §2-4。堀池指示「SP の場合はカードタイプではなく上下の Divider のみでいい」／
 * PC も 2026-08-15 に同じへ揃えた）。
 */
export function Surface({
  className,
  tone = "outline",
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
        "See knowledge/decisions/no-nested-surfaces.md",
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
      {/* 🚨 幅を必ず持たせる。ここに幅が無いと、flex の子として置かれた面が **0px** になる。
          内側の section は `w-full`（＝親の幅いっぱい）なので、親が 0 なら 0 のまま。
          実際に /login が幅 0 になり、文字が1文字ずつ縦に並んだ（2026-08-13）。
          中央寄せが要る画面は、内側へ `mx-auto` を渡す（className は section に届く）。 */}
      <div data-slot="surface-container" className="@container/surface w-full min-w-0">
        <section
          data-slot="surface"
          data-surface-depth={depth + 1}
          data-surface-tone={effectiveTone}
          className={cn(
            "flex min-w-0 flex-col gap-4",
            // SP（狭い器）ではカードにせず Divider だけ。@md 以上で初めて面になる。
            // 🚨 `border-y`（上下）にすると、面を縦に並べたとき
            // **下の線と次の面の上の線で2本**になる（オーナー指摘「区切りが重複している」）。
            // 区切りは**面と面の境目に1本**あればよいので、上だけにする。
            // 1箇所直せば全ページに効く。
            effectiveTone === "outline" &&
              // 🚨 SP の `border-t` は「**面と面のあいだ**の区切り」。**先頭には引かない。**
            //    堀池（2026-08-15 原文）:
            //    > 「**ただし、2つ要素が並ぶ場合は、その間に Divider を用意する**。
            //    >   イメージとしては三項演算子で2つ以上の場合は divider-y など。」
            //    先頭にも引くと、**すぐ上のヘッダの下辺と2本並ぶ**（見出しを外して実測で発覚）。
            //    実際の出し分けは app/globals.css の `[data-slot=surface-container] + …` が持つ
            //    （自分の親の中での順番は、自分自身のクラスでは表現できないため）。
            //
            // 🚨 **2026-08-15 反転: PC でもカードにしない。**
            //    それまで `@md/surface:rounded-xl @md/surface:border` を付けており、
            //    PC では 3 枚のカードが縦に並ぶだけで **Divider が 1 本も無かった**（schema が両幅で実測）。
            //    原典（idea.md:66・堀池さん原文）が名指しで否定しているのは、まさにこの形:
            //    > 「**ボーダー＋Padding はいらない**。親要素にすでに Padding があるのと、
            //    >   **カードコンポーネントを多用するのはデザインスキルが低い**。
            //    >   **枠というのは明確な別の領域を表現する**が、…ボーダー＋角丸で
            //    >   **カードタイプにしてしまう**」
            //    🚨 design はこれを「PC はカードだから当たり前」として 2 箇所に書いていた
            //    （globals.css の隣接規則・checks-must-declare-blind-spots）。
            //    **規約と実装が食い違ったとき、実装の側を正として扱った**のが誤り。
            //    区切りは **SP と同じく「面と面のあいだに 1 本」** だけ。出し分けは globals.css が持つ。
              "border-border",
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
