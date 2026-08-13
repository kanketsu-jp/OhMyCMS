import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する（コピーしない）。
import { FilePicker } from "@/components/admin/file-picker";

/**
 * アイテム編集の「ファイルを選ぶ」欄。押すとダイアログが開き、
 * 中に既存ファイルの一覧と **ドロップ領域（FileDropzone）** が入る。
 *
 * 🚨 **この story は測るために置いてある。**
 * FilePicker は `item-form.tsx` の **file 欄を持つフィールド**からしか開けず、
 * :3102 のコレクションには file 欄が1つも無い。
 * 実物で測ろうとすると**共有 DB に DDL を走らせる**ことになるので、ここで測る:
 *
 * ```
 * node scripts/audit-surface-depth.mjs --base http://localhost:3104 \
 *   --paths '/iframe.html?id=pages-filepicker--default&viewMode=story' \
 *   --click '[data-slot=dialog-trigger]' --file <なにかの png>
 * ```
 *
 * 見たいのは「**ダイアログ（bg-popover ＝ 面）の中で Attachment が2段目にならないか**」。
 *
 * 🚨 `stories/components/` に置かないこと。
 * `.storybook/check-stories.mjs` はあのディレクトリを **`components/ui/` と1対1**で照合するので、
 * `components/ui/file-picker.tsx` が無い以上「実装が無い story」として落ちる。
 *
 * なお Storybook には API サーバが無いので、既存ファイルの一覧は取得に失敗する。
 * **面の深さを測るには関係ない**（ドロップ領域と、選んだ後の Attachment は描かれる）。
 */
const meta = {
  title: "Pages/FilePicker",
  component: FilePicker,
  parameters: { layout: "padded" },
} satisfies Meta<typeof FilePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { inputId: "story-file", name: "file" },
};

/** 既に選ばれている状態。値は表示用の ID で、実在しなくてよい。 */
export const WithValue: Story = {
  args: {
    inputId: "story-file-selected",
    name: "file",
    defaultValue: "00000000-0000-4000-8000-000000000000",
  },
};
