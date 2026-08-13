import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const meta = {
  title: "Components/Sheet",
  component: Sheet,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const triggerClassName =
  "inline-flex h-(--control-h) items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted md:h-(--control-h-pc)";

const closeClassName =
  "inline-flex h-(--control-h) items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted md:h-(--control-h-pc)";

/** trigger から右側へ開く標準形。header/footer と閉じる操作を確かめる。 */
export const Default: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className={triggerClassName}>詳細を開く</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>記事の詳細</SheetTitle>
          <SheetDescription>
            公開状態、担当者、更新日時を確認できます。
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 text-sm">
          本文の抜粋や関連するメタデータをここに表示します。
        </div>
        <SheetFooter>
          <SheetClose className={closeClassName}>閉じる</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

/** 左側から開く形。side ごとの幅とスライド方向の違いを見る。 */
export const LeftSide: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className={triggerClassName}>ナビを開く</SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>ナビゲーション</SheetTitle>
          <SheetDescription>管理画面の主な行き先を表示します。</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-2 px-4 text-sm">
          <a className="rounded-md bg-muted px-3 py-2" href="#">
            ダッシュボード
          </a>
          <a className="rounded-md px-3 py-2 hover:bg-muted" href="#">
            コレクション
          </a>
          <a className="rounded-md px-3 py-2 hover:bg-muted" href="#">
            ファイル
          </a>
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

/** 下から開く確認用の形。モバイルに近い高さのドロワーを確認する。 */
export const BottomSide: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className={triggerClassName}>確認を開く</SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>公開しますか</SheetTitle>
          <SheetDescription>
            公開後は閲覧権限のあるユーザーに表示されます。
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose className={closeClassName}>キャンセル</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
