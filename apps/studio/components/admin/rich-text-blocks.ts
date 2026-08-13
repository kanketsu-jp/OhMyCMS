/**
 * 登録簿（`lib/richtext/blocks.ts`）の宣言から、Tiptap のノードを組み立てる。
 *
 * 🚨 **自作ブロックを増やすのにこのファイルを触らない**のが目的。
 * 登録簿に1件足せば、編集画面でも保存でも扱えるようになる。
 * 既存CMSがここで「コアにハードコード」「フォークが必要」になっていた
 * （`.temp/2026-08-13/specs/F8-tiptap.md` §2-2）。
 */

// `@tiptap/react` が `@tiptap/core` を再輸出しているので、依存を1つ増やさずに済ませる
import { Node, mergeAttributes } from "@tiptap/react";
import { RICHTEXT_BLOCKS, type RichTextBlockDefinition } from "@/lib/richtext/blocks";

function createBlockExtension(block: RichTextBlockDefinition) {
  return Node.create({
    name: block.name,
    group: "block",
    // 中に文字を持たない塊として扱う（選択・削除がブロック単位になる）
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return Object.fromEntries(
        Object.keys(block.attrs).map((key) => [
          key,
          {
            default: null,
            // 🚨 属性は `data-*` に載せる。素の属性名で出すと、
            // 将来 HTML から読み戻すときに既存の属性とぶつかる
            parseHTML: (element: HTMLElement) => element.getAttribute(`data-${key}`),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes[key] == null ? {} : { [`data-${key}`]: String(attributes[key]) },
          },
        ]),
      );
    },

    parseHTML() {
      return [{ tag: `div[data-richtext-block="${block.name}"]` }];
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-richtext-block": block.name,
          class: "rounded-lg bg-muted px-3 py-2 text-sm",
        }),
        // 編集画面での見え方。配信側の見た目は SDK の <RichText> が決める
        block.name,
      ];
    },
  });
}

export const richTextBlockExtensions = RICHTEXT_BLOCKS.map(createBlockExtension);
