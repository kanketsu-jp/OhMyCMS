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
      <DropdownMenuTrigger asChild>
        <div {...menu.handlers} className="contents">
          {children}
        </div>
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
