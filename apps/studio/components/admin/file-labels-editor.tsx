"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Lock, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { labelDisplayName } from "@/components/admin/label-display-name";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export type LabelRow = {
  id: string;
  name: string;
  color: string | null;
  is_system: boolean;
  system_key: string | null;
};

/**
 * ファイル1件に付くラベルの付け外し。
 *
 * 🚨 **付け外しは「置き換え」で送る**（差分ではない）。API がそういう契約なのは、
 *    差分だと**画面が古いときに意図しない付け外し**が起きるため。
 *
 * 🚨 **システムラベルは外せるが、消せない**。ここで扱うのは「その1件に付いているか」で、
 *    ラベル自体の削除ではない。**両者を混ぜると、印を外そうとして定義ごと消える**。
 */
export function FileLabelsEditor({
  fileId,
  all,
  attached,
}: {
  fileId: string;
  /** 選べるラベルの全部。**サーバ側で取って渡す**（読み込んでから増える、を避ける）。 */
  all: LabelRow[];
  /** いま付いているもの。 */
  attached: LabelRow[];
}) {
  const t = useT("files");
  // 🚨 システムラベルの表示名だけは `labels` の辞書から出す（この画面の名前空間とは別）
  const tl = useT("labels");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(attached.map((label) => label.id)),
  );

  const save = useSubmitOnce(async (next: Set<string>) => {
    const response = await fetch(`/api/files/${fileId}/labels`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ labelIds: Array.from(next) }),
    });
    if (!response.ok) {
      toast.error(response.status === 403 ? t("error_forbidden") : t("labels_save_failed"));
      // 🚨 失敗したら画面を元へ戻す。**押した状態のまま残すと、保存されたと誤解する**。
      setSelected(new Set(attached.map((label) => label.id)));
      return;
    }
    toast.success(t("labels_saved"));
    router.refresh();
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    void save.run(next);
  };

  // ラベルが1つも無いときは、押せるものが無いので出さない。
  if (all.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t("labels_heading")}</p>
      <div className="flex flex-wrap gap-2">
        {all.map((label) => {
          const on = selected.has(label.id);
          return (
            <Button
              key={label.id}
              type="button"
              variant={on ? "secondary" : "ghost"}
              size="sm"
              // 🚨 押した状態を色だけで表さない（読み上げにも伝える）。
              aria-pressed={on}
              disabled={save.pending}
              onClick={() => toggle(label.id)}
              className={cn(on ? "" : "text-muted-foreground")}
            >
              {on ? <Check /> : <Tag />}
              {labelDisplayName(tl, label)}
              {/* 🚨 消せないラベルであることを示す。**外せない**という意味ではない。 */}
              {label.is_system ? <Lock className="opacity-60" /> : null}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
