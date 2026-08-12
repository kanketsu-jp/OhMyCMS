import Link from "next/link";
import { DevLoginForm } from "@/components/admin/dev-login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>AI-native CMS</CardTitle>
          <CardDescription>管理画面にログインしてください。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Link
            href="/api/auth/google"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Google でログイン
          </Link>
          <div className="space-y-2 border-t pt-5">
            <p className="text-sm font-medium">開発用ログイン</p>
            <DevLoginForm />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
