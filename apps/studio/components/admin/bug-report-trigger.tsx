"use client";

import type { ButtonHTMLAttributes } from "react";

import { MessageSquarePlus } from "lucide-react";

import { BugReportComposer } from "@/components/admin/bug-report-composer";
import { useRightPanel } from "@/components/admin/right-panel";
import { cn } from "@/lib/utils";

type Props = {
  /** 行に出す文字。辞書は呼ぶ側（layout.tsx）が引く */
  label: string;
};

/**
 * ユーザーメニューの「報告する」。**リンクではない。**
 *
 * 🚨 **2026-08-17: 置き場所が変わった。** 元は左サイドバーの組に在ったが、
 *    I1 でその組ごと消え、いまは `user-menu.tsx` の `DropdownMenuItem asChild` の子**だけ**
 *    （実測: `BugReportTrigger` を import しているのは user-menu.tsx の 1 本）。
 *    下の 2026-08-15 の原文は**そのときの経緯**として残す（消すと、なぜ右パネルへ積むのかが失われる）。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「不具合報告は左サイドバーにあって、アコーディオンにして『報告する』『報告一覧』があり、
 * >   **前者はすぐに報告できるようにします。これはモーダルにするという意味です。
 * >   どんな画面でも開ける。ただしそれは SP の話で、PC の場合は右サイドバーに表示させます。**」
 *
 * 🚨 **SP と PC の出し分けはここでは書かない。** `useRightPanel().push()` が
 *    PC なら右サイドバーへ積み、SP なら画面いっぱいのモーダルとして出す
 *    （shell の `right-panel.tsx` が引き受ける）。ここで分岐を書くと、
 *    同じ判断が 2 箇所に生まれる。
 *
 * 🚨 **戻るボタンも描かない。** 積んだぶんの「戻る」は右サイドバー側が出す
 *    （堀池さん「報告した後は戻るボタンで一つ前の表示に戻る」）。
 *
 * 🚨 送り終わったら `pop()` で 1 つ前へ戻す。**閉じない**——
 *    右サイドバーは元々そのページの説明を出していた面なので、
 *    報告のために横入りしたぶんだけ戻すのが元の状態。
 */
// 🚨 2026-08-17: `DropdownMenuItem asChild` の子として使うようになった（I1）。
//    そのとき親は `role="menuitem"` や `data-*` を **props で渡してくる**ので、
//    受け取って `<button>` へ流さないと **メニュー項目として認識されない**
//    （実測: 見た目は出るが `[role=menuitem]` に数えられず、鍵で辿れなかった）。
export function BugReportTrigger({ label, className, ...rest }: Props & ButtonHTMLAttributes<HTMLButtonElement>) {
  const panel = useRightPanel();

  return (
    <button
      type="button"
      {...rest}
      onClick={() =>
        panel.push({
          key: "bug-report",
          titleKey: "reports.create_title",
          node: <BugReportComposer onDone={() => panel.pop()} />,
        })
      }
      // 🚨 **親から来る className を握りつぶさない。** ここが O1 の真因だった。
      //    `DropdownMenuItem asChild` は Radix の Slot 経由で**自分の class を子へ渡す**。
      //    以前は `{...rest}` のあとに `className="…"` を書いていたので、**渡された class が上書き**され、
      //    この項目だけ `flex items-center gap-1.5 px-1.5` も文字色も**当たっていなかった**。
      //    実測（2026-08-17・堀池さんの指摘 O1）:
      //      直す前 … class は自前の 1 本だけ／アイコンの左端 24px（他は 18px）／文字は中間のグレー
      //      🚨 押せなかったのではない（`aria-disabled` も `disabled` も無し）。**当たっていなかった**
      //    🚨 `className` を消すだけでも直らない（実測: class が `w-full` だけになり、左端 12px・高さ 43px）。
      //      **消すのではなく、`cn()` で混ぜる**のが正しい。
      className={cn(className, "w-full")}
    >
      <MessageSquarePlus className="size-4 shrink-0" />
      {label}
    </button>
  );
}
