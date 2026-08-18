import type { ReactNode } from "react";

type DetailField = {
  label: ReactNode;
  value: ReactNode;
};

type DetailFieldsProps = {
  fields: readonly DetailField[];
  columns?: 1 | 2;
};

export function DetailFields({ fields, columns = 1 }: DetailFieldsProps) {
  return (
    <dl className={`grid gap-3 text-sm ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {fields.map((field, index) => (
        <div key={index} className="border border-border/60 bg-muted/20 p-3">
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="mt-1">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}
