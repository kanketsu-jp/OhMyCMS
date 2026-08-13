import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans, Noto_Sans_JP } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { getLocale, getT } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { projectName } from "@/lib/settings/project-name";
import "./globals.css";

// 🚨 英数字と日本語を「同じ設計の兄弟」で混植する。
// Geist は英字専用で、日本語は OS のフォールバックに落ちる（= 環境ごとに字面が変わる）。
// 並び順は **英数字を先、日本語を後**。ブラウザは前から字を探すので、英数字が Noto Sans で出る。
const notoSans = Noto_Sans({
  variable: "--font-sans-latin",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${notoSans.variable} ${notoSansJP.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
