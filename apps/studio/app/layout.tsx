import type { Metadata } from "next";
import { Suspense } from "react";
import { I18nProvider } from "@/i18n/client";
import { Toaster } from "@/components/ui/toast";
import { QueryNoticeToast } from "@/components/ui/query-notice-toast";
import { getLocale, getT } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { projectName } from "@/lib/settings/project-name";
import { fontVariables } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("common");
  return {
    title: await projectName(t("app_name")),
    description: t("app_description"),
    // 🚨 管理画面なので検索結果に出さない。
    //    これは HTML を解釈したときにしか効かないので、**ヘッダ側（proxy.ts）と二重**にしている
    //    （API の JSON・アップロードしたファイル・リダイレクトにはメタタグが付かない）。
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale resolution order: cookie -> Accept-Language -> env default. See i18n/server.ts.
  const locale = await getLocale();
  const messages = messagesFor(locale);

  return (
    <html
      lang={locale}
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} messages={messages}>
          {children}
          {/* 🚨 通知はページの中に埋め込まず、ここに1つだけ置いたトーストへ集める
              （堀池 2026-08-15「いまは『保存しました』などがページのなかやセクションに
              埋め込まれているが、廃止する。ルールとしてそれはしない」）。
              (admin) ではなくルートに置くのは、/login にも通知が出るため。 */}
          <Toaster />
          {/* useSearchParams を使うので Suspense が要る（Next.js の要件）。
              中身は描画しない部品なので、fallback は無しでよい。 */}
          <Suspense fallback={null}>
            <QueryNoticeToast />
          </Suspense>
        </I18nProvider>
      </body>
    </html>
  );
}
