import { redirect } from "next/navigation";

export default function McpSettingsPage() {
  // 外に出ている旧 URL を壊さないため、ページ本体は統合先へ転送する。
  // 左サイドバーのリンクが移るまでは、このルートを残して受ける。
  redirect("/admin/settings/ai?tab=mcp");
}
