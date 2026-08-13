import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Label } from "@/components/ui/label";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { NativeSelect, Textarea } from "@/components/ui/textarea";

/**
 * 複数行の入力と、ネイティブの `<select>`。
 *
 * 見るべきは **面の中と外で見た目が変わる**こと。
 * 面の中では罫線を外して背景で区別する（罫線の中に罫線を作らないため）。
 * 実装は `useInsideSurface()` で自分の位置を知る。
 */
const meta = {
  title: "Components/Textarea",
  component: Textarea,
  parameters: { layout: "padded" },
  args: { placeholder: "ここに入力します" },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 面の外。罫線で区別する。 */
export const OutsideSurface: Story = {
  render: (args) => (
    <div className="max-w-md space-y-2">
      <Label htmlFor="ta-outside">面の外</Label>
      <Textarea {...args} id="ta-outside" rows={4} />
    </div>
  ),
};

/** 面の中。**罫線が消えて背景で区別される**（ここが要点）。 */
export const InsideSurface: Story = {
  render: (args) => (
    <Surface className="max-w-md">
      <SurfaceTitle>面の中</SurfaceTitle>
      <Label htmlFor="ta-inside">罫線は出ない</Label>
      <Textarea {...args} id="ta-inside" rows={4} />
    </Surface>
  ),
};

/** 面の外と中を並べて、違いを1画面で見る。 */
export const Comparison: Story = {
  render: (args) => (
    <div className="grid max-w-3xl gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="ta-cmp-out">面の外（罫線あり）</Label>
        <Textarea {...args} id="ta-cmp-out" rows={3} />
      </div>
      <Surface>
        <Label htmlFor="ta-cmp-in">面の中（背景で区別）</Label>
        <Textarea {...args} id="ta-cmp-in" rows={3} />
      </Surface>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "編集できません" },
  render: (args) => (
    <div className="max-w-md">
      <Textarea {...args} rows={3} />
    </div>
  ),
};

/** ネイティブの `<select>` も同じ規則に従う。 */
export const NativeSelectStates: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="sel-out">面の外（罫線あり）</Label>
        <NativeSelect id="sel-out" defaultValue="ja">
          <option value="ja">ja</option>
          <option value="en">en</option>
        </NativeSelect>
      </div>
      <Surface>
        <Label htmlFor="sel-in">面の中（背景で区別）</Label>
        <NativeSelect id="sel-in" defaultValue="ja">
          <option value="ja">ja</option>
          <option value="en">en</option>
        </NativeSelect>
      </Surface>
    </div>
  ),
};
