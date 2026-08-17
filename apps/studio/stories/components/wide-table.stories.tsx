import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { WideTable } from "@/components/admin/wide-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const meta = {
  title: "Components/WideTable",
  component: WideTable,
  parameters: { layout: "padded" },
} satisfies Meta<typeof WideTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const COLUMNS = Array.from({ length: 20 }, (_, index) => `c${index + 1}`);
const ROWS = Array.from({ length: 4 }, (_, rowIndex) => ({
  id: `r${rowIndex + 1}`,
  values: COLUMNS.map((column) => `${column}-${rowIndex + 1}`),
}));

function OverflowingTable() {
  return (
    <Table className="min-w-[1280px]">
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.id}>
            {row.values.map((value) => (
              <TableCell key={value}>{value}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export const CompareFade: Story = {
  args: {
    children: null,
  },
  render: (args) => (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 text-sm font-medium">wide</h2>
        <WideTable {...args} fade="wide">
          <OverflowingTable />
        </WideTable>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">strong</h2>
        <WideTable {...args} fade="strong">
          <OverflowingTable />
        </WideTable>
      </section>
    </div>
  ),
};
