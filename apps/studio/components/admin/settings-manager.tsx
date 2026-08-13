"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ColorField } from "@/components/admin/color-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import { useFormat, useT } from "@/i18n/client";
import { LOCALES } from "@/i18n/config";

/** lib/settings/service.ts の Settings と同じ形。 */
type SettingsSource = "database" | "environment" | "default";

type Settings = {
  project_name: string;
  project_logo: string | null;
  project_color: string;
  default_locale: string;
  public_note: string;
  sources: Record<string, SettingsSource>;
  updated_at: string | null;
};

/**
 * 全体設定の編集フォーム（F2 §2-A）。
 *
 * 「いまの値がどこから来ているか」を項目ごとに出しているのが要点。
 * **環境変数は初期値・DB が正**という関係は、見えていないと理解できない
 * （「環境変数を変えたのに反映されない」の問い合わせがここで消える）。
 */
export function SettingsManager({ settings }: { settings: Settings }) {
  const t = useT("settings");
  const tCommon = useT("common");
  const format = useFormat();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // ロゴは「選んだ瞬間にアップロードして ID を持つ」形。
  // 🚨 堀池さん指示「ファイルidを指定することは gui ではない。ちゃんとアップロード ui を用意する」。
  //    FileDropzone は File を返すだけなので、ID にするのはこちらの責任。
  const [logoId, setLogoId] = useState(settings.project_logo ?? "");
  const [logoError, setLogoError] = useState<string | null>(null);

  async function uploadLogo(files: File[]) {
    const file = files[0];
    if (!file) return;
    setLogoError(null);
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/files", { method: "POST", body });
    if (!response.ok) {
      setLogoError(t("error_logo_upload_failed"));
      return;
    }
    const payload = (await response.json()) as { data?: { id?: string } };
    if (payload.data?.id) setLogoId(payload.data.id);
    else setLogoError(t("error_logo_upload_failed"));
  }

  const sourceLabel = (key: string) => {
    const source = settings.sources?.[key] ?? "default";
    if (source === "database") return t("source_database");
    if (source === "environment") return t("source_environment");
    return t("source_default");
  };

  async function save(formData: FormData) {
    setSaving(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_name: String(formData.get("project_name") ?? ""),
        project_color: String(formData.get("project_color") ?? ""),
        project_logo: String(formData.get("project_logo") ?? ""),
        default_locale: String(formData.get("default_locale") ?? ""),
        public_note: String(formData.get("public_note") ?? ""),
      }),
    });
    setSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      const code = payload?.error?.code;
      // 辞書にある code は辞書で、無ければサーバの message へフォールバックする。
      if (response.status === 403) setError(t("error_forbidden"));
      else if (code === "INVALID_COLOR") setError(t("error_invalid_color"));
      else if (code === "INVALID_LOCALE") setError(t("error_invalid_locale"));
      else setError(payload?.error?.message ?? t("error_save_failed"));
      return;
    }

    setSaved(true);
    // ヘッダのサービス名などが即座に変わるようサーバ側を引き直す。
    router.refresh();
  }

  const field = (
    name: string,
    labelKey: string,
    helpKey: string,
    defaultValue: string,
    type = "text",
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`settings-${name}`}>{t(labelKey)}</Label>
      <Input
        id={`settings-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue}
      />
      <p className="text-xs text-muted-foreground">
        {t(helpKey)}
        <span className="ml-2">（{sourceLabel(name)}）</span>
      </p>
    </div>
  );

  return (
    <form action={save} className="max-w-2xl space-y-6">
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("saved")}
        </p>
      ) : null}

      {field("project_name", "project_name_label", "project_name_help", settings.project_name)}
      <div className="grid gap-2">
        <Label htmlFor="settings-project_color">{t("project_color_label")}</Label>
        <ColorField
          id="settings-project_color"
          name="project_color"
          defaultValue={settings.project_color}
        />
        <p className="text-xs text-muted-foreground">
          {t("project_color_help")}
          <span className="ml-2">（{sourceLabel("project_color")}）</span>
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-project_logo">{t("project_logo_label")}</Label>
        {/* 送信は JSON なので、選んだ結果の ID を隠しフィールドで運ぶ。 */}
        <input type="hidden" name="project_logo" value={logoId} />
        {logoId ? (
          <div className="flex items-center gap-3">
            {/* プレビュー。外部URLは使わず、必ず自分のアセット経由。 */}
            <img
              src={`/api/assets/${logoId}`}
              alt={t("project_logo_label")}
              className="h-10 w-auto rounded"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setLogoId("")}>
              {t("project_logo_clear")}
            </Button>
          </div>
        ) : (
          <FileDropzone name="project_logo_file" onSelect={uploadLogo} />
        )}
        {logoError ? (
          <p className="text-xs text-destructive">{logoError}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t("project_logo_help")}
          <span className="ml-2">（{sourceLabel("project_logo")}）</span>
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="settings-default_locale">{t("default_locale_label")}</Label>
        <NativeSelect
          id="settings-default_locale"
          name="default_locale"
          defaultValue={settings.default_locale}
        >
          {/* 🚨 "ja" / "en" を直書きしない（AGENTS.md §3.8 は英語リテラルも禁止）。
              言語名は**その言語自身の表記**にする（翻訳しない）。だから ja / en の辞書に
              同じ値が入っている。locale-switcher.tsx と同じ形。 */}
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {tCommon(`locale_${locale}`)}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          {t("default_locale_help")}
          <span className="ml-2">（{sourceLabel("default_locale")}）</span>
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="settings-public_note">{t("public_note_label")}</Label>
        <Textarea
          id="settings-public_note"
          name="public_note"
          defaultValue={settings.public_note}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          {t("public_note_help")}
          <span className="ml-2">（{sourceLabel("public_note")}）</span>
        </p>
      </div>

      <p className="text-xs text-muted-foreground">{t("reset_hint")}</p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? t("saving") : t("save_button")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("updated_at")}:{" "}
          {settings.updated_at
            ? format.dateTime(new Date(settings.updated_at))
            : t("never_updated")}
        </span>
      </div>
    </form>
  );
}
