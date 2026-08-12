import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Plus, Trash2 } from "lucide-react";

// 🚨 実装をそのまま import する(コピーしない)。
//    components/ui/button.tsx が変われば、この story も自動で変わる。
import { Button } from "@/components/ui/button";

const meta = {
  title: "Components/Button",
  component: Button,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "outline",
        "secondary",
        "ghost",
        "destructive",
        "link",
      ],
    },
    size: {
      control: "select",
      options: [
        "default",
        "xs",
        "sm",
        "lg",
        "icon",
        "icon-xs",
        "icon-sm",
        "icon-lg",
      ],
    },
    disabled: { control: "boolean" },
  },
  args: { children: "Button" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** cva の variant を全部並べる。実装に variant が増えればここも足す。 */
export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} variant="default" />
      <Button {...args} variant="outline" />
      <Button {...args} variant="secondary" />
      <Button {...args} variant="ghost" />
      <Button {...args} variant="destructive" />
      <Button {...args} variant="link" />
    </div>
  ),
};

/** 高さの段階。日本語UIでは行間が詰まりやすいので、実寸を並べて確認する。 */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} size="xs" />
      <Button {...args} size="sm" />
      <Button {...args} size="default" />
      <Button {...args} size="lg" />
    </div>
  ),
};

export const WithIcon: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args}>
        <Plus />
        Create
      </Button>
      <Button {...args} variant="destructive">
        <Trash2 />
        Delete
      </Button>
    </div>
  ),
};

export const IconOnly: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} size="icon-xs" aria-label="add">
        <Plus />
      </Button>
      <Button {...args} size="icon-sm" aria-label="add">
        <Plus />
      </Button>
      <Button {...args} size="icon" aria-label="add">
        <Plus />
      </Button>
      <Button {...args} size="icon-lg" aria-label="add">
        <Plus />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};
