import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/nextjs-vite";

import { projectLogoUrl, projectName } from "./whitelabel.ts";

const name = projectName();
const logoUrl = projectLogoUrl();

/**
 * Storybook には API サーバも DB も無い。`app/(admin)/layout.tsx` などの
 * Server Component は描画のために自分自身の REST API を叩くので、その入口である
 * `lib/admin/api` **だけ**をスタブへ差し替える。
 * layout / page の実装そのものは本物を import しているので、
 * 「元が変われば Storybook でも変わる」は保たれる。
 * (alias ではなくプラグインにしているのは、上流が resolve.alias を
 *  配列/オブジェクトどちらの形で持つか保証が無いため)
 */
function adminApiStubPlugin() {
  const stub = fileURLToPath(new URL("./mocks/admin-api.ts", import.meta.url));
  return {
    name: "ohmycms:admin-api-stub",
    enforce: "pre" as const,
    resolveId(source: string) {
      return source === "@/lib/admin/api" ? stub : null;
    },
  };
}

const config: StorybookConfig = {
  // story は stories/ 配下だけに置く。実装(components/ app/)には story を混ぜない。
  // 実装ディレクトリはトラック C が同時に書き換えているため、こちらから触らない。
  stories: [
    "../stories/components/**/*.stories.@(ts|tsx)",
    "../stories/layouts/**/*.stories.@(ts|tsx)",
    "../stories/pages/**/*.stories.@(ts|tsx)",
  ],

  addons: [
    // props テーブルと自動ドキュメント。実装の型定義から生成されるので、
    // 実装が変われば docs も自動で変わる(F7 の要件そのもの)。
    "@storybook/addon-docs",
    // ダーク/ライト切替(globals.css の `.dark` クラスを html に付け外しする)。
    "@storybook/addon-themes",
    // アクセシビリティ検査。広告や通知ではなく開発用の実測ツールなので残している。
    "@storybook/addon-a11y",
  ],

  framework: {
    // Next.js 16 は Turbopack 既定で webpack を同梱していない。
    // @storybook/nextjs は peerDependencies に webpack ^5.0.0 を要求するため、
    // 本体が使っていないバンドラを devDependencies に増やすことになる。
    // nextjs-vite なら vite だけで済み、postcss.config.mjs 経由で
    // 本体と同じ @tailwindcss/postcss がそのまま効く。
    name: "@storybook/nextjs-vite",
    options: {},
  },

  // ── ホワイトラベル化: ポップアップ・通知・テレメトリを全部止める ──
  core: {
    // 使用状況を storybook.js.org へ送るテレメトリ。
    disableTelemetry: true,
    // クラッシュレポート送信(既定 false だが、明示して意図を残す)。
    enableCrashReports: false,
    // 「What's New」= 新バージョン告知パネル。
    disableWhatsNewNotifications: true,
    // Storybook メタデータ(project.json)の生成。テレメトリの材料になる。
    disableProjectJson: true,
  },

  // preview(story を描画する iframe)側へ環境変数を渡す。
  // Next.js と違い NEXT_PUBLIC_ 接頭辞は不要で、ここに列挙したものだけが露出する。
  env: (existing) => ({
    ...existing,
    OHMYCMS_PROJECT_NAME: name,
    OHMYCMS_PROJECT_LOGO_URL: logoUrl,
  }),

  // manager(サイドバー等の外枠)は preview と別バンドルで `env` が効かない。
  // head へ直接書き出して manager.ts から読ませる。
  managerHead: (head) =>
    `${head}
<script>
  window.__OHMYCMS_PROJECT_NAME__ = ${JSON.stringify(name)};
  window.__OHMYCMS_PROJECT_LOGO_URL__ = ${JSON.stringify(logoUrl)};
</script>`,

  // public/ の中身を静的配信する(本体と同じ相対パスで参照できるようにする)。
  staticDirs: ["../public"],

  // 🚨 秘密を Storybook のバンドルへ持ち込まない(AGENTS.md §3.7)。
  // Vite は既定で root(apps/studio)の .env* を読み、変更を watch する。
  // apps/studio には .env.local(DATABASE_URL / AUTH_SECRET / GOOGLE_CLIENT_SECRET)があるので、
  //   - envDir を .storybook/ に向けて .env.local を読ませない
  //   - envPrefix を OHMYCMS_PUBLIC_ に絞り、万一読めても公開用しか露出しないようにする
  // 二重に塞いでいる。Storybook 側の環境変数は上の `env` 経由で明示的に渡す。
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    // Vite は envDir を root(= apps/studio)からの相対で解決する。
    envDir: ".storybook",
    envPrefix: "OHMYCMS_PUBLIC_",
    plugins: [...(viteConfig.plugins ?? []), adminApiStubPlugin()],
  }),

  features: {
    // async な Server Component をそのまま story にできるようにする。
    // これが無いと app/**/page.tsx (async 関数コンポーネント)は描画できない。
    experimentalRSC: true,

    // ── ホワイトラベル化: 販促・オンボーディングの導線を消す ──
    // サイドバー左下の「Level up」ウィジェット(#storybook-checklist-widget)。
    // 「Install Vitest addon」等の追加インストールを促す UI はここから出ている。
    sidebarOnboardingChecklist: false,
    // メニュー内の「オンボーディングガイド」項目。
    menuOnboardingChecklist: false,

    // 背景アドオンは使わない(ダーク/ライトは globals.css の .dark で切り替える)。
    // ツールバーから項目を1つ減らして、本体と食い違う設定を持たせない。
    backgrounds: false,
  },

  typescript: {
    // props テーブルの生成器。react-docgen-typescript は型を追えるが遅いので、
    // 既定の react-docgen(高速)のままにしている。
    reactDocgen: "react-docgen",
  },
};

export default config;
