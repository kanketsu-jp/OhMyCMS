"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { ColorField } from "@/components/admin/color-field";
import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldValue } from "@/components/ui/field-value";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import { useFormat, useT } from "@/i18n/client";
import { errorKeyFromApiCode } from "@/i18n/error";
import { LOCALES } from "@/i18n/config";

/** lib/settings/service.ts の Settings と同じ形。 */
type SettingsSource = "database" | "environment" | "default";

type Settings = {
  project_name: string;
  project_logo: string | null;
  project_color: string;
  default_locale: string;
  public_note: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password_set: boolean;
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
  const tError = useT("errors");
  const format = useFormat();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 表示モード ⇄ 編集モード（規約 `knowledge/decisions/action-button-and-edit-mode.md`）。
   * 堀池さん（原文）:「**全てにおいて基本は編集モードと表示を分ける**」。設問287 は **B（例外なし）**。
   */
  const [editing, setEditing] = useState(false);
  /**
   * 🚨 「やめる」で**入れた値を捨てる**ための鍵。増やすと `<form>` が作り直され、
   * `defaultValue` が引き直される。
   *
   * 🚨 これを付けないと、`readOnly` にしても **DOM の値は残る**。
   * profile で実測した不具合（2026-08-16・3/3 再現）と同じ形:
   * 「やめる」を押しても入れた値が画面に出たままで、**表示モードが保存されていない値を
   *  「保存済みの値」として見せる**。押し直すと生き返る。
   */
  const [formKey, setFormKey] = useState(0);
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

  /** 編集をやめて表示モードへ戻す。**入れた値は捨てる**（`formKey` を増やして作り直す）。 */
  function cancelEditing() {
    setError(null);
    setLogoId(settings.project_logo ?? "");
    setEditing(false);
    setFormKey((k) => k + 1);
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

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_name: String(formData.get("project_name") ?? ""),
        project_color: String(formData.get("project_color") ?? ""),
        project_logo: String(formData.get("project_logo") ?? ""),
        default_locale: String(formData.get("default_locale") ?? ""),
        public_note: String(formData.get("public_note") ?? ""),
        smtp_host: String(formData.get("smtp_host") ?? ""),
        smtp_port: String(formData.get("smtp_port") ?? ""),
        smtp_user: String(formData.get("smtp_user") ?? ""),
        smtp_password: String(formData.get("smtp_password") ?? ""),
      }),
    });
    setSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string } }
        | null;
      const code = payload?.error?.code;
      // 🚨 **API の生文言を画面へ出さない**（2026-08-15 に是正）。
      //    それまで最後の分岐が `payload?.error?.message ?? …` で、
      //    **サーバが返した文章をそのまま画面へ出していた**。
      //    これは i18n の話ではなく**なりすまし**の経路——
      //    細工した応答で、任意の文章を「アプリが出した公式のエラー」として出せる。
      //    `apiMessage()` を消したのと同じ理由（`lib/admin/forms.ts` の JSDoc）。
      //    見張り: `scripts/check-no-api-message.mjs`
      const key = errorKeyFromApiCode(code);
      if (response.status === 403) setError(t("error_forbidden"));
      else if (code === "INVALID_COLOR") setError(t("error_invalid_color"));
      else if (code === "INVALID_LOCALE") setError(t("error_invalid_locale"));
      // 🚨 code が分からない（unexpected に落ちた）ときは、この画面固有の文言のほうが具体的。
      //    分かるときは辞書の訳を出す。どちらの経路でも API の生文言は出さない。
      else setError(key === "unexpected" ? t("error_save_failed") : tError(key));
      return;
    }

    toast.success(t("saved"));
    setEditing(false);
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
        // 🚨 表示モードは `readOnly`。`disabled` にしない
        //    （規約 §2「読めるが変えられない」。`disabled` だと読み上げから外れ、
        //     値をコピーすることもできなくなる）
        // 🚨 **表示モードで値が空なら「未設定」を出す**（堀池・2026-08-17・AE1/D6
        //    「フィールドの枠がないので、わからない」）。空のままだと**ラベルと説明のあいだが
        //    完全な空白**になり、欄が在ることすら分からない。schema が storage / profile で
        //    採った形（`common.not_set`）に**揃えている**——同じことを 2 通りで書かない。
        //    🚨 編集モードでは出さない（`undefined`）。本物の入力の邪魔になる。
        readOnly={!editing}
        defaultValue={defaultValue}
        placeholder={!editing ? tCommon("not_set") : undefined}
      />
      <p className="text-xs text-muted-foreground">
        {t(helpKey)}
        <span className="ml-2">（{sourceLabel(name)}）</span>
      </p>
    </div>
  );

  return (
    <form
      // 🚨 `key` を増やすと作り直され、`defaultValue` が引き直される（「やめる」の実体）
      key={formKey}
      id="settings-form"
      action={save}
      className="max-w-2xl space-y-6"
    >
      <FormDraft formId="settings-form" />
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {field("project_name", "project_name_label", "project_name_help", settings.project_name)}
      <div className="grid gap-2">
        <Label htmlFor="settings-project_color">{t("project_color_label")}</Label>
        {/* 🚨 表示モードは**部品を置き換えて、値を文字で出す**（面の規約・design 2026-08-16 案2）。
            `readOnly` は `<input type="color">` に効かず、`disabled` は焦点が当たらないので
            **キーボードだけで読む人が値に到達できない**。だから要素ごと替える。
            🚨 色は「文字だけだと分からない」ので、**値 `#RRGGBB` に小さな見本を添える**
            （design から「実装する私が測ってから決めてよい」と委ねられた部分）。 */}
        {editing ? (
          <ColorField
            id="settings-project_color"
            name="project_color"
            defaultValue={settings.project_color}
          />
        ) : (
          <FieldValue
            adornment={
              <span className="size-4 rounded" style={{ backgroundColor: settings.project_color }} />
            }
          >
            <span className="font-mono">{settings.project_color}</span>
          </FieldValue>
        )}
        <p className="text-xs text-muted-foreground">
          {t("project_color_help")}
          <span className="ml-2">（{sourceLabel("project_color")}）</span>
        </p>
      </div>
      <div className="grid gap-2">
        {/* 🚨 `htmlFor` を書かないこと。ここが指していた `settings-project_logo` は
            **どこにも存在しない id** だった（素の input を FileDropzone に差し替えたときに
            指し先だけ消えた）。押しても何も起きないラベルになる。
            代わりに `id` を振って、FileDropzone に `labelledBy` で指させる。 */}
        <p id="settings-project_logo-label" className="text-sm font-medium">
          {t("project_logo_label")}
        </p>
        {/* 送信は JSON なので、選んだ結果の ID を隠しフィールドで運ぶ。 */}
        <input type="hidden" name="project_logo" value={logoId} />
        {/* 🚨 **モードを切り替えると、ここから下が 108px 動く**（実測 2026-08-16・PC / SP とも）。
            表示モードは 1 行の文字、編集モードは**ドロップ領域**なので、素の高さが違う。
            🚨 **揃え忘れではない。案 b（表示側にも同じ高さを持たせる）を採らなかった**:
              表示モードは「値を見る」だけなので、**ドロップ領域ぶんの空白を置く理由が無い**
              （`knowledge/decisions/every-element-must-earn-its-place.md`）。
            🚨 **この注記を消さないこと。** 消すと次の人が「揃え忘れ」と読んで案 b を入れに来る。
            🟢 押す場所（「編集する」）はヘッダの固定枠なので、**押した瞬間に手元は動かない**。
            🟢 色・言語（`FieldValue`）と text / textarea は **差 0**（＝ 高さ揃えは効いている）。
            決定: design 2026-08-16（案 a）。

            🚨 ロゴだけは `readOnly` で止められない（欄ではなく**押す部品**）。
            表示モードでは **見えるだけ**にし、差し替え・消去の入口を出さない。
            🚨 出したままにすると、`readOnly` を付けた他の欄と食い違って
            「この画面は変えられるのか」が読めなくなる。 */}
        {logoId ? (
          <div className="flex items-center gap-3">
            {/* プレビュー。外部URLは使わず、必ず自分のアセット経由。 */}
            <img
              src={`/api/assets/${logoId}`}
              alt={t("project_logo_label")}
              className="h-10 w-auto rounded"
            />
            {editing ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogoId("")}>
                {t("project_logo_clear")}
              </Button>
            ) : null}
          </div>
        ) : editing ? (
          <FileDropzone
            name="project_logo_file"
            onSelect={uploadLogo}
            labelledBy="settings-project_logo-label"
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("project_logo_empty")}</p>
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
        {/* 🚨 表示モードは**部品を置き換えて、値を文字で出す**（面の規約・design 2026-08-16 案2）。
            `<select>` は `readOnly` という性質を**そもそも持たない**（`'readOnly' in el` が false）。
            出したままだと**変えられてしまう**ので、選ばれている値だけを文字で出す。 */}
        {editing ? (
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
        ) : (
          <FieldValue id="settings-default_locale">
            {tCommon(`locale_${settings.default_locale}`)}
          </FieldValue>
        )}
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
          readOnly={!editing}
          defaultValue={settings.public_note}
          rows={3}
          placeholder={!editing ? tCommon("not_set") : undefined}
        />
        <p className="text-xs text-muted-foreground">
          {t("public_note_help")}
          <span className="ml-2">（{sourceLabel("public_note")}）</span>
        </p>
      </div>

      <div className="grid gap-2 border-t pt-6">
        <h2 className="text-base font-semibold">{t("smtp_heading")}</h2>
        <p className="text-sm text-muted-foreground">{t("smtp_priority_help")}</p>
        {field("smtp_host", "smtp_host_label", "smtp_host_help", settings.smtp_host)}
        {field("smtp_port", "smtp_port_label", "smtp_port_help", settings.smtp_port)}
        {field("smtp_user", "smtp_user_label", "smtp_user_help", settings.smtp_user)}
        <div className="grid gap-2">
          <Label htmlFor="settings-smtp_password">{t("smtp_password_label")}</Label>
          <Input
            id="settings-smtp_password"
            name="smtp_password"
            type="password"
            readOnly={!editing}
            defaultValue=""
            placeholder={editing ? t("smtp_password_placeholder") : settings.smtp_password_set ? t("smtp_password_masked") : tCommon("not_set")}
          />
          <p className="text-xs text-muted-foreground">
            {t("smtp_password_help")}
            <span className="ml-2">（{sourceLabel("smtp_password")}）</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("reset_hint")}</p>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {t("updated_at")}:{" "}
          {settings.updated_at
            ? format.dateTime(new Date(settings.updated_at))
            : t("never_updated")}
        </span>
      </div>
      {/* 🚨 主ボタンはモードで変わる（規約 §2）。抜け道「やめる」は **▾ の中ではなく主の隣**（§4）。 */}
      {editing ? (
        <>
          <PageAction
            role="secondary"
            label={tCommon("action_cancel")}
            icon={<X />}
            onClick={cancelEditing}
          />
          <PageAction
            form="settings-form"
            role="primary"
            pending={saving}
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
