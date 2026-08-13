import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Button } from "@/components/ui/button";
import {
  Surface,
  SurfaceDescription,
  SurfaceDivider,
  SurfaceTitle,
} from "@/components/ui/surface";

/**
 * 面（Surface）。**罫線・背景・影のうち1つだけ**で区切りを作る部品。
 *
 * 一番大事なのは「**面の中に面を作らない**」こと。入れ子にすると
 * Surface 側が自動で `plain` へ降格し、開発時は console に警告が出る。
 * その挙動そのものを story にしてある（`Nested`）。
 *
 * SP（器が狭いとき）は角丸・囲み罫線を出さず**上下の Divider だけ**になる。
 * Storybook のビューポートを狭くすると切り替わるのが見える。
 */
const meta = {
  title: "Components/Surface",
  component: Surface,
  parameters: { layout: "padded" },
  argTypes: {
    tone: { control: "inline-radio", options: ["outline", "muted", "plain"] },
    padded: { control: "boolean" },
  },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Surface {...args}>
      <SurfaceTitle>コレクション</SurfaceTitle>
      <SurfaceDescription>
        テーブルを作成し、フィールド定義へ進みます。
      </SurfaceDescription>
      <Button size="sm" className="self-start">
        新規作成
      </Button>
    </Surface>
  ),
};

/** 罫線を持たず背景だけで区切る。中に入力を置くときはこちらが素直。 */
export const Muted: Story = {
  args: { tone: "muted" },
  render: (args) => (
    <Surface {...args}>
      <SurfaceTitle>背景だけの面</SurfaceTitle>
      <SurfaceDescription>罫線を持たないので、隣り合っても線が重ならない。</SurfaceDescription>
    </Surface>
  ),
};

/** 面を出さず余白だけ。入れ子になったときの実際の見え方でもある。 */
export const Plain: Story = {
  args: { tone: "plain" },
  render: (args) => (
    <Surface {...args}>
      <SurfaceTitle>面を出さない</SurfaceTitle>
      <SurfaceDescription>余白だけを持つ。</SurfaceDescription>
    </Surface>
  ),
};

/**
 * 面の中を区切りたくなったときの**唯一の手段**。
 * ここで新しい Surface を作らないための部品。
 */
export const WithDivider: Story = {
  render: (args) => (
    <Surface {...args}>
      <SurfaceTitle>設定</SurfaceTitle>
      <SurfaceDescription>上の節。</SurfaceDescription>
      <SurfaceDivider />
      <SurfaceDescription>下の節。面を増やさずに分けられる。</SurfaceDescription>
    </Surface>
  ),
};

/**
 * 🚨 **やってはいけない形**。面の中に面を置くと、内側は自動で `plain` へ降格する
 * （＝三重罫線にならない）。開発時は console に警告が出る。
 * 「うっかり入れ子にしても壊れない」ことを確かめるための story。
 */
export const Nested: Story = {
  render: (args) => (
    <Surface {...args}>
      <SurfaceTitle>外側の面</SurfaceTitle>
      <Surface>
        <SurfaceTitle>内側の面（罫線は出ない）</SurfaceTitle>
        <SurfaceDescription>
          降格するので、見た目が三重にならない。
        </SurfaceDescription>
      </Surface>
    </Surface>
  ),
};
