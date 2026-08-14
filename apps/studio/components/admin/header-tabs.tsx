"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** ヘッダー直下のタブの置き場所。`layout.tsx` が枠を置き、ページが中身を差し込む。 */
export const HEADER_TABS_SLOT_ID = "header-tabs";

/**
 * ヘッダーの直下に**そのページのタブ**を出す。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「ヘッダーの直下にはタブが表示できるようにする。このタブは
 * >   **そのページで下層ページにせず、切り替えて表示する場合**のもの。**ない場合もある**。」
 *
 * 使い方（ページ側）:
 * ```tsx
 * <Tabs defaultValue="open">
 *   <HeaderTabs>
 *     <TabsList>
 *       <TabsTrigger value="open">{t("unresolved")}</TabsTrigger>
 *       <TabsTrigger value="done">{t("resolved")}</TabsTrigger>
 *     </TabsList>
 *   </HeaderTabs>
 *   <TabsContent value="open">…</TabsContent>
 * </Tabs>
 * ```
 *
 * 🚨 **`<Tabs>` はページ側に置いたままでよい。** React の portal は DOM の行き先を
 *    変えるだけで**React の木は繋がったまま**なので、`TabsList` をヘッダーへ飛ばしても
 *    `Tabs` の文脈（どのタブが選ばれているか）は届く。
 *    ❌ `Tabs` ごとヘッダーへ持っていかないこと（`TabsContent` が本文に置けなくなる）。
 *
 * 🚨 タブが無いページでは**枠ごと高さを持たない**。`layout.tsx` の枠は空のとき
 *    罫線も余白も出さない（空の帯が全ページに残ると、無いページで邪魔になる）。
 */
export function HeaderTabs({ children }: { children: ReactNode }) {
  // 🚨 SSR には `document` が無い。`useEffect` + `setState` にすると
  //    React Compiler の lint が error にする（`page-action.tsx` に同じ申し送り）。
  const slot = useSyncExternalStore(
    () => () => {},
    () => document.getElementById(HEADER_TABS_SLOT_ID),
    () => null,
  );

  return slot ? createPortal(children, slot) : null;
}
