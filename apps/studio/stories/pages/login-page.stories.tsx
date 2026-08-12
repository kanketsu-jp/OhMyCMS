import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装(app/login/page.tsx)をそのまま import する。
//    ページの中身をここに書き写さない。ページが変われば story も変わる。
import LoginPage from "@/app/login/page";

/**
 * ログイン画面。async な Server Component だが、
 *  - `getT()` は next/headers の cookies()/headers() を使う → @storybook/nextjs-vite の mock が効く
 *  - DB にも API にも触らない
 * ので、main.ts の `features.experimentalRSC` を有効にすればそのまま描画できる。
 *
 * 表示される文言は i18n 辞書から来る。ここでは Server 側の getT が
 * mock された cookie を読むため、ツールバーの locale ではなく
 * 環境変数 OHMYCMS_DEFAULT_LOCALE の既定(ja)になる。
 */
const meta = {
  title: "Pages/Login",
  component: LoginPage,
  parameters: {
    layout: "fullscreen",
    // ページは自前で min-h-screen と背景を持つので、preview の余白を外す。
    docs: { story: { inline: false, height: "560px" } },
  },
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
