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
type Props = {
  name?: string;
  /**
   * 選んだものが変わるたびに呼ばれる（**省略可**）。
   *
   * 🚨 **これが無いと、フォーム送信以外の経路では使えない。**
   * この部品はもともと「隠した input に載せて、**フォームと一緒に multipart で送る**」前提で、
   * 外へ渡す口が無かった。ところがロゴの欄は、選んだ瞬間に
   * `/api/onboarding/logo` へ**単独で POST** し、返った ID をフォームの値に使う。
   * 送り方が multipart かどうかは関係なく、**送る主体がフォームか部品の外か**が違う。
   *
   * 消したときも呼ぶ（**消した結果の配列**を渡す。空なら空配列）。
   */
  onSelect?: (files: File[]) => void;
};

export function FileDropzone({ name = "file", onSelect }: Props) {
  const t = useT("files");
  const format = useFormat();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);

  const accept = (list: FileList | null) => {
    // 🚨 選び直しの途中でやめた（ダイアログを閉じた）ときは**何もしない**。
    // ここで空配列を通すと、外側が「消された」と受け取って既に選ばれているものを捨てる。
    if (!list || list.length === 0) return;
    const next = Array.from(list);
    setFiles(next);
    // 選んだものを実際の input にも載せる（フォームと一緒に送られるのはこちら）
    if (inputRef.current) inputRef.current.files = list;
    onSelect?.(next);
  };

  const remove = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    const dt = new DataTransfer();
    for (const file of next) dt.items.add(file);
    if (inputRef.current) inputRef.current.files = dt.files;
    onSelect?.(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 🚨 **border ではなく outline** で破線を描く。
          `Surface` の中に置くと、4辺の罫線は**面レベル2**として数えられる
          （実測で `pc /admin/files/new` が深さ2になった。design も
           `Attachment` について同じ注意をしている）。
          `outline` は面の判定（罫線・背景・影）のどれでもなく、場所も取らない。
          塗り（bg）で代用すると「親と違う背景」で同じく面に数えられるので、それも避ける。 */}
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
          "flex min-h-32 w-full flex-col items-center justify-center gap-1 rounded-lg px-4 py-6 text-sm outline-1 outline-offset-[-1px] outline-dashed transition-colors",
          over
            ? "text-foreground outline-ring"
            : "text-muted-foreground outline-input hover:text-foreground",
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
