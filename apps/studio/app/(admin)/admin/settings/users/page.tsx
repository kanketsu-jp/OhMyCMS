import { ErrorBanner } from "@/components/admin/error-banner";
import { UsersPolicyManager } from "@/components/admin/users-policy-manager";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { ListPagination } from "@/components/admin/list-pagination";
import {
  PAGE_SIZE,
  currentPage,
  pageHref,
  splitPage,
} from "@/components/admin/pagination-href";
import { getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  role: string | null;
};

type PolicyRow = {
  id: string;
  name: string;
};

type AccessRow = {
  id: string;
  role: string | null;
  user: string | null;
  policy: string;
  user_email?: string | null;
  role_name?: string | null;
  policy_name?: string | null;
};

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function UsersPage({ searchParams }: Props) {
  const t = await getT("users");
  const tError = await getT("errors");
  const query = await searchParams;
  const page = currentPage(query.page);

  // 🚨 ページを送るのは**割り当ての一覧（access）だけ**。
  // users と policies は「誰に / どのポリシーを」を選ぶプルダウンの中身なので、
  // ページで切ると**選べない相手が出る**。ここは既定の上限（100件）に任せる。
  // 件数が増えたら、プルダウンを検索つき（@shadcn/combobox）に替えるのが筋で、
  // ページ送りで切るのは筋が悪い。
  const accessParams = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String((page - 1) * PAGE_SIZE),
  });
  const [usersResult, policiesResult, accessResult] = await Promise.all([
    apiFetch<{ data: UserRow[] }>("/api/users"),
    apiFetch<{ data: PolicyRow[] }>("/api/policies"),
    apiFetch<{ data: AccessRow[] }>(`/api/access?${accessParams.toString()}`),
  ]);
  const { rows: access, hasNext } = splitPage(
    accessResult.ok ? accessResult.data.data : [],
    PAGE_SIZE,
  );

  return (
    <div className="max-w-6xl space-y-6">
      <ErrorBanner
        message={
          (!usersResult.ok ? tError(usersResult.messageKey) : null) ??
          (!policiesResult.ok ? tError(policiesResult.messageKey) : null) ??
          (!accessResult.ok ? tError(accessResult.messageKey) : null)
        }
      />
      <Surface>
        <SurfaceTitle>{t("assignment_card_title")}</SurfaceTitle>
        {usersResult.ok && policiesResult.ok && accessResult.ok ? (
          <UsersPolicyManager
            users={usersResult.data.data}
            policies={policiesResult.data.data}
            access={access}
          />
        ) : null}
        {accessResult.ok ? (
          <ListPagination
            page={page}
            hasNext={hasNext}
            prevHref={page > 1 ? pageHref("/admin/settings/users", query, page - 1) : null}
            nextHref={hasNext ? pageHref("/admin/settings/users", query, page + 1) : null}
          />
        ) : null}
      </Surface>
    </div>
  );
}
