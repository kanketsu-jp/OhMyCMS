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
        <div
          {...menu.handlers}
          /**
           * 🚨 **既定の長押しを止めるのは、掴む対象（このタイル）だけ**にする。
           *    一覧全体に掛けると、次のものを一緒に殺す:
           *      `touch-action: none`  → **一覧がスクロールできなくなる**
           *      `user-select: none`   → **ファイル名がコピーできなくなる**
           *    ここでは**タイルの中の文字が選ばれない**ところまでにとどめる。
           *
           * 🚨 `-webkit-touch-callout: none` は **iOS 専用**（Android には効かない）。
           *    「画像を長押しで保存」の既定メニューを止めるのが目的で、
           *    **Android 側は `contextmenu` の抑止で対応している**（フック側）。
           *
           * 🚨 **`touch-action` はここに書かない。** この要素は `display: contents` で
           *    **ボックスを作らない**ので、**継承しない性質の `touch-action` は効かない**
           *    （書いても何も起きないのに、書いた人は効いたつもりになる）。
           *    `user-select` と `-webkit-touch-callout` は**継承する**ので、子のタイルに伝わる。
           *    `contents` を外せば `touch-action` も書けるが、**グリッドの並びが崩れる**
           *    （タイルは grid の直接の子である必要がある）ので、そちらは取らない。
           *
           * 🚨 **実機で確かめるまで「効いた」と書かない。** headless では
           *    iOS Safari の callout は再現できない。
           */
          className="contents select-none [-webkit-touch-callout:none]"
        >
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
