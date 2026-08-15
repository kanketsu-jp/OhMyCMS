"use client";

import { useState } from "react";
import { Check, Lock, Tag } from "lucide-react";

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
 * フォルダに付けるラベル（メニューの中に置く小さな一覧）。
 *
 * 🚨 **一覧の描画時には取りに行かない。** フォルダの数だけ問い合わせが飛ぶ（N+1）。
 *    **メニューを開いた人の分だけ**取る。開く操作の中で呼ぶので、
 *    効果（effect）の中で状態を書くことにもならない。
 *
 * 🚨 ラベルが増えたらメニューが縦に伸びる。**10 個を超えたら**別の画面
 *    （フォルダの設定）へ移すこと。**いまは3件なので、置き場所を増やさない方を選んだ。**
 */
export function FolderLabelsMenu({ folderId }: { folderId: string }) {
  const t = useT("files");
  // 🚨 システムラベルの表示名だけは `labels` の辞書から出す（この画面の名前空間とは別）
  const tl = useT("labels");
  const [all, setAll] = useState<LabelRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useSubmitOnce(async () => {
    const [allResponse, attachedResponse] = await Promise.all([
      fetch("/api/labels"),
      fetch(`/api/folders/${folderId}/labels`),
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
    const response = await fetch(`/api/folders/${folderId}/labels`, {
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

  // まだ開いていない（＝取りに行っていない）ときは、押すと取りに行くだけの1行を出す。
  if (all === null) {
    return (
      <button
        type="button"
        disabled={load.pending}
        onClick={() => void load.run()}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Tag className="size-4" />
        {load.pending ? t("labels_loading") : t("labels_heading")}
      </button>
    );
  }

  if (all.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      {all.map((label) => {
        const on = selected.has(label.id);
        return (
          <button
            key={label.id}
            type="button"
            aria-pressed={on}
            disabled={save.pending}
            onClick={() => {
              const next = new Set(selected);
              if (next.has(label.id)) next.delete(label.id);
              else next.add(label.id);
              setSelected(next);
              void save.run(next);
            }}
            className="flex items-center gap-2 text-left text-sm hover:underline"
          >
            {on ? <Check className="size-3.5" /> : <Tag className="size-3.5 opacity-50" />}
            <span className="truncate">{labelDisplayName(tl, label)}</span>
            {label.is_system ? <Lock className="size-3 opacity-60" /> : null}
          </button>
        );
      })}
    </div>
  );
}
