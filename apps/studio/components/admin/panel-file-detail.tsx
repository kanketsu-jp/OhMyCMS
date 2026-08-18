"use client";

import Link from "next/link";

import { PanelSection } from "@/components/admin/panel-section";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { useFormat, useT } from "@/i18n/client";
import { useSelectedFiles, requestPreview } from "@/lib/admin/files-selection";
import { useState } from "react";
import { useSubmitOnce } from "@/hooks/use-submit-once";

/**
 * 右サイドバーの「ファイルの詳細」（B6）。
 *
 * 堀池さん（2026-08-17 B6 原文）:
 * > 「詳細アコーディオン：ファイルをクリックした際、右サイドバーが展開されている場合は、
 * >   その中に「ファイルの詳細」というアコーディオンを追加して表示してください。
 * >   そのままファイルがある場所に遷移できるようにするなど、Googleドライブの操作感を
 * >   参考にしてください」
 *
 * 参照した実物: Directus の `app/src/modules/files/components/file-info-sidebar-detail.vue`。
 * 向こうも右サイドバーの節として出し、フォルダの行に「そのフォルダを開く」リンクを置いている。
 * 🚨 **写経していない。** 出す項目と、フォルダへの導線という考え方だけを採った。
 *
 * 🚨 **選択は読むだけ。** 値は `lib/admin/files-selection.ts`（L4 の持ち物）から来る。
 *    `setSelection` / `clearSelection` はここから呼ばない（書くのは一覧側の役目）。
 *    Context ではなく外部ストアなのは、右サイドバーの中身が `{children}` の**兄弟**として
 *    描かれるため（`right-panel.tsx:148-149`）。ページ側に Provider を置いても包めない。
 *
 * 🚨 **`folder` は uuid なので画面に出さない**（`decisions/synthetic-ids-are-not-contacts`）。
 *    出すのは `folder_name`。根に在るファイルは両方 null なので、そのときの文言はここが持つ。
 */

/**
 * バイト数を読みやすい形にする。
 *
 * 🚨 **同じ処理が `files-table.tsx` にもある**（あちらが先）。共有の関数がまだ無いので、
 *    いまは 2 箇所に在る。片方だけ直すと見た目が割れるので、**直すときは両方**。
 *    まとめるなら `lib/admin/files-view.ts`（一覧側の持ち物）へ出すのが筋で、
 *    それは L4 に相談済み（返事待ち）。
 */
function formatSize(value: string | number | null): string | null {
  if (value === null) return null;
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm">{children}</dd>
    </div>
  );
}

export function PanelFileDetail() {
  const t = useT("panel");
  const format = useFormat();
  const files = useSelectedFiles();
  const [changedVisibility, setChangedVisibility] = useState<Record<string, "public" | "link" | "private">>({});
  const changeVisibility = useSubmitOnce(async (value: "public" | "link" | "private") => {
    const id = files[0]?.id;
    if (!id) return;
    const response = await fetch(`/api/files/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibility: value }) });
    if (response.ok) setChangedVisibility((current) => ({ ...current, [id]: value }));
  });
  const rotateLink = useSubmitOnce(async () => {
    const id = files[0]?.id;
    if (!id || !window.confirm(t("file_detail_rotate_confirm"))) return;
    await fetch(`/api/files/${id}`, { method: "POST" });
    window.location.reload();
  });

  // 🚨 選んでいないときは枠ごと出さない（①概要・②項目一覧と同じ規律）。
  //    「選択なし」と書くと、出す物が無い状態と、壊れている状態の区別が付かない。
  if (files.length === 0) return null;

  if (files.length > 1) {
    return (
      <PanelSection value="file-detail" title={t("file_detail")}>
        <p className="text-base text-muted-foreground">
          {t("file_detail_selected", { count: String(files.length) })}
        </p>
      </PanelSection>
    );
  }

  const file = files[0]!;
  const visibility = changedVisibility[file.id] ?? file.visibility;
  const publicUrl = new URL(`/assets/${file.public_token}`, typeof window === "undefined" ? "http://localhost" : window.location.origin).toString();
  const size = formatSize(file.filesize);
  const dimensions =
    file.width !== null && file.height !== null ? `${file.width} x ${file.height}` : null;

  return (
    <PanelSection value="file-detail" title={t("file_detail")}>
      <dl className="flex flex-col gap-1.5">
        <Row label={t("file_detail_name")}>{file.filename_download || file.title}</Row>
        {file.type ? <Row label={t("file_detail_type")}>{file.type}</Row> : null}
        {dimensions ? <Row label={t("file_detail_dimensions")}>{dimensions}</Row> : null}
        {size ? <Row label={t("file_detail_size")}>{size}</Row> : null}
        {file.duration !== null ? (
          <Row label={t("file_detail_duration")}>
            {`${file.duration}${t("file_detail_seconds")}`}
          </Row>
        ) : null}
        <Row label={t("file_detail_uploaded")}>{format.dateTime(file.uploaded_on)}</Row>
        <Row label={t("file_detail_access_label")}>
          <span className="whitespace-normal">
            {t(`file_detail_access_${visibility}`)}
          </span>
        </Row>
        {file.modified_on ? (
          <Row label={t("file_detail_modified")}>{format.dateTime(file.modified_on)}</Row>
        ) : null}
        {/*
          🚨 堀池さんの「そのままファイルがある場所に遷移できるように」はこの行。
             フォルダの移動は `?folder=` なので **pathname が変わらない** ＝ 右サイドバーは開いたまま。
        */}
        <Row label={t("file_detail_folder")}>
          <Link
            href={file.folder ? `/admin/files?folder=${file.folder}` : "/admin/files"}
            className="underline-offset-2 hover:underline active:underline"
          >
            {file.folder_name ?? t("file_detail_root")}
          </Link>
        </Row>
      </dl>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block">{t("file_detail_visibility_label")}</span>
        <select className="w-full border bg-input px-2 py-1.5" value={visibility} onChange={(event) => void changeVisibility.run(event.target.value as "public" | "link" | "private")}>
          <option value="public">{t("file_detail_access_public")}</option>
          <option value="link">{t("file_detail_access_link")}</option>
          <option value="private">{t("file_detail_access_private")}</option>
        </select>
      </label>

      <div className="mt-2 flex items-center gap-2">
        {/*
          🚨 拡大は**ページ遷移ではない**（堀池さんの B5「詳細アコーディオン内の拡大ボタンから」）。
             一覧側のライトボックスを開く。画像でない / 一覧に無い id では L4 が false を返す。
        */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => requestPreview(file.id)}
          // 🚨 角丸を使わない（DESIGN.md §1-1「クロームは平ら」）。
          //    枠は付ける（AL1 原文「拡大に枠が無い」）。押せるものだと見えないため。
          className="rounded-none"
        >
          {t("file_detail_preview")}
        </Button>
        {/*
          🚨 **コピーするのは id ではなく URL**（堀池・2026-08-17 AL1）。
             files（L4）が引いて決めた形をそのまま使う:
             `<origin>/api/assets/<id>` の絶対 URL。
          🚨 **失うもの … ログインしていない人には開けない。**
             `app/api/assets/[id]/route.ts` は 1 行目で `requireActor` を通すため。
             ＝ 「公開 URL」という言葉の意味は満たしていない。
             【L4 の実測】`public_url` / `signedUrl` / `presigned` … 0 件
             （🟢 対照 同じ探し方で `assets` は 4 件＝ 見ていない 0 ではなく、仕組みが無い 0）
             社外へ渡す用途なら「公開の口を新しく作る」話で、認可の設計に触るので司令塔案件。
          🚨 **角を 0 にする**（DESIGN.md §1-1）。L4 の実測で、隣の「拡大」が 0px・
             こちらが 8px と**並びで角の扱いが違っていた**。共有部品（`ui/copy-button.tsx`）は
             触らず、呼び出し側で揃える（`{...props}` が Button まで通る）。
        */}
        <CopyButton
          className="rounded-none"
          // 🚨 何をコピーするか言う（DESIGN.md §2-12・堀池 AM1「ボタン自体が『ID をコピー』と
          //    表示するべき」）。🚨 ここが渡すのは **id ではなく URL** なので、そう言う
          //    （AL1 で id → URL に変えてある。**ボタンの文言だけ id のままにしない**）。
           what={t("file_detail_url_public_what")}
           value={publicUrl}
         />
         <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => void rotateLink.run()}>{t("file_detail_rotate_link")}</Button>
      </div>
    </PanelSection>
  );
}
