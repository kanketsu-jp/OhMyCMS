"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import { FieldValue } from "@/components/ui/field-value";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useT } from "@/i18n/client";
import { errorKeyFromPayload } from "@/i18n/error";

type SettingsSource = "database" | "environment" | "default";

type StorageSettings = {
  s3_endpoint: string;
  s3_bucket: string;
  s3_region: string;
  s3_access_key_id_set: boolean;
  s3_secret_access_key_set: boolean;
  s3_force_path_style: string;
  s3_key_prefix: string;
  /** Google ドライブ連携の client_id。🚨 PKCE なので秘密ではない（伏せ字にしない）。 */
  drive_client_id: string;
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
  drive_client_id: string;
};

/**
 * S3 と Google ドライブのストレージ設定を表示・編集する部品。
 *
 * 🚨 秘密のキーはサーバから値を受け取らず、編集時に入力された場合だけ送る。表示モードでは `FieldValue` と未設定表示を使う。
 *
 * 参考: DESIGN.md §1-8・§1-12 ／ `components/ui/field-value.tsx` ／ `knowledge/decisions/secrets-storage-by-recoverability.md`
 */
export function StorageSettingsManager({ settings }: { settings: StorageSettings }) {
  const t = useT("storage");
  const tCommon = useT("common");
  const tError = useT("errors");
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
      drive_client_id: settings.drive_client_id,
      s3_key_prefix: settings.s3_key_prefix,
    }),
    [settings],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  /** 表示モード ⇄ 編集モード（規約 `knowledge/decisions/action-button-and-edit-mode.md`）。 */
  const [editing, setEditing] = useState(false);

  // 🚨 何も変えていないなら保存させない（憲章 §3c）。
  //    秘密の 2 つは**読み出せない**ので、`initial` は常に空文字で始まる。
  //    だから「入力されたか（length > 0）」で見る。他と同じ「値が違うか」にすると
  //    空のまま常に dirty になる。
  //    由来: `19e6f3c` でヘッダーへ移したとき、この判定ごと落としていた（saml が実測で検出）。
  const dirty =
    draft.s3_endpoint !== initial.s3_endpoint ||
    draft.s3_bucket !== initial.s3_bucket ||
    draft.s3_region !== initial.s3_region ||
    draft.s3_access_key_id.trim().length > 0 ||
    draft.s3_secret_access_key.trim().length > 0 ||
    draft.s3_force_path_style !== initial.s3_force_path_style ||
    draft.s3_key_prefix !== initial.s3_key_prefix ||
    draft.drive_client_id !== initial.drive_client_id;

  const sourceLabel = (key: string) => {
    const source = settings.sources?.[key] ?? "default";
    if (source === "database") return t("source_database");
    if (source === "environment") return t("source_environment");
    return t("source_default");
  };

  const secretLabel = (set: boolean) => (set ? t("secret_set") : t("secret_unset"));

  const save = useSubmitOnce(async () => {
    setError(null);

    const patch: Record<string, unknown> = {
      s3_endpoint: draft.s3_endpoint,
      s3_bucket: draft.s3_bucket,
      s3_region: draft.s3_region,
      s3_force_path_style: draft.s3_force_path_style ? "true" : "false",
      s3_key_prefix: draft.s3_key_prefix,
      // 🚨 秘密ではないので、他の設定と同じようにそのまま送る（伏せ字の口を通さない）。
      drive_client_id: draft.drive_client_id,
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

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      const code = payload?.error?.code;
      if (response.status === 403) setError(t("error_forbidden"));
      else if (code === "INVALID_FIELD") setError(t("error_invalid_field"));
      else if (code === "SECRET_KEY_MISSING") setError(t("error_secret_key_missing"));
      else {
        // 🚨 API の生文言を画面へ出さない（英語の画面に lib/ の日本語が出るため）。
        //    表に無い code は保存の途中なので、この画面の error_save_failed が正確。
        // 🚨 **取り出しを自分で書かない**（`payload?.error?.code` を各所で書くと、形が変わったとき
        //    何箇所直すのか誰も知らない。実測 2026-08-17: 同じ取り出しが 7 箇所在った）。
        //    `errorKeyFromPayload` は**表に無ければ null** を返すので、`=== FALLBACK` と同じ分岐になる
        //    （実測: 表に `unexpected` へ写す code は 0 件なので、FALLBACK になるのは未知の code のときだけ）。
        const key = errorKeyFromPayload(payload);
        setError(key === null ? t("error_save_failed") : tError(key));
      }
      return;
    }

    toast.success(t("saved"));
    setDraft({ ...draft, s3_access_key_id: "", s3_secret_access_key: "" });
    router.refresh();
  });

  /** 編集をやめて表示モードへ戻す。**入れた値は捨てる**（`initial` へ戻す。規約 §2-2）。 */
  function cancelEditing() {
    setError(null);
    setDraft(initial);
    setEditing(false);
  }

  const textField = (
    key: keyof Pick<
      Draft,
      "s3_endpoint" | "s3_bucket" | "s3_region" | "s3_key_prefix" | "drive_client_id"
    >,
    type = "text",
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`storage-${key}`}>{t(`${key}_label`)}</Label>
      {/* 🚨 `text` / `url` は `readOnly` が効く型なので**要素を残す**（なぞってコピーできる。§2-1）。 */}
      <Input
        id={`storage-${key}`}
        type={type}
        readOnly={!editing}
        value={draft[key]}
        placeholder={!editing ? tCommon("not_set") : undefined}
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
      {/* 🚨 **秘密の値は、そもそもブラウザへ来ていません。**
          props が持つのは `..._set`（設定済みかどうか）だけで、欄の初期値は空です
          （実測 2026-08-16: 2 欄とも値の長さ 0 ／ ページの HTML に秘密らしい塊は無し。
            🚨 ただし**この環境は未設定**なので、「設定済みのときに漏れないか」は測れていません）。
          ＝ **表示モードで「見せる値」が存在しない**。空の password 欄を出しても意味が無いので、
          **設定済みかどうかだけを文字で出す**（§2-1 の案 2）。 */}
      {editing ? (
        <Input
          id={`storage-${key}`}
          type="password"
          value={draft[key]}
          placeholder={set ? t("secret_set") : undefined}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        />
      ) : (
        <FieldValue id={`storage-${key}`}>{secretLabel(set)}</FieldValue>
      )}
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
        void save.run();
      }}
    >
      <FormDraft formId="storage-settings-form" />
      {error ? (
        <p className="rounded-lg border border-destructive/40 px-3 py-2 text-base text-destructive">
          {error}
        </p>
      ) : null}

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
        {/* 🚨 `checkbox` は `readOnly` が**効かない**（属性は付くのに実クリックで変わる。実測 2026-08-16）。
            表示モードでは**要素ごと置き換えて値を文字で出す**（§2-1・案 2。✓ の絵にしない）。 */}
        {!editing ? (
          <FieldValue id="storage-s3_force_path_style">
            {t("s3_force_path_style_label")}:{" "}
            {tCommon(draft.s3_force_path_style ? "state_enabled" : "state_disabled")}
          </FieldValue>
        ) : (
          <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
            <Checkbox
              id="storage-s3_force_path_style"
              checked={draft.s3_force_path_style}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, s3_force_path_style: checked === true })
              }
            />
            {t("s3_force_path_style_label")}
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          {t("s3_force_path_style_help")}
          <span className="ml-2">({sourceLabel("s3_force_path_style")})</span>
        </p>
        {textField("s3_key_prefix")}
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("drive_heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("drive_description")}</p>
        </div>
        {textField("drive_client_id")}
      </section>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {t("updated_at")}:{" "}
          {settings.updated_at
            ? format.dateTime(new Date(settings.updated_at))
            : t("never_updated")}
        </span>
      </div>
      {/* 🚨 主ボタンはモードで変わる（§2）。抜け道「やめる」は **▾ の中ではなく主の隣**（§4）。 */}
      {editing ? (
        <>
          <PageAction
            role="secondary"
            label={tCommon("action_cancel")}
            icon={<X />}
            onClick={cancelEditing}
          />
          <PageAction
            form="storage-settings-form"
            role="primary"
            pending={save.pending}
            disabled={!dirty}
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
        />
      )}
    </form>
  );
}
