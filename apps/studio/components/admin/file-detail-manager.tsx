"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import { FieldValue } from "@/components/ui/field-value";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromPayload } from "@/i18n/error";

type FileRow = {
  id: string;
  title: string | null;
  description: string | null;
  tags: string | null;
  folder: string | null;
};

type FolderRow = {
  id: string;
  name: string;
};

export function FileDetailManager({ file, folders }: { file: FileRow; folders: FolderRow[] }) {
  const t = useT("files");
  const tCommon = useT("common");
  const tError = useT("errors");
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFromPayload(payload);
    return key ? tError(key) : fallback;
  };
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /** 表示モード ⇄ 編集モード（規約 `knowledge/decisions/action-button-and-edit-mode.md`）。 */
  const [editing, setEditing] = useState(false);
  /**
   * 🚨 「やめる」で**入れた値を捨てる**ための鍵（§2-2）。この画面の欄は uncontrolled
   * （`defaultValue`）なので、`readOnly` にしても **DOM の値は残る**。
   * 増やすと `<form>` が作り直され、`defaultValue` が引き直される。
   */
  const [formKey, setFormKey] = useState(0);

  /** 編集をやめて表示モードへ戻す。**入れた値は捨てる**。 */
  function cancelEditing() {
    setError(null);
    setEditing(false);
    setFormKey((k) => k + 1);
  }

  const save = useSubmitOnce(async (formData: FormData) => {
    setError(null);
    const body = {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      tags: String(formData.get("tags") ?? ""),
      folder: String(formData.get("folder") ?? "") || null,
    };
    const response = await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_save_failed")));
      return;
    }
    router.refresh();
  });

  const remove = useSubmitOnce(async () => {
    setError(null);
    const response = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_delete_failed")));
      return;
    }
    // 🚨 **知らせてから移す。** ここは成功すると一覧へ飛ぶので、知らせが無いと
    //    「消えたのか、ただ画面を離れたのか」が分からない
    //    （消えたと分かるのは、一覧に無いのを自分で確かめたときだけ）。
    // 🚨 ゴミ箱を入れるときは、この文言を「ゴミ箱へ移動しました」へ**書き換えるだけ**で済む。
    toast.success(t("deleted"));
    router.push("/admin/files");
    router.refresh();
  });

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <form
        // 🚨 `key` を増やすと作り直され、`defaultValue` が引き直される（「やめる」の実体）
        key={formKey}
        id="file-detail-form"
        action={save.run}
        className="space-y-4"
      >
        <FormDraft formId="file-detail-form" />
        <div className="space-y-1.5">
          <Label htmlFor="title">{t("title_label")}</Label>
          {/* 🚨 `text` / `textarea` は `readOnly` が効く型なので**要素を残す**（なぞってコピーできる。§2-1） */}
          <Input id="title" name="title" readOnly={!editing} defaultValue={file.title ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">{t("description_label")}</Label>
          <Textarea id="description" name="description" readOnly={!editing} defaultValue={file.description ?? ""} className="min-h-28" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tags">{t("tags_label")}</Label>
          <Input id="tags" name="tags" readOnly={!editing} defaultValue={file.tags ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="folder">{t("folder_label")}</Label>
          {/* 🚨 `<select>` は `readOnly` という性質を**そもそも持たない**（実測 2026-08-16）。
              表示モードでは**要素ごと置き換えて、選ばれている値を文字で出す**（§2-1・案 2）。 */}
          {editing ? (
            <select id="folder" name="folder" className="h-(--control-h) w-full rounded-lg bg-input px-2 text-base md:h-(--control-h-pc-field) md:text-sm" defaultValue={file.folder ?? ""}>
              <option value="">{t("no_folder_option")}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
          ) : (
            <FieldValue id="folder">
              {folders.find((folder) => folder.id === file.folder)?.name ?? t("no_folder_option")}
            </FieldValue>
          )}
        </div>
        {/* 🚨 主ボタンはモードで変わる（§2）。抜け道「やめる」は **▾ の中ではなく主の隣**（§4）。
            🚨 **削除は本文から ▾ の中へ移した**（§3「破壊的な操作は誤って押されないよう必ず ▾」）。
            `/admin/collections/<c>` で 283 A を当てたのと同じ形。 */}
        {editing ? (
          <>
            <PageAction
              role="secondary"
              label={tCommon("action_cancel")}
              icon={<X />}
              onClick={cancelEditing}
            />
            <PageAction
              form="file-detail-form"
              role="primary"
              pending={save.pending}
              label={tCommon("action_save")}
              icon={<Check />}
            />
          </>
        ) : (
          <PageAction
            role="primary"
            label={tCommon("action_edit")}
            icon={<Pencil />}
            onClick={() => setEditing(true)}
            options={[
              {
                label: t("delete_button"),
                destructive: true,
                onSelect: () => void remove.run(),
              },
            ]}
          />
        )}
      </form>
    </div>
  );
}
