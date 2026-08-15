/**
 * 利用者がアバターに選べる絵文字の一覧。**唯一の定義**。
 *
 * 🚨 **画面（`avatar-emoji-picker.tsx`）と API（`app/api/auth/me/route.ts`）の両方が
 * この1本を参照する。** 片方に配列を写経しない（写経すると、片方だけ足して
 * もう片方は弾く、が必ず起きる）。
 *
 * 🚨 **辞書に入れない。** `components/admin/shortcuts.ts` の `MOD_SYMBOL` と同じ理由で、
 * 絵文字は言語で変わらない（日本語版と英語版で違う絵文字にする理由が無い）。
 *
 * 顔・動物・ものをまんべんなく24個。既定の 🙂（`lib/admin/user-label.ts` の
 * `DEFAULT_AVATAR_EMOJI`）を必ず含める。
 *
 * 🚨 **合成絵文字（ZWJ で複数コードポイントを繋いだもの）を数個含めること。**
 * `🧑‍💻` `👩‍💻` `👨‍🍳` `🐻‍❄️` の4個がそれ。短い列（例えば絵文字が1コードポイントしか
 * 無い前提の実装）に戻されると、これらだけ描画・比較が壊れることで気づけるようにしてある。
 */
export const AVATAR_EMOJIS = [
  // 顔
  "🙂",
  "😀",
  "😎",
  "🥲",
  "🤔",
  "😴",
  // 人（うち2個は合成絵文字）
  "🧑‍💻",
  "👩‍💻",
  "👨‍🍳",
  "🧙",
  "🥷",
  "🦸",
  // 動物（うち1個は合成絵文字）
  "🐱",
  "🐶",
  "🦊",
  "🐼",
  "🦉",
  "🐻‍❄️",
  // もの
  "🚀",
  "🌱",
  "🔥",
  "⚡",
  "🎧",
  "☕",
] as const;

export type AvatarEmoji = (typeof AVATAR_EMOJIS)[number];

/** `value` が一覧に載っている絵文字かどうか。サーバ側の検証で使う。 */
export function isAvatarEmoji(value: unknown): value is AvatarEmoji {
  return typeof value === "string" && (AVATAR_EMOJIS as readonly string[]).includes(value);
}
