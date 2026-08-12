import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装(app/(admin)/admin/page.tsx)をそのまま import する。
import AdminPage from "@/app/(admin)/admin/page";

/**
 * 管理画面のトップ(ダッシュボード)。
 * API も DB も触らない純粋な Server Component なので、スタブ無しでそのまま描画できる。
 */
const meta = {
  title: "Pages/Dashboard",
  component: AdminPage,
} satisfies Meta<typeof AdminPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
