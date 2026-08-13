import Image from "next/image";

import {
  resolveFieldDisplay,
  richTextToPlain,
  summarizeJson,
  type FieldDisplayId,
} from "@/lib/schema/displays";
import type { FieldResult } from "@/lib/schema/models";
import { getFormat, getT } from "@/i18n/server";

/** 一覧に出すために、ページ側が**まとめて**引いておいた参照先。 */
export type DisplayLookup = {
  /** ファイル id → 表示に要る最小限。🚨 id は画面に出さない */
  files?: Map<string, { filename: string; isImage: boolean }>;
  /** リレーション先の id → 相手の表示名。🚨 id は画面に出さない */
  relations?: Map<string, string>;
};

type Props = {
  field: Pick<FieldResult, "field" | "type" | "meta" | "schema">;
  value: unknown;
  lookup?: DisplayLookup;
};

/**
 * 一覧の1セルを描く。**どの型でも JSON（中括弧）を出さない**。
 *
 * 🚨 何をどう見せるかの判断は `lib/schema/displays.ts` が持つ（Next.js に依存させない）。
 * ここは**解決済みの display を React にするだけ**。`field-input.tsx` と `interfaces.ts` の関係と同じ。
 *
 * 🚨 ファイルとリレーションは **id を出さない**。出すのは名前かサムネ。
 * 参照先は**ページ側がまとめて引いて** `lookup` で渡す。
 * ここで1件ずつ引くと**行ごとに問い合わせが増える**（N+1。
 * `knowledge/decisions/relation-permission-boundary.md`）。
 */
export async function FieldDisplay({ field, value, lookup }: Props) {
  const t = await getT("items");
  const tFields = await getT("fields");
  const format = await getFormat();
  const display: FieldDisplayId = resolveFieldDisplay(field);

  if (value === null || value === undefined || value === "") return null;

  switch (display) {
    case "boolean":
      return <>{value ? tFields("yes") : tFields("no")}</>;

    case "datetime": {
      const date = new Date(String(value));
      // 壊れた値で画面を落とさない。読めなければそのまま出す（中括弧は出ない）
      if (Number.isNaN(date.getTime())) return <>{String(value)}</>;
      return <>{format.dateTime(date)}</>;
    }

    case "file": {
      const file = lookup?.files?.get(String(value));
      // 🚨 引けていないときも **UUID は出さない**。出すものが無ければ何も出さない
      if (!file) return null;
      return (
        <span className="flex min-w-0 items-center gap-2">
          {file.isImage ? (
            <Image
              src={`/api/assets/${String(value)}?width=48&fit=cover`}
              alt={file.filename}
              width={24}
              height={24}
              unoptimized
              className="size-6 shrink-0 rounded object-cover"
            />
          ) : null}
          <span className="truncate">{file.filename}</span>
        </span>
      );
    }

    case "relation": {
      // 🚨 相手の表示名だけを出す。引けていなければ何も出さない（id を出さない）
      const label = lookup?.relations?.get(String(value));
      return label ? <>{label}</> : null;
    }

    case "richtext": {
      const text = richTextToPlain(value);
      return text ? <span className="truncate">{text}</span> : null;
    }

    case "json": {
      const summary = summarizeJson(value);
      switch (summary.kind) {
        case "empty":
          return null;
        case "list":
          return <>{t("value_list_count", { count: format.number(summary.count) })}</>;
        case "fields":
          return <>{t("value_fields_count", { count: format.number(summary.count) })}</>;
        case "text":
          return <span className="truncate">{summary.text}</span>;
      }
    }

    // 🚨 逃げ道。**明示的に display: "raw" を選んだときだけ**ここへ来る
    case "raw":
      return <>{typeof value === "string" ? value : JSON.stringify(value)}</>;

    case "text":
    default:
      return <>{String(value)}</>;
  }
}
