import { BugReportForm } from "@/components/admin/bug-report-form";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getFormat, getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BugReport } from "@/lib/reports/service";

/**
 * 不具合の報告（F2 §2-G）。
 * フォームは誰でも出せる。一覧は管理者だけ（403 のときは黙って出さない）。
 */
export default async function ReportsPage() {
  const t = await getT("reports");
  const format = await getFormat();
  // 管理者でなければ 403 が返る。**エラーとして見せず、一覧の節ごと出さない**
  // （権限が無いこと自体を画面のノイズにしない）。
  const list = await apiFetch<{ data: BugReport[] }>("/api/reports");

  return (
    <div className="max-w-4xl space-y-8">

      <BugReportForm />

      {list.ok ? (
        <Surface>
          <SurfaceTitle>{t("list_heading")}</SurfaceTitle>
          {list.data.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("list_empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("column_title")}</TableHead>
                    <TableHead>{t("column_created")}</TableHead>
                    <TableHead>{t("column_mail")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.data.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">{report.title}</TableCell>
                      <TableCell>{format.dateTime(report.created_at)}</TableCell>
                      <TableCell>{report.mail_status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </Surface>
      ) : null}
    </div>
  );
}
