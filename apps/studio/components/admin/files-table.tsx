"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, FileIcon } from "lucide-react";

import { DRAG_FILE_MIME } from "@/components/admin/files-drag";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/admin/error-banner";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useT } from "@/i18n/client";
import type { FileColumn } from "@/lib/admin/files-view";

type FileRow = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
  filesize: string | number | null;
  uploaded_on: string;
};

type FolderRow = {
  id: string;
  name: string;
};

/**
 * ファイル一覧の**表**表示。カード表示（`files-lightbox-grid`）と切り替えて使う。
 *
 * 🚨 **カード表示と同じ荷物で掴める**ようにしてある（`DRAG_FILE_MIME`）。
 *    表にしたら運べなくなる、では「表示を変えただけ」にならない。
 *
 * 🚨 **ライトボックスはここには無い**。表は「探す・並べる」ための見え方で、
 *    画像を大きく見るのはカード表示の役目、と割り切っている。
 *    （両方に持たせると、同じ状態を2箇所で持つことになる）
 */
export function FilesTable({
  folders,
  files,
  columns,
}: {
  folders: FolderRow[];
  files: FileRow[];
  /**
   * 出す項目。🚨 **名前も含む**（2026-08-17 から消せる。
   * `lib/admin/files-view.ts` の `ALWAYS_ON_COLUMN` に経緯）。
   */
  columns: readonly FileColumn[];
}) {
  const t = useT("files");
  const format = useFormat();
  const router = useRouter();
  const shows = (column: FileColumn): boolean => columns.includes(column);

  /**
   * まとめてゴミ箱へ入れるための選択。
   *
   * 🚨 **フォルダは選べない。** 口は `DELETE /api/files`（`{ids}`）で、**ファイルの id しか受けません**
   *   （storage・`a4e1ea8`）。**フォルダの行には空のセルを置く**——
   *   🚨 **チェック欄を出しておいて押せない、にしない**（`not-yet-allowed-is-not-logged-out` と同じ考え方で、
   *   **できないものを できそうに 見せない**）。
   *
   * 🚨 **危険色にしない。** この口は**ゴミ箱へ入れる（論理削除）**で、**ゴミ箱から戻せます**。
   *   危険色は「完全削除」に取ってある（`ui/alert-dialog.tsx` の tone）。
   *
   * 🚨 **カード表示では選べない**（いまは表だけ）。**そう書いておかないと
   *   「カードでは壊れている」と読まれる**——**まだ作っていないだけ**。
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<readonly { id: string; code: string }[]>([]);
  const [confirming, setConfirming] = useState(false);
  /**
   * 失敗の一覧から**その行へ飛ぶ**ため、行のチェック欄を覚えておく（base2・13 便目）。
   *
   * 🚨 **行そのものでなくチェック欄を覚える。** 焦点を当てられるのは操作できる要素だけで、
   *   `<tr>` に飛ばしても**キーボードの人はどこに来たか分からない**（焦点の輪が出ない）。
   *   チェック欄に焦点を当てれば、**輪が出る・自動で見える位置まで巻かれる・
   *   そのまま選び直せる**の 3 つが同時に済む。
   */
  const rowChecks = useRef(new Map<string, HTMLInputElement>());

  const jumpTo = (id: string) => {
    const box = rowChecks.current.get(id);
    if (!box) return;
    // 🚨 焦点だけだと端に貼り付くので、行を真ん中へ寄せてから当てる。
    box.closest("tr")?.scrollIntoView({ block: "center" });
    box.focus();
  };
  const selectedIds = files.filter((file) => selected.has(file.id)).map((file) => file.id);
  const allSelected = files.length > 0 && selectedIds.length === files.length;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const failureText = (code: string): string => {
    switch (code) {
      case "PERMISSION_DENIED":
        return t("bulk_failed_permission");
      case "FILE_NOT_FOUND":
        return t("bulk_failed_not_found");
      default:
        return t("bulk_failed_other");
    }
  };

  const trashSelected = useSubmitOnce(async () => {
    setConfirming(false);
    setFailures([]);
    const response = await fetch("/api/files", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: { deleted?: string[]; failed?: { id: string; code: string }[] } }
      | null;
    if (!response.ok) {
      setFailures(selectedIds.map((id) => ({ id, code: "OTHER" })));
      return;
    }
    const deleted = payload?.data?.deleted ?? [];
    const failed = payload?.data?.failed ?? [];
    setSelected(new Set());
    // 🚨 **`failed` を黙って捨てない。** 成功だけ出すと、利用者は 全部消えた と読む（storage の条件）。
    //   🚨 **一部でも失敗したらトーストにしない**——**消えると、どれが失敗したか追えない**
    //   （`decisions/toast-for-events-page-for-what-needs-fixing`＝ 直すべきことは その場に残す）。
    if (failed.length === 0) {
      toast.success(t("bulk_done", { count: String(deleted.length) }));
    } else {
      setFailures(failed);
    }
    router.refresh();
  });

  const size = (value: string | number | null): string => {
    if (value === null) return "—";
    const bytes = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(bytes)) return "—";
    // 🚨 桁を落として読みやすくする。**正確なバイト数が要る場面はここではない**。
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <>
      {/* 🚨 **失敗はその場に残す**（トーストにしない）。**どれが入らなかったかは、消えると追えない**。 */}
      {failures.length > 0 ? (
        <div className="mb-3 flex flex-col gap-1">
          <ErrorBanner
            message={t("bulk_partial", {
              done: String(selectedIds.length - failures.length),
              failed: String(failures.length),
            })}
          />
          <ul className="text-xs text-muted-foreground">
            {failures.map((failure) => {
              const row = files.find((file) => file.id === failure.id);
              const label = `${row?.filename_download ?? failure.id} — ${failureText(failure.code)}`;
              // 🚨 **その行が表に無いときは、押せる形にしない**（`base2`・13 便目）。
              //    押しても何も起きないボタンは、**壊れているのと見分けが付かない**。
              return (
                <li key={failure.id}>
                  {row ? (
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      title={t("bulk_jump_to_row")}
                      onClick={() => jumpTo(failure.id)}
                    >
                      {label}
                    </button>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* 🚨 **件数はヘッダに出さない**（base2 の実測: Directus も出していない）。
          **選んでいるときだけ、その場に出す**。 */}
      {selectedIds.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="mr-auto">{t("bulk_selected", { count: String(selectedIds.length) })}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t("bulk_clear")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={trashSelected.pending}
            onClick={() => setConfirming(true)}
          >
            {t("bulk_trash")}
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bulk_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("bulk_confirm", { count: String(selectedIds.length) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            {/* 🚨 tone は既定（ふつう）。**ゴミ箱へ入れるだけで、戻せる**。 */}
            <AlertDialogAction onClick={() => void trashSelected.run()}>
              {t("bulk_trash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    {/* 🚨 幅の狭い端末で表がはみ出さないよう、**表だけを横に流す**。
        ページごと横に流すと、他の要素まで一緒に動いて読めなくなる。 */}
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-xl border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {/* 🚨 見出しの列。**素の input を使う**（`ui/` に Checkbox は無く、
                この PJ は `agents-manager` などで素の input を使っている＝ 作法を増やさない）。 */}
            <th scope="col" className="w-8 py-2 pr-2">
              <input
                type="checkbox"
                className="size-4"
                aria-label={t("bulk_select_all")}
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(files.map((file) => file.id)))
                }
              />
            </th>
            {shows("name") ? <th scope="col" className="py-2 pr-4 font-medium">{t("column_name")}</th> : null}
            {shows("type") ? <th scope="col" className="py-2 pr-4 font-medium">{t("column_type")}</th> : null}
            {shows("size") ? <th scope="col" className="py-2 pr-4 font-medium">{t("column_size")}</th> : null}
            {shows("uploaded") ? <th scope="col" className="py-2 font-medium">{t("column_uploaded")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <tr
              key={folder.id}
              // 🚨 **行のどこをクリックしても開ける**（2026-08-17）。
              //    これを入れたので、**名前の列を消せる**ようになった（Directus と同じ形）。
              // 🚨 **押した先がボタン・リンクなら遷移しない。**
              //    いまこの行にボタンは無いので、この守りは何も変えない。
              //    在るのは、**選択のチェック欄が入った瞬間に「チェックを押したら詳細へ飛ぶ」になる**から。
              //    settings の 4 つの一覧では、削除ボタンが在るので既に必要だった（`120c16c`）。
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input")) return;
                router.push(`/admin/files?folder=${folder.id}`);
              }}
              className="cursor-pointer border-b last:border-0 hover:bg-muted active:bg-muted/80"
            >
              {/* 🚨 **フォルダは選べないので、空のセルを置く**（列をずらさないため）。
                  押せないチェック欄を出さない＝ できないものを できそうに 見せない。 */}
              <td className="w-8 py-2 pr-2" />
              {shows("name") ? (
                <td className="py-2 pr-4">
                  {/* 🚨 リンクは残す。**行のクリックだけにすると、
                      新しいタブで開く・キーボードで辿る、が全部できなくなる**。 */}
                  <Link href={`/admin/files?folder=${folder.id}`} className="flex min-w-0 items-center gap-2">
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{folder.name}</span>
                  </Link>
                </td>
              ) : null}
              {shows("type") ? <td className="py-2 pr-4 text-muted-foreground">{t("row_folder")}</td> : null}
              {shows("size") ? <td className="py-2 pr-4 text-muted-foreground">—</td> : null}
              {shows("uploaded") ? <td className="py-2 text-muted-foreground">—</td> : null}
            </tr>
          ))}
          {files.map((file) => (
            <tr
              key={file.id}
              // 🚨 カード表示と同じ形で掴める（種類も中身も同じ）。
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_FILE_MIME, JSON.stringify([file.id]));
                event.dataTransfer.effectAllowed = "move";
              }}
              // 🚨 **行のどこをクリックしても開ける**（2026-08-17）。
              //    これを入れたので、**名前の列を消せる**ようになった（Directus と同じ形）。
              // 🚨 守りの理由は上のフォルダの行と同じ（**先に入れておく**）。
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input")) return;
                router.push(`/admin/files/${file.id}`);
              }}
              className="cursor-pointer border-b last:border-0 hover:bg-muted active:bg-muted/80"
            >
              {/* 🚨 ファイルだけ選べる。**まとめて入れる口はファイルの id しか受けない**。 */}
              <td className="w-8 py-2 pr-2">
                <input
                  type="checkbox"
                  className="size-4"
                  aria-label={t("bulk_select_row")}
                  ref={(el) => {
                    if (el) rowChecks.current.set(file.id, el);
                    else rowChecks.current.delete(file.id);
                  }}
                  checked={selected.has(file.id)}
                  onChange={() => toggle(file.id)}
                />
              </td>
              {shows("name") ? (
                <td className="py-2 pr-4">
                  {/* 🚨 リンクは残す。**行のクリックだけにすると、
                      新しいタブで開く・キーボードで辿る、が全部できなくなる**。 */}
                  <Link href={`/admin/files/${file.id}`} className="flex min-w-0 items-center gap-2">
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{file.title ?? file.filename_download}</span>
                  </Link>
                </td>
              ) : null}
              {shows("type") ? <td className="py-2 pr-4 text-muted-foreground">{file.type ?? "—"}</td> : null}
              {shows("size") ? <td className="py-2 pr-4 text-muted-foreground">{size(file.filesize)}</td> : null}
              {shows("uploaded") ? (
                <td className="py-2 text-muted-foreground">
                  {format.dateTime(new Date(file.uploaded_on))}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
