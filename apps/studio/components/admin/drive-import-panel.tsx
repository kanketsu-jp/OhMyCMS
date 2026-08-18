"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cloud, Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useT } from "@/i18n/client";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  modifiedTime: string | null;
};

type Connection = {
  /** 管理者が client_id を入れているか。false ならパネルごと出さない。 */
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
};

/**
 * Google ドライブから選んで取り込むパネル。
 *
 * 🚨 **繋がっていない状態と、設定が無い状態を分けて見せる。**
 *   ・設定が無い（管理者が client_id を入れていない）→ **このパネル自体を出さない**
 *   ・設定はあるが繋いでいない → **「繋ぐ」だけ出す**
 *   両方を「使えません」でまとめると、**利用者は自分で直せるのか判断できない**。
 *
 * 🚨 **取り込みは複製**。ドライブ側で消えてもこちらは残る代わり、
 *   取り込み元は `metadata` に残るので「もとのファイルをみる」で辿れる。
 */
export function DriveImportPanel({
  folder,
  initialConnection,
}: {
  folder: string | null;
  /**
   * 🚨 **サーバ側で調べた結果を受け取る。** クライアントで取りに行くと、
   *    ①効果の中で状態を書くことになり（React Compiler が禁じる）
   *    ②**一瞬出てから消える**（設定が無いのにパネルが見える）。
   *    `null` は「**設定そのものが無い**」（管理者が client_id を入れていない）。
   */
  initialConnection: Connection | null;
}) {
  const t = useT("files");
  const format = useFormat();
  const router = useRouter();
  const [connection, setConnection] = useState<Connection | null>(initialConnection);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [search, setSearch] = useState("");
  const [searched, setSearched] = useState("");

  const list = useSubmitOnce(async () => {
    const url = new URL("/api/drive/files", window.location.origin);
    if (search.trim()) url.searchParams.set("q", search.trim());
    const response = await fetch(url);
    if (!response.ok) {
      // 🚨 繋ぎ直しが要る場合だけ、状態を取り直して画面を戻す。
      if (response.status === 401) {
        setConnection({ configured: true, connected: false, accountEmail: null });
        toast.error(t("drive_disconnected"));
        return;
      }
      toast.error(t("drive_list_failed"));
      return;
    }
    const payload = (await response.json()) as { data: { files: DriveFile[] } };
    setFiles(payload.data.files);
  });

  const runSearch = (value: string) => {
    const trimmed = value.trim();
    if (trimmed === searched) return;
    setSearched(trimmed);
    void list.run();
  };

  const importFile = useSubmitOnce(
    async (file: DriveFile) => {
      const response = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: file.id, folder }),
      });
      if (!response.ok) {
        toast.error(
          response.status === 404 ? t("drive_source_missing") : t("drive_import_failed"),
        );
        return;
      }
      toast.success(t("drive_imported", { name: file.name }));
      router.refresh();
    },
    (file) => file.id,
  );

  // 設定が無いときは何も出さない（管理者が入れるまで、利用者にできることは無い）。
  // 🚨 `initialConnection` が null なのは**取得そのものに失敗した**とき。
  //    `configured === false` は**設定が無い**とき。どちらも出さないが、理由が違う。
  if (!initialConnection || !initialConnection.configured) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">{t("drive_heading")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("drive_description")}</p>
      </div>

      {!connection?.connected ? (
        <div>
          {/* 🚨 リンクにする。OAuth は画面ごと Google へ移るので、fetch では始められない。 */}
          <Button asChild variant="secondary">
            <a href="/api/drive/connect">
              <Cloud />
              {t("drive_connect")}
            </a>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t("drive_connected_as", { email: connection.accountEmail ?? "—" })}
          </p>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") runSearch(event.currentTarget.value);
              }}
              onBlur={(event) => runSearch(event.currentTarget.value)}
              placeholder={t("drive_search_placeholder")}
              aria-label={t("drive_search_placeholder")}
            />
            <Button type="button" onClick={() => void list.run()} disabled={list.pending}>
              <RefreshCw />
              {t("drive_list")}
            </Button>
          </div>

          {files.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{file.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {file.mimeType}
                      {file.modifiedTime
                        ? ` · ${format.dateTime(new Date(file.modifiedTime))}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={importFile.isPending(file.id)}
                    onClick={() => void importFile.run(file)}
                  >
                    <Download />
                    {t("drive_import")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
