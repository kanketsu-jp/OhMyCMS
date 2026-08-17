import { redirect } from "next/navigation";

/**
 * 🚨 中身は `/admin/version` へ移した（堀池さん 2026-08-17・原文:
 * 「settings は不要で設定もしないので、admin/version でお願いします」）。
 * ここを残しているのは、外に出ている URL とナビのリンクを壊さないため。
 * `app/(admin)/admin/reports/manage/page.tsx` と同じ形。
 */
export default function VersionSettingsRedirect() {
  redirect("/admin/version");
}
