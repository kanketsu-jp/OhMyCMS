import type { MeResult } from "@/lib/admin/api";
import { LOCAL_ADMIN_EMAIL } from "@/lib/settings/service";

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
 * 🚨 **判定を呼び出し側に置かない。** 呼び出し側で弾く形にすると、
 * 次に `UserMenu` を置く人が必ず素の `me.data.email` を渡して、また漏れる
 * （実際に layout.tsx の2箇所へ同じ式が写されていた）。
 * **値が作られる場所で弾く**ので、ここを通らない限り画面へ出ない。
 *
 * 本物のログイン中の人が、自分のアカウントの行に自分のアドレスを見るのは正常。
 * 塞ぐのは**起動用の合成 ID だけ**で、メールアドレス一般ではない。
 */
export function displayUserLabel(me: MeResult | null): string | null {
  if (!me) return null;
  // エージェント（機械）は人のアカウント行に出さない。
  if (me.type !== "human") return null;
  if (me.email === LOCAL_ADMIN_EMAIL) return null;
  return me.email;
}
