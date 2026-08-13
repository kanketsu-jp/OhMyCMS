import { ErrorBanner } from "@/components/admin/error-banner";
import { UsersPolicyManager } from "@/components/admin/users-policy-manager";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
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

export default async function UsersPage() {
  const t = await getT("users");
  const [usersResult, policiesResult, accessResult] = await Promise.all([
    apiFetch<{ data: UserRow[] }>("/api/users"),
    apiFetch<{ data: PolicyRow[] }>("/api/policies"),
    apiFetch<{ data: AccessRow[] }>("/api/access"),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ErrorBanner
        message={
          (!usersResult.ok ? usersResult.message : null) ??
          (!policiesResult.ok ? policiesResult.message : null) ??
          (!accessResult.ok ? accessResult.message : null)
        }
      />
      <Surface>
        <SurfaceTitle>{t("assignment_card_title")}</SurfaceTitle>
        {usersResult.ok && policiesResult.ok && accessResult.ok ? (
          <UsersPolicyManager
            users={usersResult.data.data}
            policies={policiesResult.data.data}
            access={accessResult.data.data}
          />
        ) : null}
      </Surface>
    </div>
  );
}
