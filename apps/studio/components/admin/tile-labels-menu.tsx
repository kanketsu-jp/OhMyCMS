"use client";

import { useState } from "react";
import { Check, Lock, Tag, X } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { labelDisplayName } from "@/components/admin/label-display-name";
import { useT } from "@/i18n/client";

type LabelRow = {
  id: string;
  name: string;
  color: string | null;
  is_system: boolean;
  system_key: string | null;
};

function sortLabels(labels: LabelRow[]): LabelRow[] {
  return [...labels].sort(
    (a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name),
  );
}

/**
 * タイルに付けるラベル（メニューの中から開く、探せる一覧）。
 *
 * 🚨 **一覧の描画時には取りに行かない。** タイルの数だけ問い合わせが飛ぶ（N+1）。
 *    **メニューを開いた人の分だけ**取る。開く操作の中で呼ぶので、
 *    効果（effect）の中で状態を書くことにもならない。
 *
 * 🚨 ラベルが増えたらメニューが縦に伸びる。**10 個を超えたら**別の画面
 *    （フォルダの設定）へ移すこと。**いまは3件なので、置き場所を増やさない方を選んだ。**
 *    2026-08-17 に一覧はダイアログへ移したが、「メニュー内一覧だったころの判断」は
 *    経緯として残す。ダイアログでも、件数が大きくなりすぎたら専用画面のほうがよい。
 */
export function TileLabelsMenu({ endpoint }: { endpoint: string }) {
  const t = useT("files");
  // 🚨 システムラベルの表示名だけは `labels` の辞書から出す（この画面の名前空間とは別）
  const tl = useT("labels");
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<LabelRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pendingSystemRemoval, setPendingSystemRemoval] = useState<LabelRow | null>(null);

  const load = useSubmitOnce(async () => {
    const [allResponse, attachedResponse] = await Promise.all([
      fetch("/api/labels"),
      fetch(endpoint),
    ]);
    if (!allResponse.ok || !attachedResponse.ok) {
      // 🚨 取れなかったことを黙って空一覧にしない。空だと「ラベルが無い」と読める。
      toast.error(t("labels_load_failed"));
      return;
    }
    const allPayload = (await allResponse.json()) as { data: LabelRow[] };
    const attachedPayload = (await attachedResponse.json()) as { data: LabelRow[] };
    setAll(allPayload.data);
    setSelected(new Set(attachedPayload.data.map((label) => label.id)));
  });

  const closeDialog = () => {
    setOpen(false);
    setSearch("");
    setAppliedSearch("");
    setSelected(new Set());
    setPendingSystemRemoval(null);
  };

  const save = useSubmitOnce(async () => {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ labelIds: Array.from(selected) }),
    });
    if (!response.ok) {
      toast.error(response.status === 403 ? t("error_forbidden") : t("labels_save_failed"));
      return;
    }
    toast.success(t("labels_saved"));
    closeDialog();
  });

  const create = useSubmitOnce(async (name: string) => {
    const response = await fetch("/api/labels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      toast.error(t("labels_save_failed"));
      return;
    }
    const payload = (await response.json()) as { data: LabelRow };
    setAll((current) => sortLabels([...(current ?? []), payload.data]));
    setSelected((current) => new Set(current).add(payload.data.id));
    setSearch("");
  });

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true);
      setAll(null);
      setSelected(new Set());
      setSearch("");
      setAppliedSearch("");
      void load.run();
      return;
    }
    closeDialog();
  };

  const toggleLabel = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const selectedLabels = all?.filter((label) => selected.has(label.id)) ?? [];
  const applySearch = (value: string) => {
    const next = value.trim();
    if (next === appliedSearch) return;
    setAppliedSearch(next);
  };
  const createName = appliedSearch.trim();

  return (
    <>
      <button
        type="button"
        disabled={load.pending}
        onClick={() => handleOpenChange(true)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground active:text-foreground"
      >
        <Tag className="size-4" />
        {load.pending ? t("labels_loading") : t("labels_heading")}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("labels_dialog_title")}</DialogTitle>
          </DialogHeader>
          {selectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedLabels.map((label) => {
                const name = labelDisplayName(tl, label);
                return (
                  <span
                    key={label.id}
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-1 text-sm text-foreground"
                  >
                    {label.is_system ? <Lock className="size-3.5 opacity-60" /> : null}
                    <span className="truncate">{name}</span>
                    <button
                      type="button"
                      disabled={save.pending || create.pending}
                      aria-label={t("remove_file")}
                      onClick={() => {
                        if (label.is_system) {
                          setPendingSystemRemoval(label);
                          return;
                        }
                        removeSelected(label.id);
                      }}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground active:bg-background active:text-foreground disabled:pointer-events-none disabled:text-muted-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
          <Command shouldFilter={false}>
            <CommandInput
              autoFocus
              value={search}
              onValueChange={setSearch}
              onKeyDown={(event) => {
                if (event.key === "Enter") applySearch(event.currentTarget.value);
              }}
              onBlur={(event) => applySearch(event.currentTarget.value)}
              placeholder={t("labels_search_placeholder")}
            />
            <CommandList>
              {all === null ? (
                <CommandEmpty>
                  {load.pending ? t("labels_loading") : t("labels_load_failed")}
                </CommandEmpty>
              ) : (
                <>
                  <CommandEmpty>
                    <div className="flex flex-col items-center gap-3">
                      <span>{t("labels_none_found")}</span>
                      {createName !== "" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={create.pending || save.pending}
                          loading={create.pending}
                          onClick={() => void create.run(createName)}
                        >
                          {t("labels_create", { name: createName })}
                        </Button>
                      ) : null}
                    </div>
                  </CommandEmpty>
                  {all.length > 0 ? (
                    <CommandGroup>
                      {all
                        .filter((label) =>
                          labelDisplayName(tl, label)
                            .toLocaleLowerCase()
                            .includes(appliedSearch.toLocaleLowerCase()),
                        )
                        .map((label) => {
                          const on = selected.has(label.id);
                          const name = labelDisplayName(tl, label);
                          return (
                            <CommandItem
                              key={label.id}
                              value={name}
                              aria-checked={on}
                              role="menuitemcheckbox"
                              disabled={save.pending}
                              onSelect={() => {
                                toggleLabel(label.id);
                              }}
                            >
                              <Check className={on ? "size-4" : "size-4 opacity-0"} aria-hidden />
                              <span>{name}</span>
                              {label.is_system ? (
                                <Lock className="ml-auto size-3.5 opacity-60" />
                              ) : null}
                            </CommandItem>
                          );
                        })}
                    </CommandGroup>
                  ) : null}
                </>
              )}
            </CommandList>
          </Command>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.pending} onClick={closeDialog}>
              {t("labels_cancel")}
            </Button>
            <Button
              type="button"
              disabled={save.pending || create.pending || load.pending || all === null}
              loading={save.pending}
              onClick={() => void save.run()}
            >
              {t("save_button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        spec={
          pendingSystemRemoval
            ? {
                title: t("labels_remove_system_title"),
                description: t("labels_remove_system_description"),
                confirmLabel: t("labels_remove_system_confirm"),
                tone: "default",
              }
            : null
        }
        onClose={() => setPendingSystemRemoval(null)}
        onConfirm={() => {
          if (pendingSystemRemoval) removeSelected(pendingSystemRemoval.id);
        }}
      />
    </>
  );
}
