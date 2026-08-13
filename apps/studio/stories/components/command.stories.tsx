import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileIcon, FolderIcon, SettingsIcon } from "lucide-react";

// 🚨 実装をそのまま import する(コピーしない)。
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

/**
 * コマンドパレット。横断検索（F2-J）の本体。
 *
 * **キーボードだけで選べる**（↑↓ で移動・Enter で決定）のはこの部品の機能で、
 * 自作していない。story でも実際に矢印キーで動かせる。
 *
 * 🚨 横断検索では `shouldFilter={false}` にしてサーバの結果だけを出す。
 *    ここでは部品の既定（クライアント側で絞る）を見せている。
 */
const meta = {
  title: "Components/Command",
  component: Command,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-96 rounded-xl ring-1 ring-foreground/10">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Command {...args}>
      <CommandInput placeholder="検索" />
      <CommandList>
        <CommandEmpty>見つかりませんでした。</CommandEmpty>
        <CommandGroup heading="コレクション">
          <CommandItem>
            <FolderIcon />
            articles
          </CommandItem>
          <CommandItem>
            <FolderIcon />
            authors
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="ファイル">
          <CommandItem>
            <FileIcon />
            logo.png
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="設定">
          <CommandItem>
            <SettingsIcon />
            サービス名
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

/** 何も無いときの見え方。 */
export const Empty: Story = {
  render: (args) => (
    <Command {...args}>
      <CommandInput placeholder="検索" defaultValue="該当しない語" />
      <CommandList>
        <CommandEmpty>見つかりませんでした。</CommandEmpty>
      </CommandList>
    </Command>
  ),
};

/** サーバ側で絞る使い方（横断検索と同じ設定）。入力しても候補が減らない。 */
export const ServerFiltered: Story = {
  render: () => (
    <Command shouldFilter={false}>
      <CommandInput placeholder="検索" />
      <CommandList>
        <CommandGroup heading="アイテム">
          <CommandItem>山田さんの記事メモ</CommandItem>
          <CommandItem>鈴木さんの記事メモ</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
