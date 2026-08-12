import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const meta = {
  title: "Components/Table",
  component: Table,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS = [
  { id: "1", collection: "articles", fields: 12, items: 340 },
  { id: "2", collection: "authors", fields: 6, items: 28 },
  { id: "3", collection: "categories", fields: 4, items: 15 },
];

export const Default: Story = {
  render: (args) => (
    <Table {...args}>
      <TableHeader>
        <TableRow>
          <TableHead>collection</TableHead>
          <TableHead className="text-right">fields</TableHead>
          <TableHead className="text-right">items</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.collection}</TableCell>
            <TableCell className="text-right">{row.fields}</TableCell>
            <TableCell className="text-right">{row.items}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const WithCaptionAndFooter: Story = {
  render: (args) => (
    <Table {...args}>
      <TableCaption>Collections registered in this project</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>collection</TableHead>
          <TableHead className="text-right">fields</TableHead>
          <TableHead className="text-right">items</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.collection}</TableCell>
            <TableCell className="text-right">{row.fields}</TableCell>
            <TableCell className="text-right">{row.items}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>total</TableCell>
          <TableCell className="text-right">22</TableCell>
          <TableCell className="text-right">383</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};

/** 行に操作ボタンが並ぶ、管理画面の実際の形。 */
export const WithRowActions: Story = {
  render: (args) => (
    <Table {...args}>
      <TableHeader>
        <TableRow>
          <TableHead>collection</TableHead>
          <TableHead className="w-px" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.collection}</TableCell>
            <TableCell className="whitespace-nowrap">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm">
                  Edit
                </Button>
                <Button variant="destructive" size="sm">
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const Empty: Story = {
  render: (args) => (
    <Table {...args}>
      <TableHeader>
        <TableRow>
          <TableHead>collection</TableHead>
          <TableHead className="text-right">items</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={2} className="text-center text-muted-foreground">
            —
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
