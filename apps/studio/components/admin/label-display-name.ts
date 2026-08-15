import type { Translator } from "@/i18n/translator";

/**
 * ラベルの表示名。
 *
 * 🚨 **システムラベルの名前は、この CMS が種まきした日本語のリテラル**で
 *    （`20260815010000_create_labels_and_folder_color.ts`）、
 *    **英語で見ている人にも日本語のまま出ていた**（2026-08-15 に `--locale en` で実測）。
 *    `AGENTS.md §3.8`「UI に文言を直接書かない」に反していたが、
 *    🚨 **`check-i18n-hardcoded.mjs` は migrations を見ていない**ので誰も気づかなかった。
 *
 * 🚨 **利用者が作ったラベルの名前は訳さない**（それは利用者のデータ）。
 *    訳すのは**こちらが種まきしたもの**だけ。
 *
 * 🚨 **これは注意書きであって、守りではありません**（2026-08-15 実測。
 *    組み立てた形にしても `check-i18n-usage` / `check-i18n-keys` は通る）。
 *    **検査は当てにできません。** 分岐で丸ごと書く理由は下記のとおりです。
 *
 * 🚨 **辞書のキーを組み立てないこと**（`t(\`system_${key}\`)` にしない）。
 *    `check-i18n-usage` は**書かれた文字列を見て**突き合わせるので、
 *    組み立てたキーは追えず、ja と en の両方から消しても誰も気づかない。
 *    ここは分岐で丸ごと書く（`labels-manager.tsx` の色と同じ作法）。
 *
 * @param t `labels` 名前空間の翻訳（`useT("labels")` / `getT("labels")`）
 */
export function labelDisplayName(
  t: Translator,
  label: { name: string; is_system: boolean; system_key?: string | null },
): string {
  if (!label.is_system) return label.name;
  switch (label.system_key) {
    case "imported":
      return t("system_imported");
    case "source_missing":
      return t("system_source_missing");
    case "unreadable":
      return t("system_unreadable");
    default:
      // 🚨 知らないシステムラベルは、**保存されている名前をそのまま出す**。
      //    ここで空文字や「不明」を出すと、**増やした人が気づけない**。
      return label.name;
  }
}
