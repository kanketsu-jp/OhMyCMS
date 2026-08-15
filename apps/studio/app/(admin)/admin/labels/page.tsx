import { ErrorBanner } from "@/components/admin/error-banner";
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
export default async function LabelsPage() {
  const tError = await getT("errors");
  const result = await apiFetch<{ data: LabelRow[] }>("/api/labels");

  return (
    <div className="max-w-4xl">
      {result.ok ? (
        <LabelsManager initial={result.data.data} />
      ) : (
        <ErrorBanner message={tError(result.messageKey)} />
      )}
    </div>
  );
}
