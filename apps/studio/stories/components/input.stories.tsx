import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "Components/Input",
  component: Input,
  parameters: { layout: "centered" },
  argTypes: {
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "search", "file"],
    },
    disabled: { control: "boolean" },
  },
  args: { placeholder: "placeholder" },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid gap-2">
      <Label htmlFor="story-input">Slug</Label>
      <Input {...args} id="story-input" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, value: "read only" },
};

/** aria-invalid で destructive の ring が出る(実装側の aria-invalid: 指定)。 */
export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "invalid value" },
};

export const Types: Story = {
  render: (args) => (
    <div className="grid gap-3">
      <Input {...args} type="text" placeholder="text" />
      <Input {...args} type="email" placeholder="email" />
      <Input {...args} type="password" placeholder="password" />
      <Input {...args} type="number" placeholder="number" />
      <Input {...args} type="file" placeholder="" />
    </div>
  ),
};
