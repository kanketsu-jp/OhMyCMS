"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * ファイル一覧の上に、**外から放り込めば上がる**層をかぶせる。
 *
 * 🚨 `file-dropzone.tsx` とは用途が違う。あちらは**フォームの中の入力欄**（選んだものを
 *    `<input type="file">` に載せて、フォーム送信で上げる）。こちらは**一覧そのものが受け皿**で、
 *    落とした瞬間に上がる。片方を流用すると、どちらかの前提が壊れる。
 *
 * 🚨 **画面内の要素をドラッグしているときは反応しない。** ファイルをフォルダへ運ぶ操作
 *    （同じ画面で行う D&D）と取り違えると、**移動しようとしただけでアップロードが始まる**。
 *    `dataTransfer.types` に `Files` が入っているかで、外から来たものだけを受ける。
 */
export function FilesDropUpload({
  folder,
  children,
}: {
  /** いま開いているフォルダ。ここへ入れる。ルートなら null。 */
  folder: string | null;
  children: React.ReactNode;
}) {
  const t = useT("files");
  const router = useRouter();
  const [over, setOver] = useState(false);
  // 🚨 dragenter / dragleave は**子要素をまたぐたびに発火する**ので、
  //    素直に真偽値で持つと、子の上を通るたびに枠が点滅する。深さを数える。
  const depth = useRef(0);

  const carriesFiles = (event: React.DragEvent): boolean =>
    Array.from(event.dataTransfer.types).includes("Files");

  // 🚨 2回目の投下が1回目の最中に走るのを同期的に止める。useState では間に合わない。
  const upload = useSubmitOnce(async (files: File[]) => {
    let done = 0;
    let failed = 0;
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      if (folder) form.append("folder", folder);
      try {
        const response = await fetch("/api/files", { method: "POST", body: form });
        if (response.ok) done += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    // 🚨 「何件上がって何件落ちたか」を出す。まとめて「失敗しました」にすると、
    //    **一部だけ上がった状態**が見えなくなる。
    if (done > 0) toast.success(t("drop_uploaded", { count: String(done) }));
    if (failed > 0) toast.error(t("drop_failed", { count: String(failed) }));
    if (done > 0) router.refresh();
  });

  // 🚨 ページの外へ落としたときにブラウザがそのファイルを開いてしまうのを止める。
  //    これが無いと、狙いを外しただけで**画面が離れて、書きかけが消える**。
  useEffect(() => {
    const prevent = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        // preventDefault を呼ばないと drop が飛ばない（既定はドロップを拒否）。
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return;
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setOver(false);
        }
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) void upload.run(files);
      }}
    >
      {children}
      {over || upload.pending ? (
        <div
          // 🚨 覆っている間もドロップを受けたいので、当たり判定を通す（pointer-events-none）。
          //    ここを塞ぐと、枠が出た瞬間に drop が自分に来なくなって**落とせなくなる**。
          className={cn(
            "pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg",
            "outline-2 outline-offset-[-2px] outline-dashed outline-ring",
            "bg-background/80 text-sm font-medium",
          )}
        >
          <span className="flex items-center gap-2">
            <UploadCloud className="size-5" />
            {upload.pending ? t("drop_uploading") : t("drop_here")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
