import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Kbd, KbdGroup } from "@/components/ui/kbd";

/** キーボードの打鍵を表す部品。横断検索の `⌘K` の表示に使っている。 */
const meta = {
  title: "Components/Kbd",
  component: Kbd,
  parameters: { layout: "centered" },
  args: { children: "⌘K" },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** 複数キーの組み合わせ。 */
export const Group: Story = {
  render: () => (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  ),
};

/** 文の中に置いたとき。行の高さを崩さないことを見る。 */
export const InSentence: Story = {
  render: () => (
    <p className="text-sm text-muted-foreground">
      <Kbd>⌘K</Kbd> で検索を開きます。
    </p>
  ),
};
