"use client";

import { UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";

import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { useFormat, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * ファイルを受け取る領域。
 *
 * 🚨 **`@shadcn/attachment` はアップローダーではない**（表示だけ）。ドロップ領域は shadcn に無いので
 * ここだけ自作する。`@shadcn/input-file` は**ネイティブの input を装飾しただけ**で、
 * 堀池さんが「使うな」と言っているものそのもの。
 *
 * 🚨 **「ファイルを選択 / ファイル未選択」を画面に出さない。**
 * それがオーナーの指摘の中身なので、`<input type="file">` は**隠して**、
 * クリックとドロップの両方をこの箱で受ける。
 *
 * 🚨 選んだものの表示は **`Attachment` に任せる**（サムネ・題名・削除・state を持っている）。
 * `AttachmentGroup` は横に並べると端がフェードする（§6 も同時に満たす）。
 */
export function FileDropzone({ name = "file" }: { name?: string }) {
  const t = useT("files");
  const format = useFormat();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);

  const accept = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFiles(Array.from(list));
    // 選んだものを実際の input にも載せる（送信されるのはこちら）
    if (inputRef.current) inputRef.current.files = list;
  };

  const remove = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    const dt = new DataTransfer();
    for (const file of next) dt.items.add(file);
    if (inputRef.current) inputRef.current.files = dt.files;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 🚨 罫線は破線1本だけ。塗りを足すと面が2段になる（憲章 §1） */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-32 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-sm transition-colors",
          over
            ? "border-ring text-foreground"
            : "border-input text-muted-foreground hover:text-foreground",
        )}
      >
        <UploadCloud className="size-6" />
        <span>{over ? t("drop_active") : t("drop_label")}</span>
        <span className="text-xs">{t("drop_hint")}</span>
      </button>

      {/* 🚨 これが本体。見た目に出さない（「ファイル未選択」を出さないため） */}
      <input
        ref={inputRef}
        type="file"
        name={name}
        multiple
        className="sr-only"
        onChange={(event) => accept(event.target.files)}
      />

      {files.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t("selected_count", { count: format.number(files.length) })}
          </p>
          <AttachmentGroup>
            {files.map((file, index) => (
              <Attachment key={`${file.name}-${index}`} state="idle">
                <AttachmentMedia>
                  {file.type.startsWith("image/") ? (
                    // 選んだ直後はまだサーバに無いので、ローカルの URL で見せる
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="size-full object-cover"
                    />
                  ) : null}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{file.name}</AttachmentTitle>
                </AttachmentContent>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("remove_file")}
                  onClick={() => remove(index)}
                >
                  <X />
                </Button>
              </Attachment>
            ))}
          </AttachmentGroup>
        </>
      ) : null}
    </div>
  );
}
