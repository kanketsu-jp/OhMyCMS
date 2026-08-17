"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import { FieldValue } from "@/components/ui/field-value";
import { CopyButton } from "@/components/ui/copy-button";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY } from "@/i18n/error";

/**
 * SSO（SAML）の設定。
 *
 * 🚨 面の作り方は `.claude/design-perf-charter.md` §3c の決めに従う:
 *    **Coinbase 型（面ゼロ）。1ページを Divider で区切る。カードで区切らない。**
 *    手本にした Anthropic / WorkOS の画面はカードだが、**堀池が見ているのはモバイル**で
 *    横幅が狭く、カードを剥がす作業は 2026-08-13 に丸一日かけた当のものなので繰り返さない。
 *
 * 🚨 §3c から取り入れたもの:
 *    **未入力なら確定ボタンを無効にする**（`opacity` で薄くするのでなく `disabled`）。
 *
 * 🚨 ここに出る値は**すべて公開情報**（IdP の SSO URL / Entity ID / 公開鍵の証明書）。
 *    秘密は 1 つも渡っていない（`AGENTS.md §3.7`）。
 */

export type SamlSettings = {
  enabled: boolean;
  idpEntityId: string | null;
  idpSsoUrl: string | null;
  idpCertificates: string[];
  spEntityId: string | null;
  attributes: { email: string[]; firstName: string[]; lastName: string[]; groups: string[] };
  updatedAt: string | null;
  usable: boolean;
  sp: { entityId: string; acsUrl: string; metadataUrl: string };
};

type EntryMode = "metadata" | "manual";

export function SamlSettingsManager({ settings }: { settings: SamlSettings }) {
  const t = useT("sso");
  const tCommon = useT("common");
  const tError = useT("errors");
  const format = useFormat();
  const router = useRouter();

  /**
   * 上で個別に拾えなかったエラーを、**辞書の文言**にする。
   *
   * 🚨 **サーバが返した文（`error.message`）を画面に出さない。**
   *    これは文言の話ではなく**なりすまし**の経路で、細工したリンクで任意の文章を
   *    アプリ公式のエラー枠に出せてしまう（司令塔 2026-08-15）。
   *    `AGENTS.md §3.8`「UI に文言を直接書かない」とは別の理由で、同じ結論になる。
   *
   * 🚨 表に載っていないコードは `unexpected`（「予期しないエラー」）ではなく
   *    **この画面の `error_save_failed`** に落とす。保存の途中なので、そちらが正確。
   */
  //
  // 🚨 `check-i18n-usage` はここも「動的な鍵」として疑い一覧に出す（`tError(key)`）。
  //    **行ごとの鍵は要りません。** `errorKeyFromApiCode` の戻り値は `ErrorKey`
  //    ＝ `ERROR_KEYS`（14 個）の union なので、**型が値域を閉じています**。
  //    実測 2026-08-16: **14 個とも ja / en の両方に在る**。
  //    ＝ 鍵を増やすときは `ERROR_KEYS` を通るので、`check-i18n-keys` が ja/en 差を捕まえます。
  const fallbackMessage = (code: string | undefined) => {
    const key = errorKeyFromApiCode(code);
    return key === FALLBACK_ERROR_KEY ? t("error_save_failed") : tError(key);
  };

  const [mode, setMode] = useState<EntryMode>(settings.idpSsoUrl ? "manual" : "metadata");
  const [metadataXml, setMetadataXml] = useState("");
  const [entityId, setEntityId] = useState(settings.idpEntityId ?? "");
  const [ssoUrl, setSsoUrl] = useState(settings.idpSsoUrl ?? "");
  const [certificate, setCertificate] = useState(settings.idpCertificates[0] ?? "");
  const [enabled, setEnabled] = useState(settings.enabled);
  const [attributes, setAttributes] = useState({
    email: settings.attributes.email.join("\n"),
    firstName: settings.attributes.firstName.join("\n"),
    lastName: settings.attributes.lastName.join("\n"),
    groups: settings.attributes.groups.join("\n"),
  });

  const [error, setError] = useState<string | null>(null);
  /**
   * 表示モード ⇄ 編集モード（規約 `knowledge/decisions/action-button-and-edit-mode.md`）。
   *
   * 🚨 この画面の欄は**すべて controlled**（`value` + `onChange`）なので、
   * `settings-manager.tsx` のような `<form key>` の作り直しは要らない。
   * 代わりに「やめる」で**状態を props の値へ戻す**（§2-2 の「入れた値を捨てる」）。
   */
  const [editing, setEditing] = useState(false);

  // 🚨 §3c「未入力なら確定を無効にする」。
  //    どちらの入力方法を選んでいるかで、何が揃っていれば足りるかが変わる。
  //
  // 🚨 2026-08-15、アクションボタンをヘッダーへ移す作業でこの判定ごと消えた
  //    （`PageAction` に `disabled` が無く、置き換えようが無かった）。
  //    見た目の決まりごとではなく、**手入力モードで項目を消して保存すると
  //    設定済みの IdP が消える**のを止めている。同じ理由でサーバ側にも拒否を置いた
  //    （`app/api/settings/saml/route.ts`）。UI だけに守らせない（`AGENTS.md §3.5`）。
  const ready =
    mode === "metadata" ? metadataXml.trim().length > 0 : Boolean(entityId && ssoUrl && certificate);

  /** 編集をやめて表示モードへ戻す。**入れた値は捨てる**（props の値へ戻す）。 */
  function cancelEditing() {
    setError(null);
    setMode(settings.idpSsoUrl ? "manual" : "metadata");
    setMetadataXml("");
    setEntityId(settings.idpEntityId ?? "");
    setSsoUrl(settings.idpSsoUrl ?? "");
    setCertificate(settings.idpCertificates[0] ?? "");
    setEnabled(settings.enabled);
    setAttributes({
      email: settings.attributes.email.join("\n"),
      firstName: settings.attributes.firstName.join("\n"),
      lastName: settings.attributes.lastName.join("\n"),
      groups: settings.attributes.groups.join("\n"),
    });
    setEditing(false);
  }

  const save = useSubmitOnce(async () => {
    setError(null);

    const body: Record<string, unknown> = {
      enabled,
      attributes: {
        email: attributes.email,
        firstName: attributes.firstName,
        lastName: attributes.lastName,
        groups: attributes.groups,
      },
    };
    if (mode === "metadata") {
      body.metadata_xml = metadataXml;
    } else {
      body.idp_entity_id = entityId;
      body.idp_sso_url = ssoUrl;
      body.idp_certificates = certificate ? [certificate] : [];
    }

    const response = await fetch("/api/settings/saml", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      const code = payload?.error?.code;
      if (response.status === 403) setError(t("error_forbidden"));
      else if (code === "SAML_INCOMPLETE") setError(t("error_incomplete"));
      else if (code === "INVALID_METADATA") setError(t("error_invalid_metadata"));
      else if (code === "INVALID_CERTIFICATE") setError(t("error_invalid_certificate"));
      else if (code === "INVALID_URL") setError(t("error_invalid_url"));
      else setError(fallbackMessage(code));
      return;
    }

    toast.success(t("saved"));
    router.refresh();
  });

  /**
   * 🚨 `check-i18n-usage` は、ここを「**動的な鍵**」として疑い一覧に出す（`t(labelKey)`）。
   *    **行ごとの鍵は要りません。** 理由:
   *    呼び出し元は **4 箇所すべて文字列リテラル**で、鍵は 6 個に固定されている
   *    （`attribute_email_label` / `attribute_email_help` / `attribute_first_name_label` /
   *      `attribute_last_name_label` / `attribute_groups_label` / `attribute_groups_help`）。
   *    実測 2026-08-16: **6 個とも ja / en の両方に在る**。
   *    🔴 対照(−) 実在しない鍵を混ぜると「欠け」として出るので、この確認は空振りではない。
   *    🚨 **呼び出し元を増やすときは、その鍵が ja/en 両方に在ることを確かめること**
   *    （この関数は `t()` に素の文字列を渡すので、`check-i18n-keys` では守られません）。
   */
  const attributeField = (
    key: keyof typeof attributes,
    labelKey: string,
    helpKey?: string,
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`saml-attribute-${key}`}>{t(labelKey)}</Label>
      {/* 🚨 `textarea` は `readOnly` が効く型なので**要素を残す**（なぞってコピーできる）。§2-1 */}
      <Textarea
        id={`saml-attribute-${key}`}
        rows={2}
        readOnly={!editing}
        value={attributes[key]}
        onChange={(event) => setAttributes({ ...attributes, [key]: event.target.value })}
        placeholder={!editing ? tCommon("not_set") : undefined}
      />
      {helpKey ? <p className="text-xs text-muted-foreground">{t(helpKey)}</p> : null}
    </div>
  );

  return (
    <form id="saml-settings-form"
      className="max-w-2xl space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        void save.run();
      }}
    >
      <FormDraft formId="saml-settings-form" />
      {error ? (
        <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* ── IdP に登録する値（利用者が IdP 側へ写す） ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("sp_heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("sp_description")}</p>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="saml-sp-entity-id">{t("sp_entity_id_label")}</Label>
            <CopyButton value={settings.sp.entityId} selectTargetId="saml-sp-entity-id" />
          </div>
          <Input id="saml-sp-entity-id" readOnly value={settings.sp.entityId} placeholder={tCommon("not_set")} />
          <p className="text-xs text-muted-foreground">{t("sp_entity_id_help")}</p>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="saml-acs-url">{t("acs_url_label")}</Label>
            <CopyButton value={settings.sp.acsUrl} selectTargetId="saml-acs-url" />
          </div>
          <Input id="saml-acs-url" readOnly value={settings.sp.acsUrl} placeholder={tCommon("not_set")} />
          <p className="text-xs text-muted-foreground">{t("acs_url_help")}</p>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{t("sp_metadata_link")}</p>
            <CopyButton value={settings.sp.metadataUrl} selectTargetId="saml-metadata-url" />
          </div>
          <p className="text-xs">
            <a
              id="saml-metadata-url"
              // 🚨 `hover:` には必ず `active:` を対で書く（堀池 2026-08-15）。
              // タッチの端末に hover は無いので、hover だけだと**押した手応えが消える**。
              //
              // 実測（触る端末を再現して算出色を読んだ・2026-08-15）:
              //   SP (hover:none / pointer:coarse)  :hover **効かない** / :active 効く
              //   PC (hover:hover)                  :hover 効く        / :active 効く
              //   🚨 `active:` が無い形は SP で**押しても何も起きない**（無反応）
              //   ＝ Tailwind の `hover:` は `@media (hover: hover)` の中なので、**規則ごと当たらない**
              //   🚨 未検証: 実機の指で手応えとして十分か（強制した状態を読んでおり、押してはいない）
              className="break-all text-primary hover:text-primary/80 active:text-primary/80"
              href={settings.sp.metadataUrl}
            >
              {settings.sp.metadataUrl}
            </a>
          </p>
        </div>
      </section>

      <Separator />

      {/* ── IdP の設定（利用者が IdP 側から写してくる） ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("idp_heading")}</h2>

        {/* 🚨 §3c「2択を選ばせる」。ただしカードにはしない（面を増やさない）。
            🚨 タップ領域: 素の radio は **13px** で、WCAG 2.2 SC 2.5.8 の 24px すら割る
               （`scripts/audit-surface-depth.mjs` が SP で検出）。
               操作の的は `label` 全体なので高さトークンを使い、
               つまみ自体も 24px（`size-6`）に上げる。 */}
        {/* 🚨 表示モードは**要素ごと置き換えて、選ばれている名前だけを文字で出す**（§2-1・案 2）。
            `radio` は `readOnly` が**効かない**（属性は付くのに実クリックで変わる。実測 2026-08-16）。 */}
        {!editing ? (
          <FieldValue>{t(mode === "metadata" ? "entry_metadata" : "entry_manual")}</FieldValue>
        ) : (
        <div className="flex flex-wrap gap-x-6 text-sm">
          {(["metadata", "manual"] as EntryMode[]).map((value) => (
            <label key={value} className="flex min-h-(--control-h) items-center gap-2 md:min-h-(--control-h-pc)">
              <input
                type="radio"
                name="saml-entry-mode"
                className="size-6"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {/* 🚨 `check-i18n-usage` の疑い一覧に出るが、**行ごとの鍵は要りません**。
                  三項の両辺とも**この行に書いてあるリテラル**で、鍵は 2 個しかありません。
                  実測 2026-08-16: `entry_metadata` / `entry_manual` とも ja / en の両方に在る。 */}
              {t(value === "metadata" ? "entry_metadata" : "entry_manual")}
            </label>
          ))}
        </div>
        )}

        {mode === "metadata" ? (
          <div className="grid gap-2">
            <Label htmlFor="saml-metadata">{t("metadata_label")}</Label>
            <Textarea
              id="saml-metadata"
              rows={6}
              readOnly={!editing}
              value={metadataXml}
              onChange={(event) => setMetadataXml(event.target.value)}
              placeholder={!editing ? tCommon("not_set") : undefined}
            />
            <p className="text-xs text-muted-foreground">{t("metadata_help")}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="saml-idp-entity-id">{t("idp_entity_id_label")}</Label>
              <Input
                id="saml-idp-entity-id"
                readOnly={!editing}
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                placeholder={!editing ? tCommon("not_set") : undefined}
              />
              <p className="text-xs text-muted-foreground">{t("idp_entity_id_help")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="saml-idp-sso-url">{t("idp_sso_url_label")}</Label>
              <Input
                id="saml-idp-sso-url"
                readOnly={!editing}
                value={ssoUrl}
                onChange={(event) => setSsoUrl(event.target.value)}
                placeholder={!editing ? tCommon("not_set") : undefined}
              />
              <p className="text-xs text-muted-foreground">{t("idp_sso_url_help")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="saml-certificate">{t("certificate_label")}</Label>
              <Textarea
                id="saml-certificate"
                rows={5}
                readOnly={!editing}
                value={certificate}
                onChange={(event) => setCertificate(event.target.value)}
                placeholder={!editing ? tCommon("not_set") : undefined}
              />
              <p className="text-xs text-muted-foreground">{t("certificate_help")}</p>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          {t("certificate_count")}: {settings.idpCertificates.length}
        </p>
      </section>

      <Separator />

      {/* ── 属性の対応づけ（🚨 NameID をメールに固定しないための要） ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("attributes_heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("attributes_description")}</p>
        </div>
        {attributeField("email", "attribute_email_label", "attribute_email_help")}
        {attributeField("firstName", "attribute_first_name_label")}
        {attributeField("lastName", "attribute_last_name_label")}
        {attributeField("groups", "attribute_groups_label", "attribute_groups_help")}
      </section>

      <Separator />

      {/* ── 有効化（🚨 締め出さないことを画面で伝える） ── */}
      <section className="space-y-3">
        {/* 🚨 radio と同じ理由でタップ領域を上げている（素の checkbox は 13px）。 */}
        {/* 🚨 `checkbox` は `readOnly` が**効かない**（属性は付き `el.readOnly === true` になるのに、
            実クリックで変わる。実測 2026-08-16）。表示モードでは**要素ごと置き換えて値を文字で出す**。
            🚨 ✓ の絵にしない（読み上げに乗らない）。 */}
        {!editing ? (
          <FieldValue>
            {t("enable_label")}: {tCommon(enabled ? "state_enabled" : "state_disabled")}
          </FieldValue>
        ) : (
          <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
            <input
              type="checkbox"
              className="size-6"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            {t("enable_label")}
          </label>
        )}
        <p className="text-xs text-muted-foreground">{t("enable_help")}</p>
        <p className="text-xs text-muted-foreground">{t("password_still_works")}</p>
      </section>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {t("updated_at")}:{" "}
          {settings.updatedAt ? format.dateTime(new Date(settings.updatedAt)) : t("never_updated")}
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
            form="saml-settings-form"
            role="primary"
            pending={save.pending}
            // 🚨 §3c: 未入力なら確定できない。
            disabled={!ready}
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
