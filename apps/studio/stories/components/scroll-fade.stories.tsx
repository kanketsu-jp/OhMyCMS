import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { ScrollFade } from "@/components/ui/scroll-fade";

const meta = {
  title: "Components/ScrollFade",
  component: ScrollFade,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ScrollFade>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 横にあふれる内容。左右端のフェードと横スクロールを確かめる。 */
export const Default: Story = {
  render: (args) => (
    <ScrollFade {...args} className="w-80 rounded-lg border border-border">
      <div className="flex w-max gap-2 p-3">
        {["下書き", "公開済み", "予約投稿", "レビュー中", "差し戻し", "アーカイブ"].map(
          (label) => (
            <span
              key={label}
              className="rounded-md border border-border bg-muted px-3 py-2 text-sm whitespace-nowrap"
            >
              {label}
            </span>
          ),
        )}
      </div>
    </ScrollFade>
  ),
};

/** 縦にあふれる内容。上下端のフェードがスクロールに追従することを確認する。 */
export const Vertical: Story = {
  render: (args) => (
    <ScrollFade
      {...args}
      direction="vertical"
      className="h-44 w-80 rounded-lg border border-border"
    >
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="rounded-md bg-muted px-3 py-2 text-sm">
            監査ログ {index + 1}
          </div>
        ))}
      </div>
    </ScrollFade>
  ),
};

/** 幅の狭い一覧。長いラベルでも中身側が横に伸びることを見る。 */
export const Narrow: Story = {
  render: (args) => (
    <ScrollFade {...args} className="w-48 rounded-lg border border-border">
      <div className="flex w-max gap-2 p-3">
        {["とても長いコレクション名", "公開", "未公開", "要確認"].map((label) => (
          <span
            key={label}
            className="rounded-md bg-muted px-3 py-2 text-sm whitespace-nowrap"
          >
            {label}
          </span>
        ))}
      </div>
    </ScrollFade>
  ),
};
