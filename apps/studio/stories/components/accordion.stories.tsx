import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const meta = {
  title: "Components/Accordion",
  component: Accordion,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 閉じた状態から開閉でき、各項目の罫線と余白が揃うことを確かめる。 */
export const Default: Story = {
  render: (args) => (
    <Accordion {...args} className="max-w-xl">
      <AccordionItem value="collections">
        <AccordionTrigger>コレクション設定</AccordionTrigger>
        <AccordionContent>
          表示名、識別子、API で使う名前をまとめて確認します。
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="fields">
        <AccordionTrigger>フィールド設定</AccordionTrigger>
        <AccordionContent>
          型、必須、既定値、一覧での表示方法を調整します。
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

/** 初期表示で1項目だけ開いている状態。アイコンの上下切り替えも見る。 */
export const Opened: Story = {
  render: (args) => (
    <Accordion {...args} defaultValue={["fields"]} className="max-w-xl">
      <AccordionItem value="collections">
        <AccordionTrigger>コレクション設定</AccordionTrigger>
        <AccordionContent>管理画面に出す単位を定義します。</AccordionContent>
      </AccordionItem>
      <AccordionItem value="fields">
        <AccordionTrigger>フィールド設定</AccordionTrigger>
        <AccordionContent>
          テキスト、数値、日付、リレーションなどの入力方法を決めます。
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

/** 長い本文でもパネル内の行間と下余白が崩れないことを確かめる。 */
export const LongContent: Story = {
  render: (args) => (
    <Accordion {...args} defaultValue={["notes"]} className="max-w-xl">
      <AccordionItem value="notes">
        <AccordionTrigger>公開前チェック</AccordionTrigger>
        <AccordionContent>
          <p>
            この項目では、入力済みのタイトル、説明文、公開日時、権限設定が
            そろっているかを確認します。
          </p>
          <p>
            本文が複数段落になっても、パネルの高さ計算とアニメーションが自然に
            動くことを見ます。
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
