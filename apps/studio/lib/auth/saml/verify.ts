/**
 * SAML 応答の検証と、利用者への紐付け。**ACS の中身**。
 *
 * 🚨 契約 `AGENTS.md §3.6`: `next/*` を import しない。HTTP の入出力は route.ts が持つ。
 *
 * ── 何段の関門があるか（1つでも欠けると穴になる）──
 *   1. **署名検証**（ライブラリ。Assertion が IdP の鍵で署名されているか）
 *   2. **Audience**（自分宛か）           ← ライブラリ
 *   3. **有効期限**（NotOnOrAfter）        ← ライブラリ
 *   4. **InResponseTo**（自分が出した要求への応答か・付いていれば）← ライブラリ + DB
 *   5. **リプレイ**（同じ Assertion を2回使えない）← **ここでしかできない**
 *
 * 🚨 5 は署名検証では防げない。**正しい応答は何度でも署名検証を通る**。
 */

import { randomUUID } from "node:crypto";
import type { Profile } from "@node-saml/node-saml/lib/types";
import { db } from "@/lib/db/knex";
import { ApiError } from "@/lib/schema/errors";
import { createSamlClient, purgeExpiredSamlRecords, type SamlEndpoints } from "./client";
import { ATTRIBUTE_DEFAULTS, isSamlUsable, type SamlConfig } from "./config";

export type SamlIdentity = {
  /** IdP がこの人を指す識別子。🚨 **メールとは限らない**。 */
  nameId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  groups: string[];
};

/** 属性の値を文字列の配列にそろえる。IdP によって単数・配列・入れ子のどれでも来る。 */
function toStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(toStringList);
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  // xml2js が `{ _: "値" }` の形で返すことがある。
  if (typeof value === "object" && "_" in value) return toStringList((value as { _: unknown })._);
  return [];
}

/**
 * 属性を1つ取り出す。**利用者が設定した名前を先に見る**。
 * 設定が空のときだけ、主要 IdP の既定名を順に試す（`config.ts` の `ATTRIBUTE_DEFAULTS`）。
 */
function pickAttribute(profile: Profile, configured: string[], fallbacks: readonly string[]): string[] {
  const names = configured.length > 0 ? configured : fallbacks;
  for (const name of names) {
    const found = toStringList(profile[name]);
    if (found.length > 0) return found;
  }
  return [];
}

export function mapProfileToIdentity(profile: Profile, config: SamlConfig): SamlIdentity {
  const email = pickAttribute(profile, config.attributes.email, ATTRIBUTE_DEFAULTS.email)[0] ?? null;

  return {
    // 🚨 NameID をメールに読み替えない。**識別子は識別子として持つ**。
    nameId: profile.nameID,
    email: email ? email.toLowerCase() : null,
    firstName:
      pickAttribute(profile, config.attributes.firstName, ATTRIBUTE_DEFAULTS.firstName)[0] ?? null,
    lastName:
      pickAttribute(profile, config.attributes.lastName, ATTRIBUTE_DEFAULTS.lastName)[0] ?? null,
    groups: pickAttribute(profile, config.attributes.groups, ATTRIBUTE_DEFAULTS.groups),
  };
}

/**
 * この Assertion を「使用済み」として記録する。**2回目は必ず失敗する**。
 *
 * 🚨 「先に SELECT して無ければ INSERT」にしないこと。
 *    **同じ応答を2本同時に投げると両方が確認を通り、2つともログインが成立する**
 *    （`lib/schema/errors.ts` に同じ理由の記述がある）。主キーの衝突で弾く。
 */
async function consumeAssertion(assertionId: string, expiresAt: Date): Promise<void> {
  const inserted = await db("ohmycms_saml_assertions")
    .insert({ assertion_id: assertionId, expires_at: expiresAt })
    .onConflict("assertion_id")
    .ignore()
    .returning("assertion_id");

  if (inserted.length === 0) {
    throw new ApiError(401, "SAML_REPLAY", "この認証応答はすでに使われています");
  }
}

/**
 * リプレイ台帳の鍵になる **Assertion の ID** を取り出す。
 *
 * 🚨 `profile.ID` を当てにしない。**型では省略可、実測では常に `undefined`** だった
 *    （Keycloak 26 で確認。これを必須にしていたため、**正しい応答をすべて弾いていた**）。
 *
 * 🚨 取り出し元は**署名が掛かっている Assertion** に限る。
 *    Response 側の ID は署名の外にあり、**攻撃者が書き換えられる**ので、
 *    そこから取るとリプレイ検査が意味を失う（同じ応答の ID を変えるだけで通ってしまう）。
 */
function assertionId(profile: Profile): string | null {
  if (typeof profile.ID === "string" && profile.ID) return profile.ID;

  // 署名済み Assertion の構造体から取る（`getAssertion()` は検証を通った部分だけを返す）。
  const assertion = profile.getAssertion?.() as
    | { Assertion?: { $?: { ID?: unknown } } }
    | undefined;
  const fromObject = assertion?.Assertion?.$?.ID;
  if (typeof fromObject === "string" && fromObject) return fromObject;

  // 最後の手段。同じく署名済み Assertion の XML から読む。
  const xml = profile.getAssertionXml?.();
  const matched = typeof xml === "string" ? /\sID="([^"]+)"/.exec(xml) : null;
  return matched?.[1] ?? null;
}

/**
 * Assertion の有効期限を読む。台帳の掃除にしか使わないので、
 * 読めなければ短めの既定で埋める（**期限そのものの検証はライブラリが済ませている**）。
 */
function assertionExpiry(profile: Profile): Date {
  const raw = profile.sessionNotOnOrAfter ?? profile.notOnOrAfter;
  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

/**
 * IdP から届いた SAML 応答を検証して、身元を返す。
 * 🚨 **ここを通ったということは、署名・宛先・期限・リプレイのすべてを越えたということ**。
 */
export async function verifySamlResponse(
  samlResponse: string,
  config: SamlConfig,
  endpoints: SamlEndpoints,
): Promise<SamlIdentity> {
  if (!isSamlUsable(config)) {
    throw new ApiError(503, "SAML_NOT_CONFIGURED", "SSO が設定されていません");
  }

  const client = createSamlClient(config, endpoints);

  let profile: Profile | null;
  try {
    const result = await client.validatePostResponseAsync({ SAMLResponse: samlResponse });
    profile = result.profile;
  } catch (error) {
    // 🚨 ライブラリの文言をそのまま返さない（内部構造が漏れる）。
    //    原因は運用のためにサーバのログにだけ出す。**応答本文は含めない**（`AGENTS.md §3.7`）。
    console.warn("[saml] 応答の検証に失敗しました:", (error as Error).message);
    throw new ApiError(401, "SAML_INVALID_RESPONSE", "認証応答を確認できませんでした");
  }

  if (!profile) {
    throw new ApiError(401, "SAML_INVALID_RESPONSE", "認証応答を確認できませんでした");
  }

  // 🚨 リプレイ防止。ID が無い応答は**照合できない**ので受け取らない。
  const id = assertionId(profile);
  if (!id) {
    throw new ApiError(401, "SAML_INVALID_RESPONSE", "認証応答を確認できませんでした");
  }
  await consumeAssertion(id, assertionExpiry(profile));

  // ついでに古い記録を落とす（常駐プロセスを持たないため）。失敗してもログインは止めない。
  purgeExpiredSamlRecords().catch(() => {});

  return mapProfileToIdentity(profile, config);
}

type DirectusUserRow = {
  id: string;
  email: string;
  status: string;
};

/**
 * SAML の身元を利用者に紐付ける。
 *
 * 探す順:
 *   1. **同じ IdP の同じ NameID**（いちばん確か）
 *   2. **同じメールの既存利用者**（🔴 受入「同じメールで別人が増えない」）
 *   3. 見つからなければ作る
 *
 * 🚨 2 は「**IdP がそのメールの持ち主を確認している**」という前提に乗っている。
 *    SAML では IdP を管理者が明示的に設定するので前提は成り立つが、
 *    **IdP の設定を間違えると他人の口座に入れる**ということでもある。
 *    ここを外部の未検証な情報源（一般の OAuth 等）へ広げないこと。
 */
export async function upsertSamlUser(identity: SamlIdentity): Promise<DirectusUserRow> {
  const byNameId = await db<DirectusUserRow>("directus_users")
    .select("id", "email", "status")
    .where("provider", "saml")
    .where("external_identifier", identity.nameId)
    .first();

  if (byNameId) {
    await db("directus_users")
      .where("id", byNameId.id)
      .update({
        last_access: db.fn.now(),
        // 名前とメールは IdP が正。変わっていたら追随する。
        ...(identity.email ? { email: identity.email } : {}),
        ...(identity.firstName ? { first_name: identity.firstName } : {}),
        ...(identity.lastName ? { last_name: identity.lastName } : {}),
      });
    return byNameId;
  }

  if (identity.email) {
    const byEmail = await db<DirectusUserRow>("directus_users")
      .select("id", "email", "status")
      .whereRaw("lower(email) = ?", [identity.email])
      .first();

    if (byEmail) {
      // 既存の利用者に SAML を結びつける（**新しい行を作らない**）。
      await db("directus_users").where("id", byEmail.id).update({
        provider: "saml",
        external_identifier: identity.nameId,
        last_access: db.fn.now(),
      });
      return byEmail;
    }
  }

  const id = randomUUID();
  // 🚨 `directus_users.email` は NOT NULL + unique。メールを送らない IdP のために、
  //    NameID から衝突しない内部用のアドレスを組み立てる（`settings/service.ts` の
  //    LOCAL_ADMIN_EMAIL と同じ考え方。**利用者には見せない**）。
  const email = identity.email ?? `${id}@saml.invalid`;

  await db("directus_users").insert({
    id,
    first_name: identity.firstName,
    last_name: identity.lastName,
    email,
    // 🚨 パスワードは持たせない。SSO の利用者にパスワードの入口を作らない。
    password: null,
    status: "active",
    role: null,
    token: null,
    last_access: db.fn.now(),
    provider: "saml",
    external_identifier: identity.nameId,
    // 🚨 生の Assertion を残さない。groups は権限の判断に使うため名前だけ持つ。
    auth_data: { groups: identity.groups },
  });

  return { id, email, status: "active" };
}
