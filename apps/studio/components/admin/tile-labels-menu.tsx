"use client";

import { useState } from "react";
import { Check, Lock, Tag } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
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

  const save = useSubmitOnce(async (next: Set<string>) => {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ labelIds: Array.from(next) }),
    });
    if (!response.ok) {
      toast.error(response.status === 403 ? t("error_forbidden") : t("labels_save_failed"));
      return;
    }
    toast.success(t("labels_saved"));
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && all === null) {
      void load.run();
    }
  };

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
          <Command>
            <CommandInput autoFocus placeholder={t("labels_search_placeholder")} />
            <CommandList>
              {all === null ? (
                <CommandEmpty>
                  {load.pending ? t("labels_loading") : t("labels_load_failed")}
                </CommandEmpty>
              ) : (
                <>
                  <CommandEmpty>{t("labels_none_found")}</CommandEmpty>
                  {all.length > 0 ? (
                    <CommandGroup>
                      {all.map((label) => {
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
                              const next = new Set(selected);
                              if (next.has(label.id)) next.delete(label.id);
                              else next.add(label.id);
                              setSelected(next);
                              void save.run(next);
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
        </DialogContent>
      </Dialog>
    </>
  );
}
