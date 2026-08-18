import { ErrorBanner } from "@/components/admin/error-banner";
import { DetailFields } from "@/components/admin/detail-fields";
import { ParentBackLink } from "@/components/admin/parent-back-link";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getFormat, getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

/**
 * 利用者の **1 件**のページ。
 *
 * 🚨 **なぜ作ったか**（`decisions/list-views-are-switchable-layouts` §3）:
 *    各領域は「**一覧 / 1 件 / 新規**」の 3 つに揃える、と決めた。
 *    【測った・2026-08-17】`settings/users` は **一覧しか無かった**。
 *    ＝ **1 人を選んで確かめる場所が無い**（一覧の行が長くなるほど読めなくなる）。
 *
 * 🚨 **ここでは編集しない。** 方針の割り当ては一覧側に在り、
 *    **保存の単位（本体と割り当てを 1 つの保存にするか）が未決**（board 待ち）。
 *    先に編集を付けると、**決まる前の形が既成事実になる**。
 *    ＝ `settings/roles/[id]` と同じ扱い。
 *
 * 🚨 **出す列は一覧と同じものだけ。** `directus_users` には資格情報に近い列が在る
 *    （`decisions/user-tables-have-one-entrance`）。**1 件だからと増やさない。**
 */

type Props = {
  params: Promise<{ id: string }>;
};

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  role: string | null;
  avatar_emoji: string | null;
  last_access: string | null;
  provider: string | null;
  external_identifier: string | null;
};

type EffectiveCollectionView = {
  collection: string;
  read: boolean;
  write: boolean;
  delete: boolean;
  rowFiltered: boolean;
  fieldsRestricted: boolean;
  fields: string[] | "*";
};

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getT("users");
  const tError = await getT("errors");
  const format = await getFormat();

  const [result, effectiveResult] = await Promise.all([
    apiFetch<{ data: UserRow }>(`/api/users/${id}`),
    apiFetch<{ data: EffectiveCollectionView[] }>(`/api/users/${id}/effective-view`),
  ]);
  const user = result.ok ? result.data.data : null;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");

  return (
    <div className="max-w-5xl space-y-6">
      <ParentBackLink href="/admin/settings/users">{t("back_to_list")}</ParentBackLink>
      <ErrorBanner message={!result.ok ? tError(result.messageKey) : null} />
      {user ? (
        <>
        <Surface>
          {/* 🚨 名前が無い人が居る（SSO で来ると空のことが在る）。**メールを見出しにする**——
              **必ず在るもの**を見出しにしないと、見出しが空の画面ができる。 */}
          <SurfaceTitle>{user.email}</SurfaceTitle>
          <DetailFields
            fields={[
              { label: t("name_label"), value: name === "" ? t("no_name") : name },
              { label: t("status_label"), value: user.status },
              { label: t("provider_label"), value: user.provider ?? t("no_provider") },
              {
                label: t("last_access_label"),
                value:
                  user.last_access === null
                    ? t("never_accessed")
                    : format.dateTime(new Date(user.last_access)),
              },
            ]}
          />
          {/* 🚨 **できないことを、その場に書く。** 編集の場所を探させない。 */}
          <p className="mt-4 text-base text-muted-foreground">{t("detail_read_only_note")}</p>
        </Surface>
        <Surface>
          <SurfaceTitle>{t("effective_view_title")}</SurfaceTitle>
            <p className="mb-4 text-base text-muted-foreground">{t("effective_view_description")}</p>
          {!effectiveResult.ok ? (
            <ErrorBanner message={tError(effectiveResult.messageKey)} />
          ) : effectiveResult.data.data.length === 0 ? (
            <p className="text-base text-muted-foreground">{t("effective_view_empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[48rem] text-sm">
                <div className="grid grid-cols-[minmax(12rem,2fr)_repeat(3,minmax(6rem,1fr))_minmax(12rem,1.5fr)] border-b px-3 py-2 font-medium">
                  <div>{t("effective_collection")}</div>
                  <div>{t("effective_read")}</div>
                  <div>{t("effective_write")}</div>
                  <div>{t("effective_delete")}</div>
                  <div>{t("effective_details")}</div>
                </div>
                {effectiveResult.data.data.map((item) => (
                  <div
                    key={item.collection}
                    className="grid grid-cols-[minmax(12rem,2fr)_repeat(3,minmax(6rem,1fr))_minmax(12rem,1.5fr)] border-b px-3 py-3 last:border-b-0"
                  >
                    <div className="font-medium">{item.collection}</div>
                    <div>{item.read ? t("effective_allowed") : t("effective_not_allowed")}</div>
                    <div>{item.write ? t("effective_allowed") : t("effective_not_allowed")}</div>
                    <div>{item.delete ? t("effective_allowed") : t("effective_not_allowed")}</div>
                    <div className="space-y-1 text-muted-foreground">
                      <div>
                        {item.read
                          ? item.rowFiltered
                            ? t("effective_rows_limited")
                            : t("effective_rows_all")
                          : t("effective_rows_unavailable")}
                      </div>
                      <div>
                        {!item.read
                          ? t("effective_fields_unavailable")
                          : item.fieldsRestricted && item.fields !== "*"
                          ? t("effective_fields_limited", { fields: item.fields.join(", ") })
                          : t("effective_fields_all")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Surface>
        </>
      ) : null}
    </div>
  );
}
