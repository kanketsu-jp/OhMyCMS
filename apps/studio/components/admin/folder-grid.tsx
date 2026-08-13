"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";

type FolderRow = {
  id: string;
  name: string;
  parent: string | null;
};

function messageFrom(payload: unknown, status: number, fallback: string): string {
  if (status === 409) return fallback;
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

export function FolderGrid({ folders }: { folders: FolderRow[] }) {
  const t = useT("folders");
  const router = useRouter();
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
    router.refresh();
  }, (id) => id);

  return (
    <div className="contents">
      {error ? <p className="col-span-full text-sm text-destructive">{error}</p> : null}
      {folders.map((folder) => (
        <div key={folder.id} className="group/tile relative min-w-0 rounded-md p-3 hover:bg-muted">
          <Link href={`/admin/files?folder=${folder.id}`} className="block min-w-0 pr-10">
            <Folder className="mb-3 size-10 text-muted-foreground" />
            <p className="truncate text-sm font-medium">{folder.name}</p>
          </Link>
          <div className="absolute right-2 top-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("actions_label")}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    className="text-destructive"
                    disabled={remove.isPending(folder.id)}
                    onClick={() => void remove.run(folder.id)}
                  >
                    <Trash2 />
                    {t("delete_button")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
