"use client";

import Link from "next/link";
import { FolderPlus, Upload } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useT } from "@/i18n/client";

export function FilesPageMenu({
  newFileHref,
  newFolderHref,
  children,
}: {
  newFileHref: string;
  newFolderHref: string;
  children: React.ReactNode;
}) {
  const t = useT("files");

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuItem asChild>
            <Link href={newFileHref}>
              <Upload />
              {t("new_file_button")}
            </Link>
          </ContextMenuItem>
          <ContextMenuItem asChild>
            <Link href={newFolderHref}>
              <FolderPlus />
              {t("new_folder_button")}
            </Link>
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
