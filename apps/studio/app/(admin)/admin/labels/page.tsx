import { ErrorBanner } from "@/components/admin/error-banner";
import { PageTabs } from "@/components/admin/page-tabs";
import { getT } from "@/i18n/server";
import { LabelsManager, type LabelRow } from "@/components/admin/labels-manager";
import { apiFetch } from "@/lib/admin/api";

/**
 * ラベルの管理。
 *
 * 🚨 **付ける画面ではない。** ファイル・フォルダに付けるのはそれぞれの画面で、
 *    ここは**選択肢そのもの**（作る・名前と色を変える・消す）を扱う。
 *    原典 L73 の「ファイルのアコーディオンの中に『ストレージ』『ラベル』」がこれ。
 *
 * 設定は API 経由で取る（直接 DB を読むと、権限チェックが1系統増えて食い違う）。
 */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tError = await getT("errors");
  const t = await getT("labels");
  const params = await searchParams;
  const tab = params.tab === "create" ? "create" : "list";
  const result = await apiFetch<{ data: LabelRow[] }>("/api/labels");

  return (
    <div className="max-w-4xl">
      <PageTabs
        tabs={[
          { href: "/admin/labels?tab=list", label: t("list_tab"), current: tab === "list" },
          { href: "/admin/labels?tab=create", label: t("create_tab"), current: tab === "create" },
        ]}
      />
      {result.ok ? (
        <LabelsManager initial={result.data.data} tab={tab} />
      ) : (
        <ErrorBanner message={tError(result.messageKey)} />
      )}
    </div>
  );
}
