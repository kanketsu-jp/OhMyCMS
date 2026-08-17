"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Folder, MoreHorizontal, Trash2 } from "lucide-react";
import { useState, type ComponentProps, type ComponentType } from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { DRAG_FILE_MIME } from "@/components/admin/files-drag";
import { TileLabelsMenu } from "@/components/admin/tile-labels-menu";
import { useT } from "@/i18n/client";
import { errorKeyFromPayload } from "@/i18n/error";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
  color: string | null;
};

type MenuItemComponent = ComponentType<ComponentProps<typeof DropdownMenuItem>>;

type FolderTileProps = {
  folder: FolderRow;
  isDropTarget: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  removePending: boolean;
  onRemove: () => void;
  recolorPending: boolean;
  onRecolor: (color: string | null) => void;
};

type ParentFolderTileProps = {
  isDropTarget: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  onOpen: () => void;
};

/**
 * 色の名前を、実際のクラスへ写す。
 * 🚨 **`text-${color}-500` のように組み立てない。** Tailwind は**書かれた文字列を見て**
 *    CSS を作るので、組み立てた名前は**削られて色が出ない**（ビルドしないと分からない）。
 *    ここに全部書き出しておけば、使われていることが文字として見える。
 */
const FOLDER_COLOR_CLASS: Record<string, string> = {
  slate: "text-slate-500",
  red: "text-red-500",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  sky: "text-sky-500",
  violet: "text-violet-500",
};
const FOLDER_COLOR_NAMES = Object.keys(FOLDER_COLOR_CLASS);

function FolderMenuItems({
  folder,
  Item,
  removePending,
  onRemove,
  recolorPending,
  onRecolor,
}: {
  folder: FolderRow;
  Item: MenuItemComponent;
  removePending: boolean;
  onRemove: () => void;
  recolorPending: boolean;
  onRecolor: (color: string | null) => void;
}) {
  const t = useT("folders");

  return (
    <>
      {/* 🚨 開いた人の分だけ取りに行く（一覧の描画で N+1 にしない）。 */}
      <TileLabelsMenu endpoint={"/api/folders/" + folder.id + "/labels"} />
      {/* 🚨 色は「選ぶ」ものなので、1項目に押し込まず並べる。
          文字にすると6行になり、削除より目立ってしまう。 */}
      <div className="flex flex-wrap gap-1 px-2 py-1.5">
        {FOLDER_COLOR_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={t(`color_${name}`)}
            title={t(`color_${name}`)}
            aria-pressed={folder.color === name}
            disabled={recolorPending}
            onClick={() => onRecolor(name)}
            className={`size-5 rounded-full ${FOLDER_COLOR_CLASS[name]} bg-current ${
              folder.color === name ? "ring-2 ring-offset-1 ring-ring" : ""
            }`}
          />
        ))}
      </div>
      <Item
        variant="destructive"
        className="text-destructive"
        disabled={removePending}
        onClick={onRemove}
      >
        <Trash2 />
        {t("delete_button")}
      </Item>
    </>
  );
}

function FolderTile({
  folder,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  removePending,
  onRemove,
  recolorPending,
  onRecolor,
}: FolderTileProps) {
  const t = useT("folders");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-folder-tile
          // 🚨 ここで受けるのは**画面内から掴んできたファイルだけ**。外から来たファイル
          //    （アップロード）は上位の層が受けるので、種類で見分けて棲み分ける。
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onContextMenu={(event) => event.stopPropagation()}
          className={
            isDropTarget
              ? "group/tile relative min-w-0 rounded-md p-3 outline-2 outline-offset-[-2px] outline-dashed outline-ring"
              : "group/tile relative min-w-0 rounded-md p-3 hover:bg-muted active:bg-muted/80"
          }
        >
          <Link href={`/admin/files?folder=${folder.id}`} className="block min-w-0">
            {/*
              🚨 **ファイルのカードと同じ正方形**にする（`files-lightbox-grid.tsx` と同じ形）。
                 決定 `list-views-are-switchable-layouts`。**フォルダだけ違う形だと、
                 同じ並びの中で高さが揃わず、行が崩れる**（そして「別のもの」に見える）。
            */}
            <div
              data-surface-exempt
              className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted"
            >
              <Folder
                className={
                  folder.color && FOLDER_COLOR_CLASS[folder.color]
                    ? `size-10 ${FOLDER_COLOR_CLASS[folder.color]}`
                    : "size-10 text-muted-foreground"
                }
              />
            </div>
            <p className="truncate pr-8 text-sm font-medium">{folder.name}</p>
          </Link>
          <div className="absolute right-2 top-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("actions_label")}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <FolderMenuItems
                    folder={folder}
                    Item={DropdownMenuItem}
                    removePending={removePending}
                    onRemove={onRemove}
                    recolorPending={recolorPending}
                    onRecolor={onRecolor}
                  />
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuGroup>
          <FolderMenuItems
            folder={folder}
            Item={ContextMenuItem}
            removePending={removePending}
            onRemove={onRemove}
            recolorPending={recolorPending}
            onRecolor={onRecolor}
          />
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ParentFolderTile({
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpen,
}: ParentFolderTileProps) {
  const t = useT("folders");

  return (
    <div
      data-folder-tile
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={
        isDropTarget
          ? "group/tile relative min-w-0 rounded-md p-3 outline-2 outline-offset-[-2px] outline-dashed outline-ring"
          : "group/tile relative min-w-0 rounded-md p-3 hover:bg-muted active:bg-muted/80"
      }
    >
      <button type="button" onClick={onOpen} className="block w-full min-w-0 text-left">
        <div
          data-surface-exempt
          className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted"
        >
          <ArrowUp className="size-10 text-muted-foreground" />
        </div>
        <p className="truncate text-sm font-medium">{t("move_to_parent")}</p>
      </button>
    </div>
  );
}

const PARENT_DROP_TARGET = "__parent__";

export function FolderGrid({
  folders,
  currentFolderId,
  parentFolderId,
}: {
  folders: FolderRow[];
  currentFolderId: string | null;
  parentFolderId: string | null;
}) {
  const t = useT("folders");
  const tError = useT("errors");
  const messageFrom = (payload: unknown, status: number, fallback: string) => {
    if (status === 409) return fallback;
    const key = errorKeyFromPayload(payload);
    return key ? tError(key) : fallback;
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const remove = useSubmitOnce(async (id: string) => {
    setError(null);
    const response = await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(
        messageFrom(
          payload,
          response.status,
          response.status === 409
            ? t("error_folder_not_empty")
            : response.status === 403
              ? t("error_forbidden")
              : t("error_delete_failed"),
        ),
      );
      return;
    }
    // 🚨 **成功したら知らせる。** ここは一覧が入れ替わるだけなので、
    //    知らせが無いと「消えたのか、並びが変わっただけか」が分からない。
    // 🚨 鍵は **この画面の名前空間（folders）に持つ**。共通鍵にしない——
    //    戻せる削除と戻せない削除が混ざったとき、**片方だけ文言を変えられなくなる**
    //    （design の仕様 d04716a §4.5）。
    toast.success(t("deleted"));
    router.refresh();
  }, (id) => id);

  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const recolor = useSubmitOnce(
    async (id: string, color: string | null) => {
      const response = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ color }),
      });
      if (!response.ok) {
        toast.error(t("color_failed"));
        return;
      }
      router.refresh();
    },
    (id) => id,
  );

  /**
   * 掴んできたファイルをこのフォルダへ入れる。
   * 🚨 サービス層は変えていない。`updateFile` は既に `folder` の変更を許しているので、
   *    既存の `PATCH /api/files/<id>` をそのまま叩く。
   */
  /**
   * 🚨 **この関数だけ `useSubmitOnce` を通っていません**（2026-08-15 実測。
   *    囲んでいる `useSubmitOnce(…)` の括弧を数えて確認。他の 17 箇所は通っている）。
   *
   * 🚨 **なぜ通っていないかは、分かっていません（推測）。**
   *    入れたコミット（`ecfde5f`）にも、ここにも、**理由は書かれていません**
   *    （2026-08-16 に本文を読んで確認）。
   *    **読めること**: `useSubmitOnce` は「同じ鍵の実行を1本にする」もので、
   *    ここは **複数のファイルを順に PATCH する**ため、**鍵の取り方を決める必要がある**
   *    （フォルダ id か、ファイル id の集合か）。**そこで止まった可能性はありますが、
   *    記録が無いので断定できません。**
   *
   * 🚨 **黙って落ちる形ではありません**——try/catch が在り、
   *    **何件動いて何件落ちたか**を出しています。
   *
   * 🚨 **二重送信の実害も、構造上ありません**（2026-08-16 に確認）:
   *    `PATCH /api/files/<id>` に `{ folder }` を渡すのは **冪等**です。
   *    `updateFile` の中は **`.update()` が 1 本だけ**で、
   *    **`insert` / `increment` / 履歴の追加が 0 件**——**同じ folder を 2 回渡しても、
   *    2 回目は同じ値を書くだけ**で、増えるものがありません。
   *    （🟢 対照: 同じ探し方でファイル全体の `insert` は 2 件出るので、探し方は効いています）
   *
   * 🚨 **したがって `useSubmitOnce` を足す理由は、いまのところありません。**
   *    足すとしたら「同じ操作が 2 回走ることの無駄」を減らすためで、**壊れるからではない**。
   *    **「守りが無い」と「危ない」は別**なので、そう書き分けておきます。
   */
  const moveInto = async (folderId: string | null, fileIds: string[]) => {
    let moved = 0;
    let failed = 0;
    for (const fileId of fileIds) {
      try {
        const response = await fetch(`/api/files/${fileId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ folder: folderId }),
        });
        if (response.ok) moved += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    // 🚨 何件動いて何件落ちたかを出す。まとめて「失敗」にすると、**一部だけ動いた状態**が見えなくなる。
    if (moved > 0) toast.success(t("moved", { count: String(moved) }));
    if (failed > 0) toast.error(t("move_failed", { count: String(failed) }));
    if (moved > 0) router.refresh();
  };

  const carriesFile = (event: React.DragEvent): boolean =>
    Array.from(event.dataTransfer.types).includes(DRAG_FILE_MIME);

  const parentHref = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("folder", parentFolderId ?? "root");
    return `/admin/files?${params.toString()}`;
  };

  return (
    <div className="contents">
      {error ? <p className="col-span-full text-sm text-destructive">{error}</p> : null}
      {currentFolderId ? (
        <ParentFolderTile
          isDropTarget={dropTarget === PARENT_DROP_TARGET}
          onDragOver={(event) => {
            if (!carriesFile(event)) return;
            event.preventDefault();
            event.stopPropagation();
            setDropTarget(PARENT_DROP_TARGET);
          }}
          onDragLeave={() =>
            setDropTarget((current) => (current === PARENT_DROP_TARGET ? null : current))
          }
          onDrop={(event) => {
            if (!carriesFile(event)) return;
            event.preventDefault();
            event.stopPropagation();
            setDropTarget(null);
            const raw = event.dataTransfer.getData(DRAG_FILE_MIME);
            const ids = raw ? (JSON.parse(raw) as string[]) : [];
            if (ids.length > 0) void moveInto(parentFolderId, ids);
          }}
          onOpen={() => router.push(parentHref())}
        />
      ) : null}
      {folders.map((folder) => (
        <FolderTile
          key={folder.id}
          folder={folder}
          isDropTarget={dropTarget === folder.id}
          onDragOver={(event) => {
            if (!carriesFile(event)) return;
            event.preventDefault();
            // 🚨 上位のドロップ層まで伝わると、アップロードと二重に反応する。
            event.stopPropagation();
            setDropTarget(folder.id);
          }}
          onDragLeave={() => setDropTarget((current) => (current === folder.id ? null : current))}
          onDrop={(event) => {
            if (!carriesFile(event)) return;
            event.preventDefault();
            event.stopPropagation();
            setDropTarget(null);
            const raw = event.dataTransfer.getData(DRAG_FILE_MIME);
            const ids = raw ? (JSON.parse(raw) as string[]) : [];
            if (ids.length > 0) void moveInto(folder.id, ids);
          }}
          removePending={remove.isPending(folder.id)}
          onRemove={() => void remove.run(folder.id)}
          recolorPending={recolor.isPending(folder.id)}
          onRecolor={(color) => void recolor.run(folder.id, folder.color === color ? null : color)}
        />
      ))}
    </div>
  );
}
