"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";

type RelationKind = "m2o" | "o2m";

type Props = {
  collection: string;
  collectionNames: string[];
};

export function RelationForm({ collection, collectionNames }: Props) {
  const t = useT("relations");
  const [kind, setKind] = useState<RelationKind>("m2o");
  const isManyToOne = kind === "m2o";
  const encoded = encodeURIComponent(collection);

  return (
    <form
      action={`/admin/actions/collections/${encoded}/relations`}
      method="post"
      className="grid gap-4 md:grid-cols-[140px_1fr_1fr_1fr_1fr_auto] md:items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="relation-kind">{t("kind_label")}</Label>
        <select
          id="relation-kind"
          name="kind"
          className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm"
          value={kind}
          onChange={(event) => setKind(event.target.value as RelationKind)}
          required
        >
          <option value="m2o">{t("kind_m2o")}</option>
          <option value="o2m">{t("kind_o2m")}</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="relation-field">{t("field_label")}</Label>
        <Input
          id="relation-field"
          name="field"
          required={isManyToOne}
          disabled={!isManyToOne}
          pattern="[A-Za-z_][A-Za-z0-9_]*"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="related-collection">{t("related_collection_label")}</Label>
        <select
          id="related-collection"
          name="related_collection"
          className="h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm"
          required
        >
          {collectionNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="related-field">{t("related_field_label")}</Label>
        <Input
          id="related-field"
          name="related_field"
          required={!isManyToOne}
          disabled={isManyToOne}
          pattern="[A-Za-z_][A-Za-z0-9_]*"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="one-field">{t("one_field_label")}</Label>
        <Input
          id="one-field"
          name="one_field"
          required={!isManyToOne}
          disabled={isManyToOne}
          pattern="[A-Za-z_][A-Za-z0-9_]*"
        />
      </div>
      <Button type="submit">{t("add_button")}</Button>
    </form>
  );
}
