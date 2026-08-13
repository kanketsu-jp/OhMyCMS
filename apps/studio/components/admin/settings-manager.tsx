"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import { useFormat, useT } from "@/i18n/client";

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
  const format = useFormat();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      {field("project_color", "project_color_label", "project_color_help", settings.project_color)}
      {field("project_logo", "project_logo_label", "project_logo_help", settings.project_logo ?? "")}

      <div className="grid gap-2">
        <Label htmlFor="settings-default_locale">{t("default_locale_label")}</Label>
        <NativeSelect
          id="settings-default_locale"
          name="default_locale"
          defaultValue={settings.default_locale}
        >
          <option value="ja">ja</option>
          <option value="en">en</option>
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
