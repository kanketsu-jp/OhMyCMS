"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useFormat, useT } from "@/i18n/client";

type SettingsSource = "database" | "environment" | "default";

type StorageSettings = {
  s3_endpoint: string;
  s3_bucket: string;
  s3_region: string;
  s3_access_key_id_set: boolean;
  s3_secret_access_key_set: boolean;
  s3_force_path_style: string;
  s3_key_prefix: string;
  sources: Record<string, SettingsSource>;
  updated_at: string | null;
};

type Draft = {
  s3_endpoint: string;
  s3_bucket: string;
  s3_region: string;
  s3_access_key_id: string;
  s3_secret_access_key: string;
  s3_force_path_style: boolean;
  s3_key_prefix: string;
};

export function StorageSettingsManager({ settings }: { settings: StorageSettings }) {
  const t = useT("storage");
  const format = useFormat();
  const router = useRouter();
  const initial = useMemo<Draft>(
    () => ({
      s3_endpoint: settings.s3_endpoint,
      s3_bucket: settings.s3_bucket,
      s3_region: settings.s3_region,
      s3_access_key_id: "",
      s3_secret_access_key: "",
      s3_force_path_style: settings.s3_force_path_style === "true",
      s3_key_prefix: settings.s3_key_prefix,
    }),
    [settings],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    draft.s3_endpoint !== initial.s3_endpoint ||
    draft.s3_bucket !== initial.s3_bucket ||
    draft.s3_region !== initial.s3_region ||
    draft.s3_access_key_id.trim().length > 0 ||
    draft.s3_secret_access_key.trim().length > 0 ||
    draft.s3_force_path_style !== initial.s3_force_path_style ||
    draft.s3_key_prefix !== initial.s3_key_prefix;

  const sourceLabel = (key: string) => {
    const source = settings.sources?.[key] ?? "default";
    if (source === "database") return t("source_database");
    if (source === "environment") return t("source_environment");
    return t("source_default");
  };

  const secretLabel = (set: boolean) => (set ? t("secret_set") : t("secret_unset"));

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const patch: Record<string, unknown> = {
      s3_endpoint: draft.s3_endpoint,
      s3_bucket: draft.s3_bucket,
      s3_region: draft.s3_region,
      s3_force_path_style: draft.s3_force_path_style ? "true" : "false",
      s3_key_prefix: draft.s3_key_prefix,
    };
    if (draft.s3_access_key_id.trim().length > 0) {
      patch.s3_access_key_id = draft.s3_access_key_id;
    }
    if (draft.s3_secret_access_key.trim().length > 0) {
      patch.s3_secret_access_key = draft.s3_secret_access_key;
    }

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      const code = payload?.error?.code;
      if (response.status === 403) setError(t("error_forbidden"));
      else if (code === "INVALID_FIELD") setError(t("error_invalid_field"));
      else if (code === "SECRET_KEY_MISSING") setError(t("error_secret_key_missing"));
      else setError(payload?.error?.message ?? t("error_save_failed"));
      return;
    }

    setSaved(true);
    setDraft({ ...draft, s3_access_key_id: "", s3_secret_access_key: "" });
    router.refresh();
  }

  const textField = (
    key: keyof Pick<Draft, "s3_endpoint" | "s3_bucket" | "s3_region" | "s3_key_prefix">,
    type = "text",
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`storage-${key}`}>{t(`${key}_label`)}</Label>
      <Input
        id={`storage-${key}`}
        type={type}
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
      <p className="text-xs text-muted-foreground">
        {t(`${key}_help`)}
        <span className="ml-2">({sourceLabel(key)})</span>
      </p>
    </div>
  );

  const secretField = (
    key: "s3_access_key_id" | "s3_secret_access_key",
    set: boolean,
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`storage-${key}`}>{t(`${key}_label`)}</Label>
      <Input
        id={`storage-${key}`}
        type="password"
        value={draft[key]}
        placeholder={set ? t("secret_set") : undefined}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
      <p className="text-xs text-muted-foreground">
        {t(`${key}_help`)}
        <span className="ml-2">{secretLabel(set)}</span>
      </p>
    </div>
  );

  return (
    <form id="storage-settings-form"
      className="flex max-w-2xl flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error ? (
        <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-muted-foreground">{t("saved")}</p> : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("connection_heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("connection_description")}</p>
        </div>
        {textField("s3_endpoint", "url")}
        {textField("s3_bucket")}
        {textField("s3_region")}
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("credentials_heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("credentials_description")}</p>
        </div>
        {secretField("s3_access_key_id", settings.s3_access_key_id_set)}
        {secretField("s3_secret_access_key", settings.s3_secret_access_key_set)}
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("advanced_heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("advanced_description")}</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            id="storage-s3_force_path_style"
            type="checkbox"
            className="size-6"
            checked={draft.s3_force_path_style}
            onChange={(event) =>
              setDraft({ ...draft, s3_force_path_style: event.target.checked })
            }
          />
          {t("s3_force_path_style_label")}
        </label>
        <p className="text-xs text-muted-foreground">
          {t("s3_force_path_style_help")}
          <span className="ml-2">({sourceLabel("s3_force_path_style")})</span>
        </p>
        {textField("s3_key_prefix")}
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || !dirty}>
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
