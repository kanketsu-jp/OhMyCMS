import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "Components/Label",
  component: Label,
  parameters: { layout: "centered" },
  args: { children: "Field label" },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label {...args} htmlFor="story-label-input" />
      <Input id="story-label-input" placeholder="placeholder" />
    </div>
  ),
};

/**
 * 実装は `peer-disabled:` と `group-data-[disabled=true]:` を持つ。
 * disabled な input の直前に置くと薄くなることを確認する。
 */
export const NextToDisabledInput: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Input id="story-label-disabled" className="peer" disabled />
      <Label {...args} htmlFor="story-label-disabled" />
    </div>
  ),
};

/** アイコンやバッジを並べる場合(実装が flex + gap-2 を持っている)。 */
export const WithSuffix: Story = {
  render: (args) => (
    <Label {...args}>
      Field label
      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        required
      </span>
    </Label>
  ),
};
