import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const meta = {
  title: "Components/Card",
  component: Card,
  parameters: { layout: "centered" },
  argTypes: {
    size: { control: "inline-radio", options: ["default", "sm"] },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Collection</CardTitle>
        <CardDescription>articles</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">12 fields / 340 items</p>
      </CardContent>
    </Card>
  ),
};

/** CardAction はヘッダ右上に寄る(grid-cols-[1fr_auto] が有効になる)。 */
export const WithAction: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Collection</CardTitle>
        <CardDescription>articles</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">12 fields / 340 items</p>
      </CardContent>
    </Card>
  ),
};

/** CardFooter があると Card の下パディングが 0 になる(実装側の has-data-* 指定)。 */
export const WithFooter: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Collection</CardTitle>
        <CardDescription>articles</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">12 fields / 340 items</p>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
        <Button size="sm">Save</Button>
      </CardFooter>
    </Card>
  ),
};

/** size="sm" は --card-spacing を詰める。密度の比較用。 */
export const Compact: Story = {
  args: { size: "sm" },
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Collection</CardTitle>
        <CardDescription>articles</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">12 fields / 340 items</p>
      </CardContent>
    </Card>
  ),
};
