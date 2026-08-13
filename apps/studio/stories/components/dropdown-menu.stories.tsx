import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const meta = {
  title: "Components/DropdownMenu",
  component: DropdownMenu,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const triggerClassName =
  "inline-flex h-(--control-h) items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted md:h-(--control-h-pc)";

/** trigger から開く基本メニュー。Label は必ず Group の中に置く。 */
export const Default: Story = {
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className={triggerClassName}>
        操作を開く
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>コレクション</DropdownMenuLabel>
          <DropdownMenuItem>
            編集
            <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>複製</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">削除</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** チェック項目の選択状態。Base UI の checked 表示を確認する。 */
export const CheckboxItems: Story = {
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className={triggerClassName}>
        表示項目
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>一覧の列</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>タイトル</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>公開状態</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>更新者</DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** ラジオ項目と区切り線。選ばれている状態の indicator を見る。 */
export const RadioItems: Story = {
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className={triggerClassName}>
        並び替え
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>並び順</DropdownMenuLabel>
          <DropdownMenuRadioGroup value="updated">
            <DropdownMenuRadioItem value="updated">
              更新日順
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="created">
              作成日順
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="title">タイトル順</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>設定を保存</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** サブメニュー。右側へ開く子メニューの位置と矢印を確かめる。 */
export const WithSubmenu: Story = {
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className={triggerClassName}>
        追加
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>作成</DropdownMenuLabel>
          <DropdownMenuItem>新規記事</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>テンプレートから作成</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuItem>ニュース</DropdownMenuItem>
              <DropdownMenuItem>お知らせ</DropdownMenuItem>
              <DropdownMenuItem>ヘルプ</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
