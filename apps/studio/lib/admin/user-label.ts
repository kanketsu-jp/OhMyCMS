import type { MeResult } from "@/lib/admin/api";
import type { Locale } from "@/i18n/config";
import { LOCAL_ADMIN_EMAIL } from "@/lib/settings/local-admin";
import { isSamlPlaceholderEmail } from "@/lib/auth/saml/placeholder-email";

/**
 * 画面に出してよい「人」だけを通す。出せないなら null。
 *
 * 🚨 **`localAdminUserId` は必須の引数にしてある**（省略可にしない）。
 * 省略できると、次に呼ぶ人が渡し忘れたところで**黙って隠れなくなる**
 * （型で落ちないので、誰も気づかない）。**渡し忘れはコンパイルで止める。**
 *
 * 🚨 **id と メール の両方で弾く（OR）。片方に倒さない。**
 *   ・**id** … メールを変えられても隠せる（**本来の守り**。
 *     `knowledge/decisions/guards-keyed-by-name-break-silently.md`）
 *   ・**メール** … `ohmycms_settings.local_admin_user_id` がまだ空の環境でも隠せる
 *     （移行前・移行が埋められなかった環境。**id だけにすると、そこで漏れる**）
 * どちらか一方でも当たれば隠すので、**OR は判定を狭めない**。
 */
function visibleHuman(
  me: MeResult | null,
  localAdminUserId: string | null,
): Extract<MeResult, { type: "human" }> | null {
  if (!me) return null;
  // エージェント（機械）は人のアカウント行に出さない。
  if (me.type !== "human") return null;
  if (localAdminUserId !== null && me.userId === localAdminUserId) return null;
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
export function displayUserLabel(
  me: MeResult | null,
  localAdminUserId: string | null,
): string | null {
  const human = visibleHuman(me, localAdminUserId);
  return human && !isSamlPlaceholderEmail(human.email) ? human.email : null;
}

export function displayUserPicture(
  me: MeResult | null,
  localAdminUserId: string | null,
): string | null {
  return visibleHuman(me, localAdminUserId)?.picture ?? null;
}

/**
 * 利用者が選んだアバター絵文字。未選択なら表示側で identicon に落とす。
 *
 * SSO の画像は表示側で優先し、絵文字も未選択なら表示側で identicon に落とす。
 */
export function displayUserAvatarEmoji(
  me: MeResult | null,
  localAdminUserId: string | null,
): string | null {
  return visibleHuman(me, localAdminUserId)?.avatarEmoji ?? null;
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
export function displayUserName(
  me: MeResult | null,
  locale: Locale,
  localAdminUserId: string | null,
): string | null {
  const human = visibleHuman(me, localAdminUserId);
  if (!human) return null;

  const first = human.firstName?.trim() || null;
  const last = human.lastName?.trim() || null;

  if (!first && !last) return null;
  if (!first) return last;
  if (!last) return first;

  return locale === "ja" ? `${last} ${first}` : `${first} ${last}`;
}
