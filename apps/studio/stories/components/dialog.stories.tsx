import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する(コピーしない)。
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 実装の DialogContent / DialogFooter は `useT("common")` を呼ぶ(閉じるボタンの文言)。
 * .storybook/preview.tsx の I18nProvider デコレータが無いと throw する。
 * 文言は辞書から来るので、ツールバーの locale を ja/en で切り替えると変わる。
 */
const meta = {
  title: "Components/Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        Open dialog
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create collection</DialogTitle>
          <DialogDescription>
            A new table will be created in PostgreSQL.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="story-dialog-name">Collection name</Label>
          <Input id="story-dialog-name" placeholder="articles" />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/** 既定で開いた状態。ダーク/ライトの見え方を比べるときに使う。 */
export const Open: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create collection</DialogTitle>
          <DialogDescription>
            A new table will be created in PostgreSQL.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="story-dialog-open-name">Collection name</Label>
          <Input id="story-dialog-open-name" placeholder="articles" />
        </div>
        <DialogFooter>
          <Button>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * DialogFooter の showCloseButton は文言を辞書 common.close から取る。
 * ツールバーの locale を切り替えるとこのボタンのラベルだけが変わる。
 */
export const FooterCloseFromDictionary: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete collection</DialogTitle>
          <DialogDescription>
            The table and all of its rows will be dropped.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/** 右上の × を消した形(showCloseButton={false})。 */
export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Processing</DialogTitle>
          <DialogDescription>Please wait.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ),
};
