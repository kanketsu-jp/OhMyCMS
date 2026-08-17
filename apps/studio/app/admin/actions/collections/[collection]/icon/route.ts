import { NextResponse } from "next/server";
import { apiErrorKey, formString, redirectWithMessage } from "@/lib/admin/forms";
import { internalOrigin, publicBaseUrl } from "@/lib/auth/urls";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ collection: string }>;
};

/**
 * コレクションのアイコンを選ぶ（K2・堀池さん 2026-08-17）。
 *
 * 🚨 **隣の `translations/route.ts` と同じ形**にしてある（同じ画面の中の別のフォームなので、
 *    片方だけ違う書き方にすると次に触る人が両方読む羽目になる）。
 *
 * 🚨 **値の検証はここでしない。** `PATCH /api/collections/:name` の中で
 *    `isCollectionIcon` が弾く（`lib/schema/service.ts`）。
 *    ここで先に弾くと**検証が 2 箇所**になり、片方だけ直したときに割れる。
 *    ＝ ここは「フォームの値を API の形に写す」だけ。
 */
export async function POST(request: Request, ctx: Context) {
  const { collection } = await ctx.params;
  const formData = await request.formData();
  // 🚨 空文字は「選んでいない」＝ `null`。**空文字のまま送らない**——
  //    列に空文字が入ると、画面は既定へ落として**黙って直る**ので、
  //    「保存できたのに反映されない」が起きる。
  const icon = formString(formData, "icon") || null;

  const response = await fetch(
    new URL(`/api/collections/${encodeURIComponent(collection)}`, internalOrigin(request)),
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ meta: { icon } }),
      cache: "no-store",
    },
  );

  const path = `/admin/collections/${encodeURIComponent(collection)}`;
  if (!response.ok) {
    return redirectWithMessage(request, path, "error", await apiErrorKey(response));
  }

  return NextResponse.redirect(new URL(path, publicBaseUrl(request)), { status: 303 });
}
