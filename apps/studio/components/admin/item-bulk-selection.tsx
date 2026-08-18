"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ErrorBanner } from "@/components/admin/error-banner";
import { RowOptions } from "@/components/admin/row-options";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { Checkbox } from "@/components/ui/checkbox";

const MAX_BULK_DELETE = 100;

type BulkContextValue = {
  ids: readonly string[];
  selected: ReadonlySet<string>;
  allSelected: boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
};

const BulkContext = createContext<BulkContextValue | null>(null);

function useBulk(): BulkContextValue {
  const value = useContext(BulkContext);
  if (!value) throw new Error("Item bulk selection components must be inside ItemBulkSelection");
  return value;
}

/**
 * アイテム一覧の複数選択状態と一括削除操作を提供するラッパー。
 *
 * 🚨 子のチェックボックスはこの Context 経由で同じ選択集合を使う。別状態を持つと、
 *    ヘッダーの全選択と各行の表示がずれる。削除上限は API と同じ 100 件。
 *
 * 参考: `components/admin/row-options.tsx` ／ DESIGN.md §2-5
 */
export function ItemBulkSelection({
  collection,
  ids,
  children,
}: {
  collection: string;
  ids: readonly string[];
  children: ReactNode;
}) {
  const t = useT("items");
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<readonly { id: string; code: string }[]>([]);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const selectedIds = useMemo(() => ids.filter((id) => selected.has(id)), [ids, selected]);
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;
  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(ids));
  const removeSelected = useSubmitOnce(async () => {
    setFailed([]);
    setLimitReached(false);
    setAttemptedCount(selectedIds.length);
    const response = await fetch(`/api/items/${encodeURIComponent(collection)}/bulk-delete`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: { deleted?: string[]; failed?: { id: string; code: string }[] };
      error?: { code?: string };
    } | null;
    if (!response.ok) {
      setLimitReached(payload?.error?.code === "TOO_MANY_ITEMS");
      setFailed(selectedIds.map((id) => ({ id, code: "OTHER" })));
      return;
    }
    const failures = payload?.data?.failed ?? [];
    setSelected(new Set(failures.map((item) => item.id)));
    setFailed(failures);
    router.refresh();
  });
  const context = { ids, selected, allSelected, toggle, toggleAll };

  return (
    <BulkContext.Provider value={context}>
      {failed.length > 0 ? (
        <div className="mb-3">
          <ErrorBanner
            message={limitReached
              ? t("bulk_limit", { count: String(MAX_BULK_DELETE) })
              : t("bulk_partial", { total: String(attemptedCount), failed: String(failed.length) })}
          />
        </div>
      ) : null}
      {selectedIds.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="mr-auto">{t("bulk_selected", { count: String(selectedIds.length) })}</span>
          <button type="button" className="underline underline-offset-2" onClick={() => setSelected(new Set())}>
            {t("bulk_clear")}
          </button>
          <RowOptions
            label={t("bulk_options")}
            options={[
              {
                label: t("bulk_delete"),
                destructive: true,
                disabled: removeSelected.pending,
                onSelect: () => void removeSelected.run(),
                confirm: {
                  title: t("bulk_confirm_title"),
                  description: t("bulk_confirm", { count: String(selectedIds.length) }),
                  confirmLabel: t("bulk_delete"),
                  tone: "danger",
                },
              },
            ]}
          />
        </div>
      ) : null}
      {children}
      <span className="sr-only">{t("bulk_limit", { count: String(MAX_BULK_DELETE) })}</span>
    </BulkContext.Provider>
  );
}

export function ItemBulkSelectAll() {
  const t = useT("items");
  const { allSelected, toggleAll } = useBulk();
  return (
    <Checkbox
      aria-label={t(allSelected ? "bulk_clear_all" : "bulk_select_all")}
      checked={allSelected}
      onCheckedChange={toggleAll}
    />
  );
}

export function ItemBulkCheckbox({ id }: { id: string }) {
  const t = useT("items");
  const { selected, toggle } = useBulk();
  return (
    <Checkbox
      aria-label={t("bulk_select_row")}
      checked={selected.has(id)}
      onCheckedChange={() => toggle(id)}
    />
  );
}
