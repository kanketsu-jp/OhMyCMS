import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Separator } from "@/components/ui/separator";

const meta = {
  title: "Components/Separator",
  component: Separator,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 横方向の区切り線。前後の余白を呼び出し側で持たせる使い方を見る。 */
export const Default: Story = {
  render: (args) => (
    <div className="max-w-md">
      <div className="text-sm font-medium">基本情報</div>
      <Separator {...args} className="my-3" />
      <div className="text-sm text-muted-foreground">
        公開状態、作成者、更新日時を表示します。
      </div>
    </div>
  ),
};

/** 縦方向の区切り線。親の高さに合わせて伸びることを確かめる。 */
export const Vertical: Story = {
  render: (args) => (
    <div className="flex h-16 items-stretch gap-4">
      <div className="text-sm">下書き</div>
      <Separator {...args} orientation="vertical" />
      <div className="text-sm">公開済み</div>
      <Separator {...args} orientation="vertical" />
      <div className="text-sm">予約投稿</div>
    </div>
  ),
};

/** 細い区切りを複数置く場面。線だけで面を増やさずに分けることを確認する。 */
export const InList: Story = {
  render: (args) => (
    <div className="w-80 text-sm">
      <div className="py-2">タイトル</div>
      <Separator {...args} />
      <div className="py-2">スラッグ</div>
      <Separator {...args} />
      <div className="py-2">公開日時</div>
    </div>
  ),
};
