"use client";

/**
 * 本文（リッチテキスト）の入力欄。`interface = "richtext"` のフィールドがこれになる。
 *
 * 🚨 **保存するのは ProseMirror の doc JSON**（決定 D-F8-01）。HTML 文字列は作らない。
 * 送信は、既存のフォーム（Server Action への素の POST）に合わせて
 * **hidden input へ JSON を載せる**。エディタ自体はクライアントでしか動かない。
 *
 * ツールバーの形は design(w4A:p7) の決定に従う（`.temp/2026-08-13/f2j-state.md` §12-1）:
 * 面にしない（`border-b` 1本）/ SP 44px・PC 32px / SP は「…」でなく横スクロール /
 * 並びは使用頻度順 / 色・文字サイズ・下線は持たせない。
 */

import { useRef, useState } from "react";
import NextImage from "next/image";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import {
  Bold,
  Code,
  ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Table as TableIcon,
  Strikethrough,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/i18n/client";
import {
  emptyDocument,
  isAllowedLinkHref,
  isRichTextDocument,
  sanitizeDocument,
  type RichTextDocument,
} from "@/lib/richtext/document";
import { cn } from "@/lib/utils";

type Props = {
  inputId: string;
  name: string;
  defaultValue?: unknown;
  required?: boolean;
};

type FileRow = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
};

function initialDocument(value: unknown): RichTextDocument {
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (isRichTextDocument(parsed)) return parsed;
    } catch {
      // 壊れた JSON で編集画面ごと落とさない。空の本文から始める
    }
  }
  if (isRichTextDocument(value)) return value;
  return emptyDocument();
}

/**
 * ツールバーのボタン。
 * 🚨 押されている状態は**薄い塗り**で示す（罫線で囲まない = 面を増やさない）。
 * `aria-pressed` を state の正本にして、見た目は CSS に任せる。
 */
function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      {children}
    </Button>
  );
}

export function RichTextField({ inputId, name, defaultValue, required = false }: Props) {
  const t = useT("richtext");
  const hiddenRef = useRef<HTMLInputElement>(null);
  // 初期値は1回だけ作って固定する（useRef を描画中に読むと React 19 の規則に触れる）
  const [initial] = useState(() => initialDocument(defaultValue));

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState(false);

  const [imageOpen, setImageOpen] = useState(false);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);

  const editor = useEditor({
    // 🚨 SSR で描かせない。Next の SSR と ProseMirror の DOM 生成が食い違う
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // design の決定: 見出しは h2〜h4 だけ（h1 はページ側の見出し）
        heading: { levels: [2, 3, 4] },
        // 下線はリンクと見分けが付かなくなるので持たせない
        underline: false,
        link: {
          openOnClick: false,
          // 🚨 危ないスキームは**エディタが作らせない**。保存時の検証と二重にする
          isAllowedUri: (url) => isAllowedLinkHref(url),
          shouldAutoLink: (url) => isAllowedLinkHref(url),
        },
      }),
      // 画像は自分のアセット配信経路だけ。外部 URL は入れさせない
      TiptapImage.configure({ allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: initial,
    editorProps: {
      attributes: {
        // 本文は面を持たない（エディタの箱が面レベル1）
        class: "min-h-48 px-3 py-3 outline-none",
      },
    },
    // 🚨 打つたびに React の state を更新すると再描画が走る（憲章 §5-5）。
    // hidden input の value を直接書き換えて、再描画を起こさない。
    onUpdate: ({ editor: current }) => {
      if (!hiddenRef.current) return;
      hiddenRef.current.value = JSON.stringify(
        sanitizeDocument(current.getJSON() as RichTextDocument),
      );
    },
  });

  async function loadFiles() {
    setImageError(null);
    const response = await fetch("/api/files?limit=100", { cache: "no-store" });
    if (!response.ok) {
      setImageError(t("image_load_failed"));
      return;
    }
    const payload = await response.json().catch(() => null) as { data?: FileRow[] } | null;
    setFiles((payload?.data ?? []).filter((file) => file.type?.startsWith("image/")));
  }

  function openLinkDialog(current: Editor) {
    const href = current.getAttributes("link").href;
    setLinkValue(typeof href === "string" ? href : "");
    setLinkError(false);
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    if (!isAllowedLinkHref(linkValue)) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: linkValue.trim() }).run();
    setLinkOpen(false);
  }

  function insertImage(file: FileRow) {
    if (!editor) return;
    editor.chain().focus().setImage({ src: `/api/assets/${file.id}`, alt: file.title ?? file.filename_download }).run();
    setImageOpen(false);
  }

  return (
    <div className="rounded-lg bg-muted/60 focus-within:ring-3 focus-within:ring-ring/50">
      <input
        ref={hiddenRef}
        id={inputId}
        type="hidden"
        name={name}
        defaultValue={JSON.stringify(initial)}
        required={required}
      />

      {/*
        🚨 ツールバーは面にしない（区切りは border-b 1本だけ）。
        SP では「…」に畳まず横スクロールさせる（押す前に中身が分かるように）。
        sticky にしてあるのは、モバイルでキーボードが出ても隠れないようにするため。
      */}
      <ScrollFade
        direction="horizontal"
        className="sticky top-0 z-10 rounded-t-lg border-b border-border bg-muted/60"
      >
        <div className="flex w-max items-center gap-0.5 px-1">
          <ToolbarButton label={t("bold")} active={editor?.isActive("bold")} disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <Bold />
          </ToolbarButton>
          <ToolbarButton label={t("italic")} active={editor?.isActive("italic")} disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <Italic />
          </ToolbarButton>
          <ToolbarButton label={t("strike")} active={editor?.isActive("strike")} disabled={!editor} onClick={() => editor?.chain().focus().toggleStrike().run()}>
            <Strikethrough />
          </ToolbarButton>
          <ToolbarButton label={t("link")} active={editor?.isActive("link")} disabled={!editor} onClick={() => editor && openLinkDialog(editor)}>
            <Link2 />
          </ToolbarButton>
          {editor?.isActive("link") ? (
            <ToolbarButton label={t("link_remove")} onClick={() => editor.chain().focus().unsetLink().run()}>
              <Link2Off />
            </ToolbarButton>
          ) : null}

          <Separator orientation="vertical" className="mx-1 h-5" />

          {([2, 3, 4] as const).map((level) => (
            <ToolbarButton
              key={level}
              label={t(`heading_${level}`)}
              active={editor?.isActive("heading", { level })}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
            >
              <span className="text-sm font-semibold">H{level}</span>
            </ToolbarButton>
          ))}

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton label={t("unordered_list")} active={editor?.isActive("bulletList")} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            <List />
          </ToolbarButton>
          <ToolbarButton label={t("ordered_list")} active={editor?.isActive("orderedList")} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton label={t("quote")} active={editor?.isActive("blockquote")} disabled={!editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            <Quote />
          </ToolbarButton>
          <ToolbarButton label={t("code")} active={editor?.isActive("code")} disabled={!editor} onClick={() => editor?.chain().focus().toggleCode().run()}>
            <Code />
          </ToolbarButton>
          <ToolbarButton label={t("code_block")} active={editor?.isActive("codeBlock")} disabled={!editor} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
            <SquareCode />
          </ToolbarButton>
          <ToolbarButton label={t("horizontal_rule")} disabled={!editor} onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
            <Minus />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton
            label={t("image")}
            disabled={!editor}
            onClick={() => {
              setImageOpen(true);
              void loadFiles();
            }}
          >
            <ImageIcon />
          </ToolbarButton>
          <ToolbarButton
            label={t("table")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <TableIcon />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton label={t("undo")} disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton label={t("redo")} disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
            <Redo2 />
          </ToolbarButton>
        </div>
      </ScrollFade>

      <EditorContent editor={editor} aria-label={t("editor_label")} className="tiptap-body text-sm" />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("link_title")}</DialogTitle>
            <DialogDescription>{t("link_invalid")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${inputId}__link`}>{t("link_label")}</Label>
            <Input
              id={`${inputId}__link`}
              value={linkValue}
              onChange={(event) => {
                setLinkValue(event.target.value);
                setLinkError(false);
              }}
              aria-invalid={linkError}
            />
            {linkError ? <p className="text-sm text-destructive">{t("link_invalid")}</p> : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setLinkOpen(false)}>
              {t("cancel_button")}
            </Button>
            <Button type="button" onClick={applyLink}>
              {t("link_submit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="max-h-[84vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("image_title")}</DialogTitle>
            <DialogDescription>{t("image_description")}</DialogDescription>
          </DialogHeader>
          {imageError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {imageError}
            </div>
          ) : null}
          {files.length === 0 && !imageError ? (
            <p className="text-sm text-muted-foreground">{t("image_empty")}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((file) => (
              <button
                type="button"
                key={file.id}
                onClick={() => insertImage(file)}
                className="min-w-0 rounded-md p-2 text-left hover:bg-muted"
              >
                <div className="flex h-28 items-center justify-center overflow-hidden rounded-md bg-muted">
                  <NextImage
                    src={`/api/assets/${file.id}?width=200&fit=cover`}
                    alt={file.title ?? file.filename_download}
                    width={200}
                    height={200}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="mt-2 truncate text-sm font-medium">{file.title ?? file.filename_download}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
