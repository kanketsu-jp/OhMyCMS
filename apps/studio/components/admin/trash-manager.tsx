"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useT } from "@/i18n/client";

export type TrashItem = {
  key: string;
  collection: string;
  displayName: string;
  sourceKind: "collection" | "files" | "folders" | "labels" | "label_assignments" | "activity";
  sourceLabel: string | null;
  deletedAt: string;
  daysRemaining: number;
  canRestore: boolean;
  disabledReason: "missing_primary_key" | null;
};

type ReferenceIssue = {
  column: string;
  targetCollection: string;
  targetLabel: string;
  value: string;
  state: "trashed" | "missing";
};

type RestorePlan = {
  key: string;
  displayName: string;
  requiresConfirmation: boolean;
  trashedReferences: ReferenceIssue[];
  missingReferences: ReferenceIssue[];
  relatedRestoreCount: number;
};

export type TrashListPayload = {
  data: TrashItem[];
  retention_days: number;
};

function sourceLabel(t: ReturnType<typeof useT>, item: TrashItem): string {
  switch (item.sourceKind) {
    case "files":
      return t("source_files");
    case "folders":
      return t("source_folders");
    case "labels":
      return t("source_labels");
    case "label_assignments":
      return t("source_label_assignments");
    case "activity":
      return t("source_activity");
    case "collection":
      return item.sourceLabel ?? item.collection;
  }
}

async function responseCode(response: Response): Promise<string | null> {
  const body = (await response.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
  return body?.error?.code ?? null;
}

function errorMessage(t: ReturnType<typeof useT>, status: number, code: string | null): string {
  switch (code) {
    case "PERMISSION_DENIED":
    case "ADMIN_ACCESS_REQUIRED":
    case "CAPABILITY_DENIED":
      return t("error_forbidden");
    case "TRASH_ITEM_NOT_FOUND":
      return t("error_not_found");
    case "PRIMARY_KEY_NOT_FOUND":
      return t("missing_primary_key");
    default:
      break;
  }
  if (status === 401) return t("error_unauthenticated");
  return t("error_failed");
}

export function TrashManager({
  initial,
  retentionDays,
}: {
  initial: TrashItem[];
  retentionDays: number;
}) {
  const t = useT("trash");
  const format = useFormat();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [plan, setPlan] = useState<RestorePlan | null>(null);

  // 🚨 `useSubmitOnce` で包む。**呼び出し元が既に包んでいても、ここも包む**（2026-08-16）。
  //    `restoreNow` は下の `previewRestore` / `confirmRestore`（どちらも useSubmitOnce）
  //    の中からしか呼ばれないので、**実質は二重**になる。それでも包むのは:
  //    🚨 `check-submit-once.mjs` は **fetch を囲む最も近い関数**しか見ない（呼び出し元まで辿れない）。
  //       素の async 関数の中に `method: "POST"` が在る形は、**外がどうであれ違反として落ちる**。
  //    🚨 そして「呼び出し元が包んでいるから安全」は、**呼び出し元が増えた瞬間に崩れる**主張。
  //       包んでおけば、次に誰かが素で呼んでも守られる。
  const restoreNow = useSubmitOnce(async ({ key, mode }: { key: string; mode: "with_related" | "only" }) => {
    const response = await fetch("/api/trash/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, mode }),
    });
    if (!response.ok) {
      toast.error(errorMessage(t, response.status, await responseCode(response)));
      return;
    }
    const payload = (await response.json()) as { restored: number };
    setItems((current) => current.filter((item) => item.key !== key));
    setPlan(null);
    toast.success(t("restored", { count: payload.restored }));
    router.refresh();
  }, ({ key }) => key);

  const previewRestore = useSubmitOnce(async (item: TrashItem) => {
    const response = await fetch("/api/trash/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: item.key, preview: true }),
    });
    if (!response.ok) {
      toast.error(errorMessage(t, response.status, await responseCode(response)));
      return;
    }
    const payload = (await response.json()) as { plan: RestorePlan };
    if (!payload.plan.requiresConfirmation) {
      await restoreNow.run({ key: item.key, mode: "with_related" });
      return;
    }
    setPlan(payload.plan);
  }, (item) => item.key);

  const confirmRestore = useSubmitOnce(async (mode: "with_related" | "only") => {
    if (!plan) return;
    await restoreNow.run({ key: plan.key, mode });
  });

  const remove = useSubmitOnce(async (item: TrashItem) => {
    if (!window.confirm(t("delete_confirm", { name: item.displayName }))) return;
    const response = await fetch("/api/trash", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: item.key }),
    });
    if (!response.ok) {
      toast.error(errorMessage(t, response.status, await responseCode(response)));
      return;
    }
    setItems((current) => current.filter((row) => row.key !== item.key));
    toast.success(t("deleted"));
    router.refresh();
  }, (item) => item.key);

  return (
    <>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{t("count", { count: items.length })}</span>
        <span>{t("retention", { days: retentionDays })}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("column_item")}</TableHead>
              <TableHead>{t("column_source")}</TableHead>
              <TableHead>{t("column_deleted_at")}</TableHead>
              <TableHead>{t("column_remaining")}</TableHead>
              <TableHead className="text-right">{t("column_actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.key}>
                <TableCell className="max-w-[18rem] overflow-hidden text-ellipsis">{item.displayName}</TableCell>
                <TableCell>{sourceLabel(t, item)}</TableCell>
                <TableCell>{format.dateTime(item.deletedAt)}</TableCell>
                <TableCell>{t("remaining_days", { days: item.daysRemaining })}</TableCell>
                <TableCell className="text-right">
                  {item.canRestore ? (
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        onClick={() => void previewRestore.run(item)}
                        loading={previewRestore.isPending(item.key)}
                      >
                        <RotateCcw />
                        <span>{t("restore")}</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="outline" aria-label={t("row_options")}>
                            <ChevronDown />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => void remove.run(item)}
                          >
                            <Trash2 />
                            <span>{t("delete_permanently")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <p className="text-left text-xs text-muted-foreground md:text-right">
                      {t("missing_primary_key")}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={plan !== null} onOpenChange={(open) => !open && setPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("restore_confirm_title")}</DialogTitle>
            <DialogDescription>
              {plan?.trashedReferences.length
                ? t("restore_with_related_description", {
                    name: plan.displayName,
                    count: plan.relatedRestoreCount,
                  })
                : t("restore_missing_description", { name: plan?.displayName ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {plan ? (
            <div className="space-y-2 text-sm">
              <p>{t("trashed_reference_count", { count: plan.trashedReferences.length })}</p>
              <p>{t("missing_reference_count", { count: plan.missingReferences.length })}</p>
            </div>
          ) : null}
          <DialogFooter>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <ChevronDown />
                  <span>{plan?.trashedReferences.length ? t("restore_only") : t("cancel")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {plan?.trashedReferences.length ? (
                  <DropdownMenuItem onSelect={() => void confirmRestore.run("only")}>
                    {t("restore_only")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setPlan(null)}>{t("cancel")}</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => void confirmRestore.run(plan?.trashedReferences.length ? "with_related" : "only")}
              loading={confirmRestore.pending}
            >
              <RotateCcw />
              <span>
                {plan?.trashedReferences.length ? t("restore_with_related") : t("restore_empty")}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
