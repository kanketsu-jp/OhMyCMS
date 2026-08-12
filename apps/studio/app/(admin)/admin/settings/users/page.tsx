import { ErrorBanner } from "@/components/admin/error-banner";
import { UsersPolicyManager } from "@/components/admin/users-policy-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [usersResult, policiesResult, accessResult] = await Promise.all([
    apiFetch<{ data: UserRow[] }>("/api/users"),
    apiFetch<{ data: PolicyRow[] }>("/api/policies"),
    apiFetch<{ data: AccessRow[] }>("/api/access"),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ユーザー</h1>
        <p className="mt-1 text-sm text-muted-foreground">ユーザーへのポリシー割り当てを管理します。</p>
      </div>
      <ErrorBanner
        message={
          (!usersResult.ok ? usersResult.message : null) ??
          (!policiesResult.ok ? policiesResult.message : null) ??
          (!accessResult.ok ? accessResult.message : null)
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>ポリシー割り当て</CardTitle>
        </CardHeader>
        <CardContent>
          {usersResult.ok && policiesResult.ok && accessResult.ok ? (
            <UsersPolicyManager
              users={usersResult.data.data}
              policies={policiesResult.data.data}
              access={accessResult.data.data}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
