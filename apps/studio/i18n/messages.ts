/**
 * 辞書の実体。server / client の両方から参照する。
 * 動的 import にせず静的 import にしているのは、Turbopack でのチャンク分割を
 * 予測可能にするため（辞書は小さいので分割の利得より確実性を取る）。
 */

import type { Locale } from "./config";
import type { Messages } from "./translator";
import en from "./messages/en.json";
import ja from "./messages/ja.json";

export const DICTIONARIES: Record<Locale, Messages> = {
  ja: ja as Messages,
  en: en as Messages,
};

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
