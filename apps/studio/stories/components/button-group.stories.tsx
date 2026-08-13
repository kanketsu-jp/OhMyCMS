import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { ButtonGroup } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Components/ButtonGroup",
  component: ButtonGroup,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 横並びの標準形。隣接するボタンの角丸と境界線がつながることを確かめる。 */
export const Default: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline">下書き</Button>
      <Button variant="outline">公開</Button>
      <Button variant="outline">予約</Button>
    </ButtonGroup>
  ),
};

/** 縦方向のまとまり。上下の境界線と角丸の切り替えを見る。 */
export const Vertical: Story = {
  render: (args) => (
    <ButtonGroup {...args} orientation="vertical">
      <Button variant="outline">上へ移動</Button>
      <Button variant="outline">複製</Button>
      <Button variant="outline">下へ移動</Button>
    </ButtonGroup>
  ),
};

/** グループの中に別グループを置いたとき、外側だけ gap が入ることを確かめる。 */
export const NestedGroups: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <ButtonGroup>
        <Button variant="outline">左</Button>
        <Button variant="outline">中央</Button>
        <Button variant="outline">右</Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">戻す</Button>
        <Button variant="outline">進める</Button>
      </ButtonGroup>
    </ButtonGroup>
  ),
};
