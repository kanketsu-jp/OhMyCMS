import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SearchIcon } from "lucide-react";

// 🚨 実装をそのまま import する(コピーしない)。
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

/**
 * 入力と、その前後に付く飾り（アイコンなど）をまとめる器。
 * 横断検索の入力欄が中で使っている。
 */
const meta = {
  title: "Components/InputGroup",
  component: InputGroup,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLeadingIcon: Story = {
  render: (args) => (
    <InputGroup {...args}>
      <InputGroupAddon>
        <SearchIcon className="size-4 opacity-50" />
      </InputGroupAddon>
      <InputGroupInput placeholder="検索" />
    </InputGroup>
  ),
};

export const WithTrailingAddon: Story = {
  render: (args) => (
    <InputGroup {...args}>
      <InputGroupInput placeholder="ファイル名" />
      <InputGroupAddon align="inline-end">
        <span className="text-xs text-muted-foreground">.png</span>
      </InputGroupAddon>
    </InputGroup>
  ),
};
