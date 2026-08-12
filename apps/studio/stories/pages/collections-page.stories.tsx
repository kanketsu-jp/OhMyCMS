import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装(app/(admin)/admin/collections/page.tsx)をそのまま import する。
import CollectionsPage from "@/app/(admin)/admin/collections/page";

/**
 * コレクション一覧。`/api/collections` を叩くので、
 * `.storybook/mocks/admin-api.ts` のスタブが返す値で描画される
 * (返す中身は parameters.adminApi で story ごとに変えられる)。
 *
 * Server Component の props(`searchParams`)は Next.js 16 では Promise。
 * story からは解決済みの Promise を渡す。
 */
const meta = {
  title: "Pages/Collections",
  component: CollectionsPage,
  args: {
    searchParams: Promise.resolve({}),
  },
} satisfies Meta<typeof CollectionsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** コレクションが1件も無いとき。 */
export const Empty: Story = {
  parameters: { adminApi: { collections: [] } },
};

/** 一覧の取得に失敗したとき。ErrorBanner が出る。 */
export const LoadFailed: Story = {
  parameters: { adminApi: { collectionsFails: true } },
};

/** 作成に失敗して ?error= 付きで戻ってきたとき。 */
export const WithErrorParam: Story = {
  args: {
    searchParams: Promise.resolve({ error: "collection already exists" }),
  },
};
