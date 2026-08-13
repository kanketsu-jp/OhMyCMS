import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 画像を使わず fallback だけで表示できることを確かめる。 */
export const Default: Story = {
  render: (args) => (
    <Avatar {...args}>
      <AvatarFallback>HK</AvatarFallback>
    </Avatar>
  ),
};

/** サイズ差。sm/default/lg の文字サイズと外形が揃うかを見る。 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar size="sm">
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>DF</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>
    </div>
  ),
};

/** バッジ付き表示。オンライン状態などの小さい印が角に乗ることを確かめる。 */
export const WithBadge: Story = {
  render: () => (
    <Avatar size="lg">
      <AvatarFallback>ON</AvatarFallback>
      <AvatarBadge className="bg-emerald-500 ring-background" />
    </Avatar>
  ),
};

/** 複数人の重なり表示。ring と残り人数の見え方を確認する。 */
export const Group: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>HK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>YM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>ST</AvatarFallback>
      </Avatar>
      <AvatarGroupCount className="size-10 rounded-full bg-muted text-sm">
        +4
      </AvatarGroupCount>
    </AvatarGroup>
  ),
};
