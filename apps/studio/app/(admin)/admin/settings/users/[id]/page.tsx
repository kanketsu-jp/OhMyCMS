import Link from "next/link";

import { ErrorBanner } from "@/components/admin/error-banner";
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
  last_access: string | null;
  provider: string | null;
  external_identifier: string | null;
};

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getT("users");
  const tError = await getT("errors");
  const format = await getFormat();

  const result = await apiFetch<{ data: UserRow }>(`/api/users/${id}`);
  const user = result.ok ? result.data.data : null;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link
          href="/admin/settings/users"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("back_to_list")}
        </Link>
      </div>
      <ErrorBanner message={!result.ok ? tError(result.messageKey) : null} />
      {user ? (
        <Surface>
          {/* 🚨 名前が無い人が居る（SSO で来ると空のことが在る）。**メールを見出しにする**——
              **必ず在るもの**を見出しにしないと、見出しが空の画面ができる。 */}
          <SurfaceTitle>{user.email}</SurfaceTitle>
          <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">{t("name_label")}</dt>
            {/* 🚨 空を空白で出さない。「無い」と書く。 */}
            <dd>{name === "" ? t("no_name") : name}</dd>
            <dt className="text-muted-foreground">{t("status_label")}</dt>
            <dd>{user.status}</dd>
            <dt className="text-muted-foreground">{t("provider_label")}</dt>
            {/* 🚨 `provider` は「どの入口から入った人か」。空なら「不明」ではなく「未設定」。
                **測っていないことと、値が無いことを混ぜない**。 */}
            <dd>{user.provider ?? t("no_provider")}</dd>
            <dt className="text-muted-foreground">{t("last_access_label")}</dt>
            <dd>
              {user.last_access === null
                ? t("never_accessed")
                : format.dateTime(new Date(user.last_access))}
            </dd>
          </dl>
          {/* 🚨 **できないことを、その場に書く。** 編集の場所を探させない。 */}
          <p className="mt-4 text-sm text-muted-foreground">{t("detail_read_only_note")}</p>
        </Surface>
      ) : null}
    </div>
  );
}
