"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { useLongPressMenu } from "@/components/admin/use-long-press-menu";
import { TileLabelsMenu } from "@/components/admin/tile-labels-menu";

/**
 * ファイル1件ぶんの「右クリック / 長押し」メニュー。
 *
 * 🚨 **タイルごとに1つ持つ**。1つのメニューを使い回して「いまどれを触っているか」を
 *    別の状態で持つと、**閉じる前に別のタイルを長押ししたときに対象がずれる**。
 *
 * 🚨 **項目は必ず `DropdownMenuItem`**。素の `<button>` を置くと**矢印キーの輪に入らない**
 *    （design が実測済み）。`DropdownMenuLabel` は `DropdownMenuGroup` の外に置くと落ちる。
 */
export function FileTileMenu({
  fileId,
  children,
}: {
  fileId: string;
  /** タイルの中身。ここに長押し・右クリックの受け口を付ける。 */
  children: React.ReactNode;
}) {
  const t = useT("files");
  const router = useRouter();
  const menu = useLongPressMenu();

  const remove = useSubmitOnce(async () => {
    const response = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error(response.status === 403 ? t("error_forbidden") : t("error_delete_failed"));
      return;
    }
    toast.success(t("deleted"));
    router.refresh();
  });

  return (
    <DropdownMenu open={menu.open} onOpenChange={(next) => (next ? undefined : menu.close())}>
      {/*
        🚨 `asChild` にして**タイルそのものを起点**にする。別途トリガーのボタンを置くと、
           タイルの中に押せるものが2つになり、長押しの対象が曖昧になる。
      */}
      {/*
        🚨 **`asChild` に直接ハンドラを載せる。中間の `<div>` を作らない。**
           以前は `<div className="contents">` を挟んでいたが、
           **`display: contents` の要素はボックスを作らない**ので
           `getBoundingClientRect()` が **0×0 / (0,0)** を返す。
           Radix はトリガーの矩形にメニューを合わせるため、
           **メニューが画面の左上に出ていた**（堀池さん報告・2026-08-15）。
           実測: この画面のトリガー 25 個のうち **23 個が contents かつ 0×0**
           （🟢 対照: 実座標を持つ 2 個は別のメニュー）。
        🚨 **同じコメントの中で「ボックスを作らない」と自分で書いていたのに、
           メニューの起点への影響に繋げていなかった。**
        🚨 中間要素を消しても `user-select` / `-webkit-touch-callout` は効く。
           `asChild` がタイルへ**直接**載せるので、継承に頼らない分むしろ確実。
      */}
      <DropdownMenuTrigger
        asChild
        {...menu.handlers}
        className="select-none [-webkit-touch-callout:none]"
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              menu.close();
              router.push(`/admin/files/${fileId}`);
            }}
          >
            <ExternalLink />
            {t("menu_open_detail")}
          </DropdownMenuItem>
          <TileLabelsMenu endpoint={"/api/files/" + fileId + "/labels"} />
          <DropdownMenuItem
            variant="destructive"
            className="text-destructive"
            disabled={remove.pending}
            onClick={() => {
              menu.close();
              void remove.run();
            }}
          >
            <Trash2 />
            {t("menu_delete")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
