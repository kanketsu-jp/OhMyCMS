import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const meta = {
  title: "Components/Select",
  component: Select,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const FIELD_TYPES = [
  { value: "string", label: "string" },
  { value: "text", label: "text" },
  { value: "integer", label: "integer" },
  { value: "boolean", label: "boolean" },
  { value: "timestamp", label: "timestamp" },
  { value: "uuid", label: "uuid" },
];

export const Default: Story = {
  render: () => (
    <Select items={FIELD_TYPES}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select a field type" />
      </SelectTrigger>
      <SelectContent>
        {FIELD_TYPES.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-56 gap-2">
      <Label htmlFor="story-select">Field type</Label>
      <Select items={FIELD_TYPES} defaultValue="string">
        <SelectTrigger id="story-select" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIELD_TYPES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
};

/** SelectGroup / SelectLabel / SelectSeparator を使った分類つき。 */
export const Grouped: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select a field type" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Text</SelectLabel>
          <SelectItem value="string">string</SelectItem>
          <SelectItem value="text">text</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Number</SelectLabel>
          <SelectItem value="integer">integer</SelectItem>
          <SelectItem value="float">float</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

/** size="sm" は h-7 まで詰まる(実装の data-[size=sm] 指定)。 */
export const Small: Story = {
  render: () => (
    <Select items={FIELD_TYPES} defaultValue="string">
      <SelectTrigger size="sm" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FIELD_TYPES.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select items={FIELD_TYPES} defaultValue="string" disabled>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FIELD_TYPES.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};
