import { ErrorBanner } from "@/components/admin/error-banner";
import { DetailFields } from "@/components/admin/detail-fields";
import { ParentBackLink } from "@/components/admin/parent-back-link";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

/**
 * 役割の **1 件**のページ。
 *
 * 🚨 **なぜ作ったか**（`decisions/list-views-are-switchable-layouts` §3）:
 *    各領域は「**一覧 / 1 件 / 新規**」の 3 つに揃える、と決めた。
 *    【測った・2026-08-17】`settings/roles` は **一覧しか無く**、
 *    一覧の中に編集も無かった（`form` / `Dialog` / `Sheet` が **0 件**）。
 *    ＝ **役割を作れるのに、開いて確かめる場所が無い**状態だった。
 *
 * 🚨 **ここでは編集しない。** いまは「**何が在るか**」を見せるだけにしてある。
 *    理由: **役割に何を紐づけるか（方針・利用者）が未決**（board の判断待ち）で、
 *    先に編集を付けると **決まる前の形が既成事実になる**。
 *    ＝ **開けるようにするのと、変えられるようにするのは別の段**。
 */

type Props = {
  params: Promise<{ id: string }>;
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  parent: string | null;
};

export default async function RoleDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getT("roles");
  const tError = await getT("errors");

  const result = await apiFetch<{ data: RoleRow }>(`/api/roles/${id}`);
  const role = result.ok ? result.data.data : null;

  return (
    <div className="max-w-5xl space-y-6">
      {/* 🚨 戻る導線を必ず置く（`policies/[id]` と同じ形）。 */}
      <ParentBackLink href="/admin/settings/roles">{t("back_to_list")}</ParentBackLink>
      <ErrorBanner message={!result.ok ? tError(result.messageKey) : null} />
      {role ? (
        <Surface>
          <SurfaceTitle>{role.name}</SurfaceTitle>
          <DetailFields
            fields={[
              { label: t("name_label"), value: role.name },
              { label: t("description_label"), value: role.description ?? t("no_description") },
              { label: t("parent_label"), value: role.parent ?? t("none_option") },
            ]}
          />
          {/* 🚨 **できないことを、その場に書く。** 編集の場所を探させない。 */}
        <p className="mt-4 text-base text-muted-foreground">{t("detail_read_only_note")}</p>
        </Surface>
      ) : null}
    </div>
  );
}
