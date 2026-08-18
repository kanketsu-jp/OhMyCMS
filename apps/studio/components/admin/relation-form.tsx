"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FieldLabel } from "@/components/admin/field-label";
import { PageAction } from "@/components/admin/page-action";
import { Input } from "@/components/ui/input";
import { useFormSubmitShortcut } from "@/hooks/use-form-submit-shortcut";
import { useT } from "@/i18n/client";

/**
 * 🚨 この form の id。`useFormSubmitShortcut` が `getElementById` で引く相手そのものなので、
 * 変えるときは hook の呼び出しと**同時に**変える（片方だけ変えると ⌘Enter が黙って効かなくなる）。
 */
const FORM_ID = "relation-create-form";

type RelationKind = "m2o" | "o2m";

type Props = {
  collection: string;
  collectionNames: string[];
};

/**
 * コレクション間の m2o / o2m リレーションを作成するフォーム。
 *
 * 🚨 `FORM_ID` と `useFormSubmitShortcut` の対象を同時に変更する。入力中のショートカットはフォームのネイティブ検証を通す。
 *
 * 参考: DESIGN.md §0-1 ／ `components/admin/use-shortcut.tsx` ／ `components/admin/page-action.tsx`
 */
export function RelationForm({ collection, collectionNames }: Props) {
  const t = useT("relations");
  const [kind, setKind] = useState<RelationKind>("m2o");
  const [field, setField] = useState("");
  const [relatedField, setRelatedField] = useState("");
  const [oneField, setOneField] = useState("");
  const isManyToOne = kind === "m2o";
  const encoded = encodeURIComponent(collection);

  // 🚨 この画面の主アクション（`<PageAction>`）は**リンク**（項目の追加）なので、
  //    `PAGE_ACTIONS` の道では ⌘Enter が付かない。フォーム側で受ける。
  //    🚨 **保存するものが常に在る画面ではない**が、暴発しない根拠が 2 つある:
  //      ① `requestSubmit()` は**ネイティブ検証を通す**ので、必須が空なら何も起きない
  //      ② hook は「**別の form に focus が在るときは降りる**」
  //    ＝ **入力を始めた人だけが発火させられる**。
  useFormSubmitShortcut(FORM_ID);

  return (
    <form
      id={FORM_ID}
      action={`/admin/actions/collections/${encoded}/relations`}
      method="post"
      className="grid gap-4 md:grid-cols-[140px_1fr_1fr_1fr_1fr_auto] md:items-end"
    >
      <div className="space-y-1.5">
        <FieldLabel htmlFor="relation-kind" required>{t("kind_label")}</FieldLabel>
        <select
          id="relation-kind"
          name="kind"
          className="h-(--control-h) w-full rounded-lg bg-input px-2 text-base md:h-(--control-h-pc-field) md:text-sm"
          value={kind}
          onChange={(event) => setKind(event.target.value as RelationKind)}
          required
        >
          <option value="m2o">{t("kind_m2o")}</option>
          <option value="o2m">{t("kind_o2m")}</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="relation-field" required={isManyToOne}>{t("field_label")}</FieldLabel>
        <Input
          id="relation-field"
          name="field"
          value={field}
          onChange={(event) => setField(event.target.value)}
          required={isManyToOne}
          disabled={!isManyToOne}
          pattern="[A-Za-z_][A-Za-z0-9_]*"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="related-collection" required>{t("related_collection_label")}</FieldLabel>
        <select
          id="related-collection"
          name="related_collection"
          className="h-(--control-h) w-full rounded-lg bg-input px-2 text-base md:h-(--control-h-pc-field) md:text-sm"
          required
        >
          {collectionNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="related-field" required={!isManyToOne}>{t("related_field_label")}</FieldLabel>
        <Input
          id="related-field"
          name="related_field"
          value={relatedField}
          onChange={(event) => setRelatedField(event.target.value)}
          required={!isManyToOne}
          disabled={isManyToOne}
          pattern="[A-Za-z_][A-Za-z0-9_]*"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="one-field" required={!isManyToOne}>{t("one_field_label")}</FieldLabel>
        <Input
          id="one-field"
          name="one_field"
          value={oneField}
          onChange={(event) => setOneField(event.target.value)}
          required={!isManyToOne}
          disabled={isManyToOne}
          pattern="[A-Za-z_][A-Za-z0-9_]*"
        />
      </div>
      <PageAction
        form={FORM_ID}
        label={t("add_button")}
        icon={<Plus />}
        disabled={isManyToOne ? field.trim() === "" : relatedField.trim() === "" || oneField.trim() === ""}
      />
    </form>
  );
}
