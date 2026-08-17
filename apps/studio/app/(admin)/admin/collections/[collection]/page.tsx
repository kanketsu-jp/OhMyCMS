import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import type { CollectionResult, FieldResult, RelationResult } from "@/lib/schema/models";
import { apiFetch } from "@/lib/admin/api";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { ErrorBanner } from "@/components/admin/error-banner";
import { ListEmpty } from "@/components/admin/list-empty";
import { PageAction } from "@/components/admin/page-action";
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
  searchParams: Promise<{ error?: string }>;
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
  // 『対象が無い』は『中身が空』より前に判定する。
  if (!collectionResult.ok) {
    return (
      <div className="max-w-6xl space-y-6">
        <div>
          <Link href="/admin/collections" className="text-sm text-muted-foreground transition-colors hover:text-foreground active:text-foreground">
            {tCollections("back_to_list")}
          </Link>
        </div>
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
      <div>
        <Link href="/admin/collections" className="text-sm text-muted-foreground transition-colors hover:text-foreground active:text-foreground">
          {tCollections("back_to_list")}
        </Link>
      </div>
      {/* 🚨 **囲まない**（`PageAction` は portal で外へ出るので、ここに中身は残らない）。
          🚨 form は**残す**。`form="collection-delete-form"` が指す相手そのものなので、
             消すと削除ボタンが黙って効かなくなる（中身は空でよい）。 */}
      <form id="collection-delete-form" action={`/admin/actions/collections/${encoded}/delete`} method="post" />
      {/* 🚨 **主アクションは 1 つ。削除は ▾ の中**（堀池さん 283 A・2026-08-15 原文:
          「主アクションを別のものにし、削除はオプションへ」）。
          規約 `knowledge/decisions/action-button-and-edit-mode.md` §3。
          🚨 主を「フィールド追加」にしたのは**規約の表がそう決めている**から。
          **押された回数は測れない**（記録を取っていない）ので、**頻度の根拠は推測**。
          🚨 押したあとの振る舞い（ゴミ箱へ入るのか消えるのか）と文言は **288 待ち**。
          ここで決めたのは**置き場所だけ**。 */}
      <PageAction
        href={`/admin/collections/${encoded}/fields/new`}
        label={tFields("add_title")}
        icon={<Plus />}
        options={[
          {
            label: tCollections("delete_button"),
            formId: "collection-delete-form",
            destructive: true,
            // 🚨 **戻せない**（`lib/schema/service.ts` が表ごと落とす）。決定の①。
            //    本文に**及ぶ範囲**を書く（決定 §4）——**中の項目も一緒に消える**。
            confirm: {
              title: tCollections("delete_confirm_title"),
              description: tCollections("delete_confirm", { name: collection }),
              confirmLabel: tCollections("delete_button"),
              tone: "danger",
            },
          },
        ]}
      />
      <ErrorBanner
        message={
          errorMessage ??
          (!fieldsResult.ok ? tError(fieldsResult.messageKey) : null) ??
          (!relationsResult.ok ? tError(relationsResult.messageKey) : null)
        }
      />
      <Surface id={sectionAnchorId("fields.list_title")}>
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
            {/* 🚨 1 件も無いことを、表の枠だけで伝えない。
                読み込めていないのか、まだ無いのかが分からない。 */}
            {見せる項目.length === 0 ? <ListEmpty>{tFields("empty")}</ListEmpty> : null}
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
                <p className="mb-2 text-sm text-muted-foreground">{tFields("internal_fields_note")}</p>
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
      </Surface>
      <Surface>
        <SurfaceTitle>{tCollections("display_name_heading")}</SurfaceTitle>
        <p className="text-sm text-muted-foreground">{tCollections("display_name_help")}</p>
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
        <p className="text-sm text-muted-foreground">{tCollections("icon_help")}</p>
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
      <Surface id={sectionAnchorId("relations.list_title")}>
        {relationsResult.ok ? (
          collectionRelations.length > 0 ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">{tRelations("empty_relations")}</p>
          )
        ) : null}
      </Surface>
      <Surface id={sectionAnchorId("relations.add_title")}>
        <SurfaceTitle>{tRelations("add_title")}</SurfaceTitle>
        <RelationForm collection={collection} collectionNames={collectionNames} />
      </Surface>
    </div>
  );
}
