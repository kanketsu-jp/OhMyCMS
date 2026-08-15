import type { Preview } from "@storybook/nextjs-vite";
import { withThemeByClassName } from "@storybook/addon-themes";

import { I18nProvider } from "../i18n/client";
import { LOCALES, type Locale } from "../i18n/config";
import { messagesFor } from "../i18n/messages";
import {
  setAdminApiFixture,
  type AdminApiFixture,
} from "./mocks/admin-api";

// 本体とまったく同じスタイルシート。Tailwind v4 のテーマ変数(--background 等)と
// @layer base(body の bg/text)がここから来る。
// postcss.config.mjs の @tailwindcss/postcss を Vite が拾うので、
// Storybook 専用の Tailwind 設定は持たない = 本体とズレようがない。
import "../app/globals.css";

/**
 * 🚨 **書体は `globals.css` だけでは付かない**（2026-08-15 実測で発覚）。
 *
 * `--font-sans` は `app/globals.css` で
 * `var(--font-sans-latin), var(--font-sans-jp), system-ui, sans-serif` と定義されているが、
 * この 2 つの変数の実体は **`next/font` が `<html>` に付けるクラス**が持っている。
 * Storybook は `app/layout.tsx` を通らないので、**クラスが付かず変数が未定義**になり、
 * `--font-sans` の宣言ごと無効化されて **既定のセリフ体（Times）**で描かれていた。
 *
 * 実測（🟢 対照はアプリ側）:
 * ```
 * 直す前  Storybook html クラス **無し**  → 書体 Times
 *         アプリ    html クラス notosans…/notosansjp…/geistmono… → 違反なし
 * ```
 * 🚨 **ここに localFont を書き写さないこと。** 書き写すと、フォントを差し替えた日に
 *    Storybook だけ古い書体のまま黙ってズレる。**SoT は `app/fonts.ts` の 1 つだけ。**
 */
import { fontVariables } from "../app/fonts";

/** 環境変数から来るサービス名。ホワイトラベルの実体は .storybook/whitelabel.ts。 */
export const PROJECT_NAME = process.env.OHMYCMS_PROJECT_NAME || "OhMyCMS";

const preview: Preview = {
  parameters: {
    // 「アクション」パネルの自動検出。on* な props をログに出す。
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/ },
    },
    // 背景アドオンは切っている。ダーク/ライトは globals.css の `.dark` で切り替えるので、
    // 背景色を別途持つと本体と食い違う。
    backgrounds: { disable: true },
    // このアプリは全面 App Router。これが無いと next/navigation を使う
    // client component が "invariant expected app router to be mounted" で落ちる
    // (LocaleSwitcher が useRouter を使っている)。
    nextjs: { appDirectory: true },
    options: {
      // サイドバーの並び順を「コンポーネント → レイアウト → ページ」に固定する。
      storySort: {
        order: ["Components", "Layouts", "Pages"],
      },
    },
  },

  globalTypes: {
    locale: {
      description: "表示ロケール(i18n 辞書の切り替え)",
      toolbar: {
        icon: "globe",
        items: LOCALES.map((code) => ({ value: code, title: code })),
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: {
    locale: "ja" satisfies Locale,
  },

  decorators: [
    // layout / page の story が使う API スタブの返り値を、story の
    // parameters.adminApi から差し込む。story を切り替えるたびに上書きする。
    (Story, context) => {
      setAdminApiFixture(context.parameters.adminApi as AdminApiFixture);
      return <Story />;
    },

    // 本体の app/layout.tsx と同じ I18nProvider で包む。
    // 辞書も本体と同じ i18n/messages を読むので、辞書が増えれば story にも自動で載る。
    (Story, context) => {
      const locale = (context.globals.locale ?? "ja") as Locale;
      // layout / page の story は自前で画面全体の枠と背景を持つので、余白を足さない。
      const fullscreen = context.parameters.layout === "fullscreen";
      return (
        <I18nProvider locale={locale} messages={messagesFor(locale)}>
          {fullscreen ? (
            <Story />
          ) : (
            <div className="bg-background p-6 text-foreground">
              <Story />
            </div>
          )}
        </I18nProvider>
      );
    },

    // globals.css は `@custom-variant dark (&:is(.dark *))` なので、
    // 祖先に .dark が付いていれば dark: が効く。html に付ける。
    // 🚨 書体の variable クラスを `<html>` へ付ける（アプリの `app/layout.tsx` と同じ場所・同じ順）。
    //    デコレータではなく副作用で付けるのは、`withThemeByClassName` が同じ `<html>` の
    //    `className` を**置き換えではなく操作**するため、React の再描画と競合させないため。
    //    冪等（既に付いていれば何もしない）。
    (Story) => {
      if (typeof document !== "undefined") {
        for (const cls of fontVariables.split(" ").filter(Boolean)) {
          document.documentElement.classList.add(cls);
        }
      }
      return <Story />;
    },

    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),
  ],
};

export default preview;
