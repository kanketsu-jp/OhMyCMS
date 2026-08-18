import Link from "next/link";
import { notFound } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import type { CollectionResult, FieldResult, RelationResult } from "@/lib/schema/models";
import { apiFetch, hasApiCode } from "@/lib/admin/api";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ParentBackLink } from "@/components/admin/parent-back-link";
import { ListEmpty } from "@/components/admin/list-empty";
import { WideTable } from "@/components/admin/wide-table";
import { FieldCreateForm } from "@/components/admin/field-create-form";
import { PageAction } from "@/components/admin/page-action";
import { PageTabs } from "@/components/admin/page-tabs";
import { sectionAnchorId } from "@/components/admin/page-sections";
import { RelationForm } from "@/components/admin/relation-form";
import { errorKeyFromQuery } from "@/i18n/error";
import { fieldLabel } from "@/lib/schema/labels";
import { collectionLabel } from "@/lib/schema/collection-labels";
import { getLocale, getT } from "@/i18n/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COLLECTION_ICONS } from "@/lib/admin/collection-icons";
import { CollectionIconFor } from "@/components/admin/left-sidebar";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ error?: string; tab?: string }>;
};

type CollectionRelationRow = {
  key: string;
  kind: "m2o" | "o2m";
  relation: RelationResult;
  currentField: string;
  relatedCollection: string;
  relatedField: string;
};

function relationRows(relations: RelationResult[], collection: string): CollectionRelationRow[] {
  return relations.flatMap((relation) => {
    const rows: CollectionRelationRow[] = [];
    const meta = relation.meta;

    if (meta?.many_collection === collection) {
      rows.push({
        key: `${relation.many_collection}.${relation.many_field}.m2o`,
        kind: "m2o",
        relation,
        currentField: relation.many_field,
        relatedCollection: meta.one_collection ?? "",
        relatedField: "-",
      });
    }

    if (meta?.one_collection === collection && meta.one_field) {
      rows.push({
        key: `${relation.many_collection}.${relation.many_field}.o2m`,
        kind: "o2m",
        relation,
        currentField: meta.one_field,
        relatedCollection: relation.many_collection,
        relatedField: relation.many_field,
      });
    }

    return rows;
  });
}

function fieldTranslationFormId(field: string) {
  return `field-translation-form-${encodeURIComponent(field)}`;
}

export default async function CollectionDetailPage({ params, searchParams }: Props) {
  const query = await searchParams;
  const tab = query.tab === "field-create" || query.tab === "relations" || query.tab === "relation-create"
    ? query.tab
    : "fields";
  // 🚨 URL の値は鍵としてしか受け取らない（許可リスト・fail closed）。i18n/error.ts 参照。
  const tError = await getT("errors");
  const errorKey = errorKeyFromQuery(query.error);
  const errorMessage = errorKey ? tError(errorKey) : null;
  const tCollections = await getT("collections");
  const tCommon = await getT("common");
  const tFields = await getT("fields");
  const tItems = await getT("items");
  const locale = await getLocale();
  const tRelations = await getT("relations");
  const { collection } = await params;
  const encoded = encodeURIComponent(collection);
  const [collectionResult, fieldsResult, relationsResult, collectionsResult] = await Promise.all([
    apiFetch<CollectionResult>(`/api/collections/${encoded}`),
    apiFetch<FieldResult[]>(`/api/fields/${encoded}`),
    apiFetch<RelationResult[]>("/api/relations"),
    apiFetch<CollectionResult[]>("/api/collections"),
  ]);
  // 🚨 **内部で使う項目は、既定で出さない**（設問286 A ②・design と合意した案 A）。
  //    利用者が作った項目ではなく、**消すと本体が壊れる**（本文の検索用の相方・論理削除の日時）。
  //    見せると「消してよいもの」に見える。
  // 🚨 **ただし無かったことにはしない**。件数を常に出して、開けば中身が見られる形にする
  //    （**見えないものは、在ることに気づけない**）。
  // 🚨 判定は **`meta.hidden` 1 本**。名前で除かない（`field === "deleted_at"` 等を書かない）——
  //    判定の道が 2 本あると、次に内部項目を足す人がどちらに従うか分からなくなる。
  const 見せる項目 = fieldsResult.ok ? fieldsResult.data.filter((f) => !f.meta?.hidden) : [];
  const 内部項目 = fieldsResult.ok ? fieldsResult.data.filter((f) => Boolean(f.meta?.hidden)) : [];
  const collectionRelations = relationsResult.ok
    ? relationRows(relationsResult.data, collection)
    : [];
  const collectionNames = collectionsResult.ok
    ? collectionsResult.data.map((item) => item.collection)
    : [];
  const collectionLabelByName = new Map(
    collectionsResult.ok
      ? collectionsResult.data.map((item) => [item.collection, collectionLabel(item, locale)])
      : [],
  );
  const labelForCollectionName = (name: string) =>
    collectionLabelByName.get(name) ?? collectionLabel({ collection: name, meta: null }, locale);

  // 対象が無いときは、中身を描かない。『無い』と『在るが空』を同じ場所で混ぜない。
  // 🚨 **無いコレクションは notFound() を呼ぶ**（2026-08-17・auth の実測）。
  //    自前で描くと **HTTP が 200 のまま**になり、右パネルの「概要」も出続けて
  //    **無いものについて「欄と関係を設定します」と約束していた**。
  //    🚨 それ以外の失敗（権限・通信）は今までどおり ErrorBanner で出す
  //       （**「無い」と「取れなかった」を混ぜない**）。
  if (hasApiCode(collectionResult, "COLLECTION_NOT_FOUND")) {
    notFound();
  }

  // 『対象が無い』は『中身が空』より前に判定する。
  if (!collectionResult.ok) {
    return (
      <div className="max-w-6xl space-y-6">
        <ParentBackLink href="/admin/collections">{tCollections("back_to_list")}</ParentBackLink>
        <ErrorBanner message={errorMessage ?? tError(collectionResult.messageKey)} />
      </div>
    );
  }

  const currentTranslations = collectionResult.data.meta?.translations ?? null;
  const currentIcon = collectionResult.data.meta?.icon ?? null;

  return (
    <div className="max-w-6xl space-y-6">
      {/* 🚨 **タイトル行（`flex flex-wrap items-start justify-between gap-3`）を外した**。
          原典（idea.md:65）:「この div は必要ない。理由はタイトルはパンくずで表示するのと、
          その下の概要は『info』アイコンで説明する」。
          いま**タイトルはヘッダーのパンくず**が、**概要は右パネル**が持っているので、
          この行が並べるものは何も残らない（`PageAction` は portal で外へ出る）。
          ❌ 戻さないこと。戻すと**同じ役目のものが2箇所**に出る。 */}
      <ParentBackLink href="/admin/collections">{tCollections("back_to_list")}</ParentBackLink>
      <PageTabs
        tabs={[
          { href: `/admin/collections/${encoded}?tab=fields`, label: tFields("list_tab"), current: tab === "fields" },
          { href: `/admin/collections/${encoded}?tab=field-create`, label: tFields("add_tab"), current: tab === "field-create" },
          { href: `/admin/collections/${encoded}?tab=relations`, label: tRelations("list_tab"), current: tab === "relations" },
          { href: `/admin/collections/${encoded}?tab=relation-create`, label: tRelations("add_tab"), current: tab === "relation-create" },
        ]}
      />
      {/* 🚨 **囲まない**（`PageAction` は portal で外へ出るので、ここに中身は残らない）。
          🚨 form は**残す**。`form="collection-delete-form"` が指す相手そのものなので、
             消すと削除ボタンが黙って効かなくなる（中身は空でよい）。 */}
      <form id="collection-delete-form" action={`/admin/actions/collections/${encoded}/delete`} method="post" />
      {/* 🚨 項目追加は本文フォームを主とし、ヘッダーからも同じフォームを送れるようにする。削除は ▾ の中。 */}
      {tab === "fields" || tab === "relations" ? (
        <PageAction
          href={`/admin/collections/${encoded}?tab=${tab === "fields" ? "field-create" : "relation-create"}`}
          label={tab === "fields" ? tFields("add_button") : tRelations("add_button")}
          icon={<Save />}
          options={[{
            label: tCollections("delete_button"),
            formId: "collection-delete-form",
            destructive: true,
            confirm: {
              title: tCollections("delete_confirm_title"),
              description: tCollections("delete_confirm", { name: collection }),
              confirmLabel: tCollections("delete_button"),
              tone: "danger",
            },
          }]}
        />
      ) : null}
      <ErrorBanner
        message={
          errorMessage ??
          (!fieldsResult.ok ? tError(fieldsResult.messageKey) : null) ??
          (!relationsResult.ok ? tError(relationsResult.messageKey) : null)
        }
      />
      {tab === "fields" ? <Surface id={sectionAnchorId("fields.list_title")}>
        {/* 🚨 見出しは出さない（堀池・2026-08-15「「〜一覧」の見出しは全部消す」）。
            見て分かるものに名前を付けない。**右サイドバーの「項目一覧」には出る**ので、
            辞書の鍵は消さないこと（消すと項目一覧の名前が消える）。 */}
        {fieldsResult.ok ? (
          <>
            {見せる項目.map((field) => (
              <form
                key={field.field}
                id={fieldTranslationFormId(field.field)}
                action={`/admin/actions/collections/${encoded}/fields/${encodeURIComponent(field.field)}/translations`}
                method="post"
              />
            ))}
            {見せる項目.length > 0 ? (
              <WideTable>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tFields("field_header")}</TableHead>
                      <TableHead>{tFields("display_name_header")}</TableHead>
                      <TableHead>{tFields("type_label")}</TableHead>
                      <TableHead>{tFields("required_label")}</TableHead>
                      <TableHead>{tFields("primary_key_header")}</TableHead>
                      <TableHead>{tFields("db_type_header")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {見せる項目.map((field) => {
                      const formId = fieldTranslationFormId(field.field);
                      const translations = field.meta?.translations ?? null;
                      const jaLabel = tCommon("locale_ja");
                      const enLabel = tCommon("locale_en");

                      return (
                        <TableRow key={field.field}>
                          <TableCell className="font-medium">
                            {/* 🚨 生の識別子でなく辞書を通す（設問286 A ②）。
                                辞書が空なら `fieldLabel` が識別子を返すので、
                                名前を付けるまでは**いままでと 1 文字も変わらない**。 */}
                            {fieldLabel(field, locale)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2">
                              <div className="grid gap-2 md:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                  <Label htmlFor={`${formId}-ja`}>{jaLabel}</Label>
                                  <Input
                                    id={`${formId}-ja`}
                                    name="name_ja"
                                    form={formId}
                                    defaultValue={translations?.ja ?? ""}
                                    aria-label={tFields("display_name_input_label", {
                                      field: field.field,
                                      locale: jaLabel,
                                    })}
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <Label htmlFor={`${formId}-en`}>{enLabel}</Label>
                                  <Input
                                    id={`${formId}-en`}
                                    name="name_en"
                                    form={formId}
                                    defaultValue={translations?.en ?? ""}
                                    aria-label={tFields("display_name_input_label", {
                                      field: field.field,
                                      locale: enLabel,
                                    })}
                                  />
                                </div>
                              </div>
                              <div>
                                <Button type="submit" form={formId} size="sm">
                                  <Save data-icon="inline-start" />
                                  {tFields("display_name_save")}
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{field.type}</TableCell>
                          <TableCell>{field.schema?.is_nullable === false ? tFields("yes") : tFields("no")}</TableCell>
                          <TableCell>{field.schema?.is_primary_key ? tFields("yes") : tFields("no")}</TableCell>
                          <TableCell>{field.schema?.data_type ?? ""}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </WideTable>
            ) : (
              <ListEmpty>
                {tFields("empty")}{" "}
              </ListEmpty>
            )}
          </>
        ) : null}
        {/* 🚨 面は増やさない（`no-nested-surfaces`）。表と同じ面の中に置く。 */}
        {内部項目.length > 0 ? (
          <Accordion className="mt-4">
            <AccordionItem value="internal-fields">
              <AccordionTrigger>
                {tFields("internal_fields_title", { count: 内部項目.length })}
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-base text-muted-foreground">{tFields("internal_fields_note")}</p>
                <WideTable>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tFields("field_header")}</TableHead>
                        <TableHead>{tFields("type_label")}</TableHead>
                        <TableHead>{tFields("db_type_header")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {内部項目.map((field) => (
                        <TableRow key={field.field}>
                          <TableCell className="font-medium">{fieldLabel(field, locale)}</TableCell>
                          <TableCell>{field.type}</TableCell>
                          <TableCell>{field.schema?.data_type ?? ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </WideTable>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
        <div className="mt-4">
          <Link
            href={`/admin/content/${encoded}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {tItems("manage_link")}
          </Link>
        </div>
      </Surface> : null}
      {tab === "field-create" ? <Surface id={sectionAnchorId("fields.add_title")}>
        <SurfaceTitle>{tFields("add_title")}</SurfaceTitle>
        <FieldCreateForm collection={encoded} />
      </Surface> : null}
      {/* 🚨 面の上の線と見出しがくっつかないよう、線の下に 24px（DESIGN.md §1-9・/admin/version と同じ形）。 */}
      <Surface>
        <SurfaceTitle>{tCollections("display_name_heading")}</SurfaceTitle>
        <p className="text-base text-muted-foreground">{tCollections("display_name_help")}</p>
        <form
          action={`/admin/actions/collections/${encoded}/translations`}
          method="post"
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="collection-name-ja">{tCommon("locale_ja")}</Label>
              <Input
                id="collection-name-ja"
                name="name_ja"
                defaultValue={currentTranslations?.ja ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="collection-name-en">{tCommon("locale_en")}</Label>
              <Input
                id="collection-name-en"
                name="name_en"
                defaultValue={currentTranslations?.en ?? ""}
              />
            </div>
          </div>
          <div>
            <Button type="submit">
              <Save data-icon="inline-start" />
              {tCollections("display_name_save")}
            </Button>
          </div>
        </form>
      </Surface>
      {/* 🚨 アイコンを選ぶ（K2・堀池さん 2026-08-17「それぞれのコンテンツが固有のアイコンを持つように」）。
          表示名のすぐ下に置く——**どちらもこのコレクションの「名乗り」**で、離すと片方を見落とす。
          🚨 **一覧は `lib/admin/collection-icons.ts` の 1 本だけが決める。**
             ここへ配列を写経しない（写経すると、画面に出るのに API が弾く／その逆が必ず起きる）。
          🚨 選ばない（`""`）も**必ず出す**。一度選んだ人が**戻せなくなる**ため。 */}
      <Surface>
        <SurfaceTitle>{tCollections("icon_heading")}</SurfaceTitle>
        <p className="text-base text-muted-foreground">{tCollections("icon_help")}</p>
        <form
          action={`/admin/actions/collections/${encoded}/icon`}
          method="post"
          className="flex flex-col gap-4"
        >
          {/* 🚨 **箱を描かない**（`decisions/no-nested-surfaces.md`）。ここは既に `Surface` の中なので、
              罫線や背景を持たせると**面の中に面**になる。実際 `check-surface-nesting` が 2 件で落とした
              （門は正しく鳴いた）。選択中は**色だけ**で示す——太さや枠で状態を表さないのは
              `tree-connector-lines.md` と同じ考え方。 */}
          <div className="flex flex-wrap gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 px-1 py-1.5 text-sm has-checked:text-primary">
              <input
                type="radio"
                name="icon"
                value=""
                defaultChecked={!currentIcon}
                className="size-3.5"
              />
              {tCollections("icon_none")}
            </label>
            {COLLECTION_ICONS.map((name) => (
              <label
                key={name}
                className="flex cursor-pointer items-center gap-1.5 px-1 py-1.5 text-sm has-checked:text-primary"
              >
                <input
                  type="radio"
                  name="icon"
                  value={name}
                  defaultChecked={currentIcon === name}
                  className="size-3.5"
                />
                {/* 🚨 絵だけを出す。**名前（`shield-alert` 等）は識別子なので辞書に載せない**
                    （`AGENTS.md` §3.8 の「辞書化しないもの: スキーマ識別子」と同じ扱い）。
                    読み上げのために `title` に名前を残す。 */}
                <CollectionIconFor icon={name} />
                <span className="sr-only">{name}</span>
              </label>
            ))}
          </div>
          <div>
            <Button type="submit">
              <Save data-icon="inline-start" />
              {tCollections("icon_save")}
            </Button>
          </div>
        </form>
      </Surface>
      {tab === "relations" ? <Surface id={sectionAnchorId("relations.list_title")}>
        {relationsResult.ok ? (
          collectionRelations.length > 0 ? (
            <WideTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tRelations("kind_header")}</TableHead>
                    <TableHead>{tRelations("current_field_header")}</TableHead>
                    <TableHead>{tRelations("related_collection_header")}</TableHead>
                    <TableHead>{tRelations("related_field_header")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collectionRelations.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>{tRelations(row.kind === "m2o" ? "kind_m2o" : "kind_o2m")}</TableCell>
                      <TableCell className="font-medium">{row.currentField}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            {labelForCollectionName(row.relatedCollection)}
                          </span>
                          <span className="text-xs text-muted-foreground">{row.relatedCollection}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.relatedField}</TableCell>
                      <TableCell className="text-right">
                        {/* 🚨 関連の削除は**戻せない**（`lib/schema/service.ts:1143` が `.delete()`）。
                            決定 `confirm-by-reversibility-and-reach` の①に当たるので確認を出す。
                            🚨 **フォームはサーバ側のまま**（`method="post"` → route handler）。
                            送信ボタンだけを client にしてある（`ConfirmSubmit` の申し送り参照）。 */}
                        <form
                          id={`relation-delete-${row.key}`}
                          action={`/admin/actions/collections/${encoded}/relations/delete`}
                          method="post"
                        >
                          <input type="hidden" name="many_collection" value={row.relation.many_collection} />
                          <input type="hidden" name="many_field" value={row.relation.many_field} />
                          <ConfirmSubmit
                            formId={`relation-delete-${row.key}`}
                            title={tRelations("delete_confirm_title")}
                            description={tRelations("delete_confirm", {
                              field: row.currentField,
                              collection: row.relatedCollection,
                            })}
                            confirmLabel={tRelations("delete_button")}
                            ariaLabel={tRelations("delete_button")}
                          >
                            <Trash2 />
                            <span className="hidden md:inline">{tRelations("delete_button")}</span>
                          </ConfirmSubmit>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </WideTable>
          ) : (
            <p className="text-base text-muted-foreground">{tRelations("empty_relations")}</p>
          )
        ) : null}
      </Surface> : null}
      {tab === "relation-create" ? <Surface id={sectionAnchorId("relations.add_title")}>
        <SurfaceTitle>{tRelations("add_title")}</SurfaceTitle>
        <RelationForm collection={collection} collectionNames={collectionNames} />
      </Surface> : null}
    </div>
  );
}
