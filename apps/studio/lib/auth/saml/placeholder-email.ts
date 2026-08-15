/**
 * メールを送ってこない IdP のために組み立てる、**器を埋めるためだけのアドレス**。
 *
 * `directus_users.email` は NOT NULL + unique なので、SAML で入った人にメールが無いと
 * 行を作れない。そこで衝突しない値を合成して入れている。**誰かの連絡先ではない。**
 *
 * 🚨 **なぜ独立したファイルなのか（文字列で書かないため）**
 *    作る側（`verify.ts`）と隠す側（`lib/admin/user-label.ts`）が**別の担当**なので、
 *    どちらかが `"saml.invalid"` と直接書くと、**綴りを変えた日にもう片方が黙って通す**。
 *    関数を通していれば、**検査が「この関数を通しているか」で名指しできる**。
 *
 * 🚨 **`lib/admin` から読まれる**ので、ここは何も import しない（DB も `next/*` も）。
 *    重い依存を足すと、隠す側が読めなくなって元の文字列比較へ戻る。
 *
 * 由来: 2026-08-15。`verify.ts` のコメントは「**利用者には見せない**」と書いていたが、
 * それを**守っているコードがどこにも無かった**（隠していたのは `local-admin@localhost` だけ）。
 * ＝ コメントが在ることは、守られていることではない。**名指しできる形にしたのがこのファイル。**
 */

/** 合成アドレスのドメイン。**実在しない TLD**（RFC 2606 の `.invalid`）を使う。 */
export const SAML_PLACEHOLDER_EMAIL_DOMAIN = "saml.invalid";

/**
 * 利用者 ID から合成アドレスを作る。
 *
 * 🚨 **IdP の識別子（NameID）は入れないこと**（入れると**画面へ出たときに IdP 側の
 *    識別子が漏れる**。誰かを特定したいときは `directus_users.external_identifier` 列を見る）。
 *
 * 🚨 **守り手: 無い。呼ぶ側が守る約束です。**
 *    以前ここには「引数が `userId` の1つだけで、NameID を渡す口が無い」と書いていたが、
 *    **2026-08-15 に実測して嘘だと分かった**——`userId` も `nameId` も `string` なので、
 *    `samlPlaceholderEmail(identity.nameId)` は**型検査を素通りする**
 *    （probe を `lib/` 内に置き、①わざと型エラーを入れてファイル名が tsc に出ることを確かめてから
 *      ②実際に書いて exit 0 / 該当エラー 0 件、を確認）。
 *    ＝ **守りは「引数の名前」で成立していた。名前は守り手ではない。**
 *    型で塞ぐなら branded type が要る（`randomUUID()` の戻りにも型が要るので波及が大きい）。
 *    **塞ぐまでは、ここに「守られている」と書かない。**
 */
export function samlPlaceholderEmail(userId: string): string {
  return `${userId}@${SAML_PLACEHOLDER_EMAIL_DOMAIN}`;
}

/**
 * そのアドレスが「器を埋めるための合成値」か。**画面へ出す前に必ずこれを通すこと。**
 *
 * 🚨 大文字小文字を無視する。DB や IdP を経由する間に化けても取りこぼさないため。
 * 🚨 `null` / 空文字は **false**（＝「合成値である」とは言わない）。
 *    **「無い」と「合成値である」は別の状態**なので、ここで混ぜない
 *    （混ぜると、呼び出し側が「隠すべきか」と「そもそも無いか」を区別できなくなる）。
 */
export function isSamlPlaceholderEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string" || email.length === 0) return false;
  return email.toLowerCase().endsWith(`@${SAML_PLACEHOLDER_EMAIL_DOMAIN}`);
}
