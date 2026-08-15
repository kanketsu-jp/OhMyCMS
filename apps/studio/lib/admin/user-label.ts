import type { MeResult } from "@/lib/admin/api";
import type { Locale } from "@/i18n/config";
import { LOCAL_ADMIN_EMAIL } from "@/lib/settings/local-admin";
import { isSamlPlaceholderEmail } from "@/lib/auth/saml/placeholder-email";

// アバターに何も無いときの既定の絵文字。
// 🚨 辞書に入れない: `components/admin/shortcuts.ts` の `MOD_SYMBOL` と同じ理由で、
// 記号は言語で変わらない（日本語版と英語版で違う絵文字にする理由が無い）。
const DEFAULT_AVATAR_EMOJI = "🙂";

function visibleHuman(me: MeResult | null): Extract<MeResult, { type: "human" }> | null {
  if (!me) return null;
  // エージェント（機械）は人のアカウント行に出さない。
  if (me.type !== "human") return null;
  if (me.email === LOCAL_ADMIN_EMAIL) return null;
  return me;
}

/**
 * 画面に出してよい「いま入っている人」の名前。出せないなら null。
 *
 * 🚨 **`local-admin@localhost` は利用者のメールアドレスではない。**
 * `lib/settings/service.ts` の説明（原文）:
 * > 「セッションの持ち主として内部専用の固定ユーザーを1人だけ持つ。
 * >   **利用者には一切見せない**（画面にもAPIレスポンスにも出さない）」
 * `directus_users.email` が NOT NULL なので**器を埋めるためだけに**入っている値で、
 * 誰かの連絡先ではない。これが画面に出ると、利用者は自分のアカウントだと誤解する。
 *
 * 🚨 **合成 ID は画面に出さない**（守り手: `displayUserLabel` / `isSamlPlaceholderEmail`）。
 * ここで塞ぐのは2種類の**合成 ID**——①起動用の固定ユーザー（`local-admin@localhost`）と、
 * ②メールを送らない IdP のために `verify.ts` が埋める `<uuid>@saml.invalid`（SAML placeholder）。
 * ②は本物の利用者だが、メールだけが器を埋めるための値なので、`displayUserLabel` だけで弾く
 * （`visibleHuman` には足さない。足すとその利用者のアカウント行が名前ごと丸ごと消える）。
 *
 * 🚨 **判定を呼び出し側に置かない。** 呼び出し側で弾く形にすると、
 * 次に `UserMenu` を置く人が必ず素の `me.data.email` を渡して、また漏れる
 * （実際に layout.tsx の2箇所へ同じ式が写されていた）。
 * **値が作られる場所で弾く**ので、ここを通らない限り画面へ出ない。
 *
 * 本物のログイン中の人が、自分のアカウントの行に自分のアドレスを見るのは正常。
 * 塞ぐのは**起動用の合成 ID と SAML の埋め草だけ**で、メールアドレス一般ではない。
 */
export function displayUserLabel(me: MeResult | null): string | null {
  const human = visibleHuman(me);
  return human && !isSamlPlaceholderEmail(human.email) ? human.email : null;
}

export function displayUserPicture(me: MeResult | null): string | null {
  return visibleHuman(me)?.picture ?? null;
}

/**
 * アバターに出す絵文字。SSO の画像が無いときの控え。
 *
 * 優先順位: SSO の画像（`displayUserPicture` が別途優先される）→ 利用者が選んだ絵文字 → 既定の絵文字。
 * 🚨 戻り値は必ず文字列。アバターは常に何かを出すため、null にしない。
 */
export function displayUserAvatarEmoji(me: MeResult | null): string {
  return visibleHuman(me)?.avatarEmoji ?? DEFAULT_AVATAR_EMOJI;
}

/**
 * 画面に出してよい表示名。姓名の結合はここ（表示側）でやる。
 *
 * 🚨 サーバ側（`/api/auth/me`）で1本の文字列にしない。並び順が言語で変わるため
 * （ja は 姓→名、それ以外は 名→姓）で、locale を知らないサーバでは直せない。
 *
 * 片方しか無ければその片方だけを返す（区切りが余らない）。両方無ければ null
 * （呼び出し側が辞書の控えを出す）。空白だけの値は無いものとして扱う。
 */
export function displayUserName(me: MeResult | null, locale: Locale): string | null {
  const human = visibleHuman(me);
  if (!human) return null;

  const first = human.firstName?.trim() || null;
  const last = human.lastName?.trim() || null;

  if (!first && !last) return null;
  if (!first) return last;
  if (!last) return first;

  return locale === "ja" ? `${last} ${first}` : `${first} ${last}`;
}
