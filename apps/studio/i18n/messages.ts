/**
 * 辞書の実体。server / client の両方から参照する。
 *
 * 🚨 **辞書は名前空間ごとに1ファイル**にしてある（`messages/<locale>/<namespace>.json`）。
 * 1つの巨大な JSON にすると、複数の作業者が同時に文言を足したときに
 * 同じファイルを書き合って片方の変更が消える。名前空間で割っておけば衝突面が無くなる。
 *
 * **新しい名前空間を足すとき**は ja / en の両方に JSON を作り、下の import と
 * DICTIONARIES に1行ずつ足す。既存の名前空間へキストを足すだけならこのファイルは触らない。
 * （F2 で使う名前空間は先に空ファイルを用意してあるので、当面ここを編集する必要はない）
 *
 * 動的 import にせず静的 import にしているのは、Turbopack でのチャンク分割を
 * 予測可能にするため。辞書は小さいので分割の利得より確実性を取る。
 */

import type { Locale } from "./config";
import type { Messages } from "./translator";

import enAgents from "./messages/en/agents.json";
import enAuth from "./messages/en/auth.json";
import enCollections from "./messages/en/collections.json";
import enCommon from "./messages/en/common.json";
import enErrors from "./messages/en/errors.json";
import enFields from "./messages/en/fields.json";
import enFiles from "./messages/en/files.json";
import enFolders from "./messages/en/folders.json";
import enItems from "./messages/en/items.json";
import enNav from "./messages/en/nav.json";
import enNotifications from "./messages/en/notifications.json";
import enOnboarding from "./messages/en/onboarding.json";
import enPolicies from "./messages/en/policies.json";
import enRelations from "./messages/en/relations.json";
import enReports from "./messages/en/reports.json";
import enRichtext from "./messages/en/richtext.json";
import enRoles from "./messages/en/roles.json";
import enSearch from "./messages/en/search.json";
import enSettings from "./messages/en/settings.json";
import enSso from "./messages/en/sso.json";
import enUsers from "./messages/en/users.json";
import enVersion from "./messages/en/version.json";

import jaAgents from "./messages/ja/agents.json";
import jaAuth from "./messages/ja/auth.json";
import jaCollections from "./messages/ja/collections.json";
import jaCommon from "./messages/ja/common.json";
import jaErrors from "./messages/ja/errors.json";
import jaFields from "./messages/ja/fields.json";
import jaFiles from "./messages/ja/files.json";
import jaFolders from "./messages/ja/folders.json";
import jaItems from "./messages/ja/items.json";
import jaNav from "./messages/ja/nav.json";
import jaNotifications from "./messages/ja/notifications.json";
import jaOnboarding from "./messages/ja/onboarding.json";
import jaPolicies from "./messages/ja/policies.json";
import jaRelations from "./messages/ja/relations.json";
import jaReports from "./messages/ja/reports.json";
import jaRichtext from "./messages/ja/richtext.json";
import jaRoles from "./messages/ja/roles.json";
import jaSearch from "./messages/ja/search.json";
import jaSettings from "./messages/ja/settings.json";
import jaSso from "./messages/ja/sso.json";
import jaUsers from "./messages/ja/users.json";
import jaVersion from "./messages/ja/version.json";

/** 名前空間の一覧（検証スクリプトが disk と突き合わせる正本）。 */
export const NAMESPACES = [
  "agents",
  "auth",
  "collections",
  "common",
  "errors",
  "fields",
  "files",
  "folders",
  "items",
  "nav",
  "notifications",
  "onboarding",
  "policies",
  "relations",
  "reports",
  "richtext",
  "roles",
  "search",
  "settings",
  "sso",
  "users",
  "version",
] as const;

export const DICTIONARIES: Record<Locale, Messages> = {
  ja: {
    agents: jaAgents,
    auth: jaAuth,
    collections: jaCollections,
    common: jaCommon,
    errors: jaErrors,
    fields: jaFields,
    files: jaFiles,
    folders: jaFolders,
    items: jaItems,
    nav: jaNav,
    notifications: jaNotifications,
    onboarding: jaOnboarding,
    policies: jaPolicies,
    relations: jaRelations,
    reports: jaReports,
    richtext: jaRichtext,
    roles: jaRoles,
    search: jaSearch,
    settings: jaSettings,
    sso: jaSso,
    users: jaUsers,
    version: jaVersion,
  },
  en: {
    agents: enAgents,
    auth: enAuth,
    collections: enCollections,
    common: enCommon,
    errors: enErrors,
    fields: enFields,
    files: enFiles,
    folders: enFolders,
    items: enItems,
    nav: enNav,
    notifications: enNotifications,
    onboarding: enOnboarding,
    policies: enPolicies,
    relations: enRelations,
    reports: enReports,
    richtext: enRichtext,
    roles: enRoles,
    search: enSearch,
    settings: enSettings,
    sso: enSso,
    users: enUsers,
    version: enVersion,
  },
};

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
