"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import { ErrorBanner } from "@/components/admin/error-banner";
import { WideTable } from "@/components/admin/wide-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { ListEmpty } from "@/components/admin/list-empty";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useT } from "@/i18n/client";
// 🚨 型だけを持つファイル（`lib/trash/types.ts` は import 0 行）。
//    同じ形を 2 箇所に持たないため（schema が用意・ed9a421）。値は足さないこと。
import type { LastPurgeRun } from "@/lib/trash/types";

export type TrashItem = {
  key: string;
  collection: string;
  displayName: string;
  sourceKind: "collection" | "files" | "folders" | "labels" | "label_assignments" | "activity";
  sourceLabel: string | null;
  deletedAt: string;
  daysRemaining: number;
  canRestore: boolean;
  /**
   * 🚨 **戻せない理由**。増える。**画面はここから文言を引くこと**（下の `disabledText`）。
   *   `missing_primary_key` … 主キーが無いので行を特定できない
   *   `system_table` ……… 仕組みが使う表なので、ゴミ箱からは触らせない
   *     （2026-08-17。`directus_permissions` のように `deleted_at` は持つが許可しない表）
   */
  disabledReason: "missing_primary_key" | "system_table" | null;
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
  last_purge: LastPurgeRun | null;
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

/**
 * 戻せない理由の文言。
 *
 * 🚨 **以前ここは `t("missing_primary_key")` の直書きだった。**
 *   理由が 1 種類しか無かったので動いていたが、**2 種類目が来た瞬間に嘘をつく**
 *   （仕組みの表なのに「主キーがありません」と出る）。
 *   ＝ **理由が 1 つしか無いうちは、直書きと「理由から引く」の区別が付かない。**
 *   🚨 **null が来たら文言を出さない**（**理由が無いのに理由を書かない**）。
 */
function disabledText(t: ReturnType<typeof useT>, reason: TrashItem["disabledReason"]): string | null {
  switch (reason) {
    case "missing_primary_key":
      return t("missing_primary_key");
    case "system_table":
      return t("system_table_not_restorable");
    case null:
      return null;
  }
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
    // 🚨 他の行から参照されている（pg の 23503）。
    //   🚨 **共有の `i18n/error.ts` には足していない**——ゴミ箱はここに自分の写像を持っており、
    //     同じ文言を 2 箇所に置くと片方が腐る（`i18n/error.ts` の FOLDER_NOT_EMPTY の経緯と同じ理由）。
    case "ITEM_REFERENCED":
      return t("error_referenced");
    default:
      break;
  }
  if (status === 401) return t("error_unauthenticated");
  return t("error_failed");
}

export function TrashManager({
  initial,
  retentionDays,
  lastPurge,
}: {
  initial: TrashItem[];
  retentionDays: number;
  lastPurge: LastPurgeRun | null;
}) {
  const t = useT("trash");
  const format = useFormat();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  /**
   * 🚨 **完全削除の確認は `window.confirm` をやめた**（2026-08-17）。
   *   本文は辞書を通っていたが、**「OK / キャンセル」は OS の言語**で出ていた
   *   ＝ **辞書の外に、変えられない UI 文言が 2 つ**（AGENTS.md §3.8）。
   *   ＝ 押す対象を state に持ち、`AlertDialog` で聞く。
   */
  const [pendingDelete, setPendingDelete] = useState<TrashItem | null>(null);

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
    setPendingDelete(null);
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
      {/* 🚨 **落ちたことは、記録に残るだけでは読まれない。** 自動削除は毎朝 cron から黙って走り、
          落ちても `error` に記録されるだけ（`lib/trash/purge.ts`）。読まれなければ永久に落ち続ける。
          → `decisions/toast-for-events-page-for-what-needs-fixing`「直すべきことは画面に出す」。
          🚨 **成功したことは出さない**（`decisions/every-element-must-earn-its-place`）。
          出すのは下の 1 行（いつ動いたか）だけで足りる。 */}
      <ErrorBanner
        message={
          lastPurge?.error
            ? t("purge_failed", { when: format.dateTime(lastPurge.started_at) })
            : null
        }
      />

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{t("count", { count: items.length })}</span>
        <span className="flex items-center gap-3">
          {/* 🚨 **`null` と `deleted_total: 0` を同じ文言にしない**（型の宣言に理由を書いた）。
              「まだ動いていない」と「動いたが消すものが無かった」は別のこと。 */}
          <span>
            {lastPurge
              ? t("purge_last", { when: format.dateTime(lastPurge.started_at) })
              : t("purge_never")}
          </span>
          <span>{t("retention", { days: retentionDays })}</span>
        </span>
      </div>

      {items.length === 0 ? (
        <ListEmpty>{t("empty")}</ListEmpty>
      ) : (
        <WideTable>
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
                      <ButtonGroup className="ml-auto justify-end [&>*]:rounded-none">
                        <Button
                          onClick={() => void previewRestore.run(item)}
                          loading={previewRestore.isPending(item.key)}
                        >
                          <RotateCcw />
                          <span>{t("restore")}</span>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="outline" aria-label={t("row_options")}>
                              <ChevronDown />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44">
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setPendingDelete(item)}
                            >
                              <Trash2 />
                              <span>{t("delete_permanently")}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ButtonGroup>
                    ) : (
                      <p className="text-left text-xs text-muted-foreground md:text-right">
                        {disabledText(t, item.disabledReason)}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </WideTable>
      )}

      {/* 🚨 **完全削除の確認**。`window.confirm` の置き換え（2026-08-17）。
          `tone="danger"` … **この 3 箇所で危険なのはここだけ**（他はラベル削除と離脱確認）。 */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_permanently")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? t("delete_confirm", { name: pendingDelete.displayName }) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              tone="danger"
              disabled={remove.pending}
              onClick={() => {
                if (pendingDelete) void remove.run(pendingDelete);
              }}
            >
              {t("delete_permanently")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <DropdownMenuContent align="end" className="min-w-44">
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
