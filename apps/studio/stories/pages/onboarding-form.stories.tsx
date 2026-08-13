import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// 🚨 実装をそのまま import する（コピーしない）。
import { OnboardingForm } from "@/components/admin/onboarding-form";

/**
 * 初回セットアップの入力欄。中に **ロゴのドロップ領域（FileDropzone）** が入る。
 *
 * 🚨 **この story は測るために置いてある。**
 * `/onboarding` は**セットアップが済むと `/admin` へ 307 で飛ぶ**ので、
 * 監査からは画面を描かせられない（2026-08-13 にオーナーが初回体験を済ませている）。
 * 設定行を消して未完了へ戻すことはできるが、**:3101 / :3103 と同じ DB** なので
 * オーナーの画面まで巻き込む。だからここで測る:
 *
 * ```
 * bun run --filter @ohmycms/studio storybook          # :3104
 * node scripts/audit-surface-depth.mjs --base http://localhost:3104 \
 *   --paths '/iframe.html?id=pages-onboardingform--default&viewMode=story'
 * ```
 *
 * 見たいのは 2 つ:
 * - **ロゴのドロップ領域が読み上げ名を持つか**（`labelledBy` が実在の id を指しているか）。
 *   🚨 `aria-labelledby` の**属性が付いていること**では足りない。
 *   settings で `htmlFor` が**存在しない id** を指していた事故と同じ形になる。
 *   監査はブラウザが計算した名前（AX ツリー）を見るので、宙に浮いた参照は空として出る。
 * - **面の深さが 1 を超えないか**（`/onboarding` は `Surface` を持たない作りなので、
 *   `Attachment` は 1 段目に収まるはず。ここは実測で確かめる）。
 *
 * 🚨 `stories/components/` に置かないこと。
 * `.storybook/check-stories.mjs` はあのディレクトリを `components/ui/` と 1 対 1 で照合するので、
 * `components/ui/onboarding-form.tsx` が無い以上「実装が無い story」として落ちる。
 *
 * Storybook には API サーバが無いので、ロゴを選んでも送信は失敗する。
 * **読み上げ名と面の深さを測るには関係ない**（ドロップ領域そのものは描かれる）。
 */
const meta = {
  title: "Pages/OnboardingForm",
  component: OnboardingForm,
  parameters: { layout: "padded" },
} satisfies Meta<typeof OnboardingForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { defaultProjectName: "OhMyCMS", usingDefaultPassword: true },
};
