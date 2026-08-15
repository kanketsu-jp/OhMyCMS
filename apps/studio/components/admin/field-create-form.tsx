"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import { FormDraft } from "@/components/admin/form-draft";
import { PageAction } from "@/components/admin/page-action";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";
import { interfacesForType, type FieldInterfaceId } from "@/lib/schema/interfaces";

const fieldTypes = [
  "string",
  "integer",
  "boolean",
  "uuid",
  "dateTime",
  "json",
  "float",
  "decimal",
  "bigInteger",
  "date",
  "time",
];

type FieldKindId =
  | "short_text"
  | "long_text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "time"
  | "file";

type FieldKind = {
  type: string;
  interface: FieldInterfaceId;
};

const fieldKinds: Record<FieldKindId, FieldKind> = {
  short_text: { type: "string", interface: "input" },
  long_text: { type: "json", interface: "richtext" },
  number: { type: "integer", interface: "input" },
  boolean: { type: "boolean", interface: "boolean" },
  date: { type: "date", interface: "input" },
  datetime: { type: "dateTime", interface: "input" },
  time: { type: "time", interface: "input" },
  file: { type: "uuid", interface: "file" },
};

const selectClassName =
  "h-(--control-h) w-full rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm";

type Props = {
  collection: string;
};

export function FieldCreateForm({ collection }: Props) {
  const t = useT("fields");
  const [kindId, setKindId] = useState<FieldKindId>("short_text");
  const [advancedType, setAdvancedType] = useState("");
  const [advancedInterface, setAdvancedInterface] = useState("");
  const selectedKind = fieldKinds[kindId];
  const resolvedType = advancedType || selectedKind.type;
  const interfaceOptions = useMemo(() => interfacesForType(resolvedType), [resolvedType]);
  const selectedAdvancedInterface = interfaceOptions.includes(advancedInterface as FieldInterfaceId)
    ? advancedInterface
    : "";
  const resolvedInterface = selectedAdvancedInterface
    || (interfaceOptions.includes(selectedKind.interface) ? selectedKind.interface : "");

  function keepInterfaceIfAllowed(type: string) {
    if (
      advancedInterface
      && !interfacesForType(type).includes(advancedInterface as FieldInterfaceId)
    ) {
      setAdvancedInterface("");
    }
  }

  return (
    <form id="field-create-form"
      action={`/admin/actions/collections/${collection}/fields`}
      method="post"
      className="flex flex-col gap-4"
    >
      <FormDraft formId="field-create-form" />
      <input type="hidden" name="type" value={resolvedType} />
      <input type="hidden" name="interface" value={resolvedInterface} />

      <div className="grid gap-4 md:grid-cols-[1fr_220px_150px_110px_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="field">{t("name_label")}</Label>
          <Input id="field" name="field" required pattern="[A-Za-z_][A-Za-z0-9_]*" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="field_kind">{t("kind_label")}</Label>
          <select
            id="field_kind"
            className={selectClassName}
            value={kindId}
            onChange={(event) => {
              const nextKindId = event.target.value as FieldKindId;
              setKindId(nextKindId);
              keepInterfaceIfAllowed(advancedType || fieldKinds[nextKindId].type);
            }}
          >
            <option value="short_text">{t("kind_short_text")}</option>
            <option value="long_text">{t("kind_long_text")}</option>
            <option value="number">{t("kind_number")}</option>
            <option value="boolean">{t("kind_boolean")}</option>
            <option value="date">{t("kind_date")}</option>
            <option value="datetime">{t("kind_datetime")}</option>
            <option value="time">{t("kind_time")}</option>
            <option value="file">{t("kind_file")}</option>
          </select>
        </div>
        {kindId === "short_text" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max_length">{t("max_length_label")}</Label>
            <Input id="max_length" name="max_length" type="number" min="1" defaultValue="255" />
          </div>
        ) : null}
        <label className="flex h-(--control-h) items-center gap-2 text-sm md:h-(--control-h-pc-field)">
          <input type="checkbox" name="required" value="true" className="size-4" />
          {t("required_label")}
        </label>
      </div>

      <Accordion className="border-0">
        <AccordionItem value="advanced" className="border-0">
          <AccordionTrigger className="py-0">
            {t("advanced_title")}
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className="grid gap-4 pt-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="advanced_type">{t("advanced_type_label")}</Label>
                <select
                  id="advanced_type"
                  className={selectClassName}
                  value={advancedType}
                  onChange={(event) => {
                    const nextAdvancedType = event.target.value;
                    setAdvancedType(nextAdvancedType);
                    keepInterfaceIfAllowed(nextAdvancedType || selectedKind.type);
                  }}
                >
                  <option value="">{t("advanced_type_auto")}</option>
                  {fieldTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="advanced_interface">{t("interface_label")}</Label>
                <select
                  id="advanced_interface"
                  className={selectClassName}
                  value={selectedAdvancedInterface}
                  onChange={(event) => setAdvancedInterface(event.target.value)}
                >
                  <option value="">{t("interface_auto")}</option>
                  {interfaceOptions.map((id) => (
                    <option key={id} value={id}>
                      {t(`interface_${id}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <PageAction
        form="field-create-form"
        role="primary"
        label={t("add_button")}
        icon={<Check />}
      />
    </form>
  );
}
