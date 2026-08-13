/**
 * SP（このアプリ）のメタデータ XML。**IdP へ渡すのはこれ 1 枚**。
 *
 * 利用者の運用はこうなる:
 *   1. この URL（`/api/auth/saml/metadata`）を IdP の管理画面に貼る（または XML を保存して読み込ませる）
 *   2. IdP 側が SSO URL / Entity ID / 証明書を返してくるので、OhMyCMS の設定画面に入れる
 *
 * 🚨 **設定が未入力でも返せること**が要件。
 *    IdP を設定する**前に**渡すものなので、IdP 側の情報に依存してはいけない。
 *
 * 仕様: OASIS「Metadata for the OASIS SAML V2.0」§2.4.4 SPSSODescriptor。
 */

import type { SamlConfig } from "./config";

/** XML のテキスト・属性値へ入れる前に必ず通す。 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 受け入れる NameID の形式。
 *
 * 🚨 **`emailAddress` を単独で要求しない**（`auth-methods.md`「NameID をメールに固定しない」）。
 *    `unspecified` を先頭に置くことで、IdP に「何でも送ってよい」と伝える。
 *    メールは NameID ではなく**属性**から取る（`config.ts` の `ATTRIBUTE_DEFAULTS`）。
 */
const NAME_ID_FORMATS = [
  "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
  "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
  "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
  "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
];

export type SpMetadataInput = {
  /** SP の Entity ID。設定に無ければメタデータの URL を使う。 */
  entityId: string;
  /** SAML 応答の受け口。 */
  acsUrl: string;
};

export function spMetadataInput(
  config: Pick<SamlConfig, "spEntityId">,
  urls: { metadataUrl: string; acsUrl: string },
): SpMetadataInput {
  return {
    entityId: config.spEntityId?.trim() || urls.metadataUrl,
    acsUrl: urls.acsUrl,
  };
}

export function buildSpMetadata(input: SpMetadataInput): string {
  const formats = NAME_ID_FORMATS.map(
    (format) => `    <md:NameIDFormat>${escapeXml(format)}</md:NameIDFormat>`,
  ).join("\n");

  // AuthnRequestsSigned="false":
  //   v1 では SP の秘密鍵を持たないので AuthnRequest に署名しない（config.ts の方針）。
  // WantAssertionsSigned="true":
  //   🚨 **署名されていない Assertion は受け取らない**という宣言。実際の拒否は ACS 側で行う
  //      （宣言だけでは何も守られない。IdP がこれを無視することがある）。
  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escapeXml(input.entityId)}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
${formats}
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${escapeXml(input.acsUrl)}" index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>
`;
}
