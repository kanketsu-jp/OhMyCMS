import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装(app/(admin)/layout.tsx)をそのまま import する。枠を書き写さない。
import AdminLayout from "@/app/(admin)/layout";

/**
 * 管理画面の外枠(サイドバー + ヘッダ + main)。
 *
 * この layout は async Server Component で、描画のために `currentUser()` と
 * `apiFetch("/api/collections")` を呼ぶ。Storybook には API サーバが無いので、
 * `.storybook/mocks/admin-api.ts` を Vite の alias で差し込んでいる
 * (差し替えているのは `lib/admin/api` だけで、layout の実装そのものは本物)。
 *
 * 何が返るかは parameters.adminApi で story ごとに変えられる。
 */
const meta = {
  title: "Layouts/AdminLayout",
  component: AdminLayout,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    children: (
      <div className="space-y-3">
        <h1 className="font-heading text-xl font-medium">Content area</h1>
        <p className="text-sm text-muted-foreground">
          Each admin page is rendered here.
        </p>
      </div>
    ),
  },
} satisfies Meta<typeof AdminLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** ログイン済み + コレクションが3つある、通常の状態。 */
export const Default: Story = {};

/** コレクションが1件も無いとき。サイドバーの content 欄が空になる。 */
export const NoCollections: Story = {
  parameters: { adminApi: { collections: [] } },
};

/** コレクション一覧の取得に失敗したとき(サイドバーにエラー文言が出る)。 */
export const CollectionsError: Story = {
  parameters: { adminApi: { collectionsFails: true } },
};

/** 人間ではなくエージェントのトークンで見ているとき(ヘッダのメール欄が変わる)。 */
export const AsAgent: Story = {
  parameters: {
    adminApi: {
      me: {
        type: "agent",
        agentId: "agent_01",
        name: "release-bot",
        onBehalfOf: "user_01",
      },
    },
  },
};
