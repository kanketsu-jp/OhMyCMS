import type { ReactNode } from "react";

/**
 * 一覧が **1 件も無いとき**に出す 1 行。
 *
 * ## なぜ部品にしたか（2026-08-17）
 *
 * 【数えた】`app/**` と `components/**`（`components/ui/` を除く）の `.tsx` で、
 * 「空」を `<p className="text-sm text-muted-foreground">…</p>` で描いている箇所が **13 あった**。
 * **13 箇所とも 1 文字も違わない同じマークアップ**だった
 * （users / trash / roles / rich-text / report-rooms / policy / policies /
 *  notifications / labels / item / agents / files/page.tsx / collections/page.tsx）。
 * 母集合から外れる書き方（`!x.length` / `.length ?` / `length > 0 ?`）も引いたが、
 * **そのどれも「空」は描いていなかった**。
 *
 * 🚨 **先回りで作った部品ではない**（`knowledge/decisions/every-element-must-earn-its-place.md`）。
 *   13 箇所が**既に同じ形に合意している**ので、寄せ先を用意した——という順番。
 *   逆に、**寄せ先が無かったから 13 箇所に同じ行が散った**（司令塔・2026-08-17）。
 *
 * ## 置き場所と `"use client"`
 *
 * 🚨 **`components/ui/` ではなく `components/admin/`。** これは shadcn の原始部品ではなく
 *   **この PJ の見せ方**（`error-banner.tsx` と同じ性格）なので隣に置く。
 *
 * 🚨 **`"use client"` を付けない。** `app/(admin)/admin/files/page.tsx` と
 *   `.../collections/page.tsx` は**サーバ側**でこれを描く。付けた瞬間にサーバから使えなくなる
 *   （`components/ui/button.tsx` が同じ理由で付けていない。2026-08-15 に実際に 500 を出した）。
 *
 * ## 🚨 これで描いてはいけないもの
 *
 * **「絞り込んだ結果 0 件」と「元から空」は別物**なので、**文言は呼ぶ側が分ける**
 * （`files/page.tsx` は `empty_filtered` と `empty_folder` を出し分けている。
 *  同じ「0 件」でも、次にする操作が違う）。
 *
 * 🚨 **「〜で絞り込み中／解除」の案内には使わない。** 見た目は同じだが、あれは
 * **在るものを説明する行**で、これは**無いことを言う行**。同じ場所に 2 つの意味を持たせない。
 *
 * ## 使い方
 *
 * ```tsx
 * {rows.length === 0 ? <ListEmpty>{t("empty")}</ListEmpty> : null}
 * ```
 *
 * 文字列以外（リンクを含む案内など）も渡せるように `children` で受ける。
 */
export function ListEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
