import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { FileTextIcon, ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";

const meta = {
  title: "Components/Attachment",
  component: Attachment,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Attachment>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 添付1件の標準表示。題名の省略とアクションの位置を確かめる。 */
export const Default: Story = {
  render: (args) => (
    <Attachment {...args}>
      <AttachmentMedia>
        <FileTextIcon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>contract-final.pdf</AttachmentTitle>
        <AttachmentDescription>248 KB</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction aria-label="削除">
          <Trash2Icon />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  ),
};

/** state ごとの見え方。処理中の shimmer とエラー色の違いを見る。 */
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Attachment state="idle">
        <AttachmentMedia>
          <UploadIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>アップロード待ち</AttachmentTitle>
          <AttachmentDescription>ファイルを選択してください</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
      <Attachment state="processing">
        <AttachmentMedia>
          <ImageIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>thumbnail.png</AttachmentTitle>
          <AttachmentDescription>変換しています</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
      <Attachment state="error">
        <AttachmentMedia>
          <FileTextIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>large-export.zip</AttachmentTitle>
          <AttachmentDescription>上限サイズを超えています</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
    </div>
  ),
};

/** 縦向きカード。サムネイル面と右上アクションの重なりを確かめる。 */
export const Vertical: Story = {
  render: (args) => (
    <Attachment {...args} orientation="vertical">
      <AttachmentMedia>
        <ImageIcon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>hero-image.png</AttachmentTitle>
        <AttachmentDescription>1200 x 800</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction aria-label="削除">
          <Trash2Icon />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  ),
};

/** 横にあふれた添付一覧。AttachmentGroup の scroll-fade-x を確認する。 */
export const ScrollGroup: Story = {
  render: () => (
    <AttachmentGroup className="max-w-md">
      {["draft.pdf", "cover.png", "schedule.xlsx", "notes.txt", "report.pdf"].map(
        (name) => (
          <Attachment key={name}>
            <AttachmentTrigger aria-label={`${name} を開く`} />
            <AttachmentMedia>
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{name}</AttachmentTitle>
              <AttachmentDescription>128 KB</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        ),
      )}
    </AttachmentGroup>
  ),
};
