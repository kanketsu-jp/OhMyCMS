import { NextResponse } from "next/server";

/**
 * 検索エンジンへの登録を全応答で拒否する。
 *
 * この CMS は**管理画面**であって、公開されるサイトではない。
 * 検索結果に出ると、ログイン画面や初期設定の入口が**探せる状態**になる。
 *
 * 🚨 **`app/layout.tsx` の `robots` メタデータだけでは足りない。**
 *    メタタグは **HTML を解釈したときにしか効かない**ので、
 *    `/api/**` の JSON・アップロードしたファイル・リダイレクトの応答には付かない。
 *    ヘッダなら**全部の応答**に付く。**両方入れて二重にする。**
 *
 * 🚨 ここは **UX のための早期分岐だけ**に使う。**認可の判断を置かないこと**
 *    （`AGENTS.md §3.5` / `~/.claude/rules/auth-session-jwt-cookie.md`。
 *    matcher の漏れ・rewrite・API の直叩きで簡単に素通りする）。
 *    実際の認可は Server Component と route handler が持っている。
 *
 * 🚨 ファイル名は **`proxy.ts`**。`middleware.ts` は Next.js 16 で改称され、
 *    新規に作らないと決めている（`AGENTS.md §3.2`）。
 */
export function proxy() {
  const response = NextResponse.next();
  // noindex   … 検索結果に出さない
  // nofollow  … このページから辿ったリンクも追わせない
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // 🚨 除外しない。**API もアップロードしたファイルも対象**にする
  //    （公開したくないのは画面だけではない）。
  //    Next.js の内部アセット（_next/static など）だけ外す。
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
