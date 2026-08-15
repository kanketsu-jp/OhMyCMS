/**
 * 横断検索（F2-J）のドメイン層。
 *
 * ── この機能で一番大事なこと ──
 * 🚨 **検索は「権限の外にあるものを、名前だけ見せてしまう」事故が起きやすい経路。**
 *    中身を返さなければ安全、ではない。**存在を知られること自体が漏洩**。
 *
 * だから **検索用の権限判定を書かない。** 既存の入口をそのまま呼ぶ:
 *
 *   アイテム … `listItems()` を呼ぶ。この中で resolvePermission → 行フィルタ →
 *              フィールド許可まで全部やっている。私が決めるのは
 *              「どのコレクションを対象にするか」だけで、中身の可否は触らない
 *   ファイル … `listFiles()` を呼ぶ。directus_files の権限と行フィルタがそのまま効く
 *   コレクション … `resolvePermission(actor, c, "read").allowed` が true のものだけ
 *   設定・画面 … 管理操作の権限が無ければ**キーごと空にする**
 *
 * 判定が2系統に割れると必ず片方が腐るので、ここは遅くても既存の入口に通す。
 *
 * ── 日本語の検索を ILIKE にした理由（実測） ──
 * PostgreSQL の全文検索（tsvector）は**日本語を単語に割れない**。
 * この DB の `pg_ts_config` は 29 個あるが arabic〜yiddish と simple だけで、
 * **japanese は存在しない**（実測）。形態素解析の拡張（pgroonga / pg_bigm）も入っていない。
 * → `_icontains`（= `ILIKE '%…%'`）の部分一致で始める。
 *   `_icontains` は items の filter に既にあるので、**新しい検索構文を作らずに済む**。
 *   件数が問題になったら pg_trgm を検討する（いまは入れない）。
 *
 * 契約 §2-2: `next/*` を import しない。
 */

import type { Actor } from "@/lib/auth/context";
import { listFiles } from "@/lib/files/service";
import { listItems } from "@/lib/items/service";
import { requireAdminAccess, resolvePermission } from "@/lib/permissions/resolve";
import { getSchemaOverview } from "@/lib/schema/introspect";
import { isSystemTableName } from "@/lib/schema/validate";

/** 種類ごとの上限。全部返そうとしない（仕様 §2-1）。 */
const PER_KIND_LIMIT = 5;

/** アイテムを探しにいくコレクションの上限。読めるコレクションが多いときの保険。 */
const MAX_COLLECTIONS_SCANNED = 30;

/** 一致を判定するために読むファイルの最大件数（§下のコメント参照）。 */
const FILE_SCAN_LIMIT = 200;

export type SearchHit = {
  /** 画面に出す文字列。**辞書を通さない実データ**（コレクション名・タイトルなど）。 */
  label: string;
  /** 補足（どのコレクションのアイテムか、など）。 */
  hint?: string;
  /** 遷移先。アプリ内の相対パス。 */
  href: string;
};

export type SearchResult = {
  items: SearchHit[];
  files: SearchHit[];
  collections: SearchHit[];
  settings: SearchHit[];
  pages: SearchHit[];
};

const EMPTY: SearchResult = {
  items: [],
  files: [],
  collections: [],
  settings: [],
  pages: [],
};

/**
 * 設定項目と画面は**辞書キーで返す**（UI に文言を直接書かないのと同じ理由）。
 * 表示側が `search` 名前空間で引く。
 */
type StaticEntry = { labelKey: string; href: string };

/** 設定画面の項目。増えたらここに足す。 */
const SETTINGS_ENTRIES: StaticEntry[] = [
  { labelKey: "settings_project_name", href: "/admin/settings/general#settings-project_name" },
  { labelKey: "settings_project_color", href: "/admin/settings/general#settings-project_color" },
  { labelKey: "settings_project_logo", href: "/admin/settings/general#settings-project_logo" },
  { labelKey: "settings_default_locale", href: "/admin/settings/general#settings-default_locale" },
  { labelKey: "settings_public_note", href: "/admin/settings/general#settings-public_note" },
  { labelKey: "settings_s3_endpoint", href: "/admin/settings/storage#storage-s3_endpoint" },
  { labelKey: "settings_s3_bucket", href: "/admin/settings/storage#storage-s3_bucket" },
  { labelKey: "settings_s3_region", href: "/admin/settings/storage#storage-s3_region" },
  { labelKey: "settings_s3_access_key_id", href: "/admin/settings/storage#storage-s3_access_key_id" },
  { labelKey: "settings_s3_secret_access_key", href: "/admin/settings/storage#storage-s3_secret_access_key" },
  { labelKey: "settings_s3_force_path_style", href: "/admin/settings/storage#storage-s3_force_path_style" },
  { labelKey: "settings_s3_key_prefix", href: "/admin/settings/storage#storage-s3_key_prefix" },
];

/**
 * 管理画面そのもの。ナビに出ているものと揃える。
 *
 * 🚨 ルートがあっても、ここに足さないもの:
 *   /admin                  … /admin/collections へリダイレクトする入口で、目的地ではない
 *   /admin/collections/new  … 親画面のアクションボタンから開く作成フォーム
 *   /admin/files/new        … 親画面のアクションボタンから開く作成フォーム
 *   /admin/files/new-folder … 親画面のアクションボタンから開く作成フォーム
 *   /admin/profile          … 個人ページ。searchStatic() は PAGE_ENTRIES 全体を settings:read で
 *                              閉じるため、ここへ入れると非管理者の自分の個人ページが隠れる
 *   /admin/reports/manage   … canManageReports で閉じる画面。settings:read では判定できない
 */
const PAGE_ENTRIES: StaticEntry[] = [
  { labelKey: "page_collections", href: "/admin/collections" },
  { labelKey: "page_files", href: "/admin/files" },
  { labelKey: "page_folders", href: "/admin/folders" },
  { labelKey: "page_notifications", href: "/admin/notifications" },
  { labelKey: "page_reports", href: "/admin/reports" },
  { labelKey: "page_settings_general", href: "/admin/settings/general" },
  { labelKey: "page_settings_storage", href: "/admin/settings/storage" },
  { labelKey: "page_settings_sso", href: "/admin/settings/sso" },
  { labelKey: "page_settings_roles", href: "/admin/settings/roles" },
  { labelKey: "page_settings_policies", href: "/admin/settings/policies" },
  { labelKey: "page_settings_users", href: "/admin/settings/users" },
  { labelKey: "page_settings_agents", href: "/admin/settings/agents" },
  { labelKey: "page_settings_mcp", href: "/admin/settings/mcp" },
  { labelKey: "page_settings_version", href: "/admin/settings/version" },
];

/**
 * 静的な項目（設定・画面）は、**呼び出し側が翻訳した語**で突き合わせる。
 * ここで日本語や英語を直接書くと i18n の契約を破るので、
 * route 側が辞書を引いて `{ labelKey, label }` の形で渡してくる。
 */
export type TranslatedEntry = StaticEntry & { label: string };

/** 文字列として検索できるカラムか。 */
function isSearchableColumn(dataType: string): boolean {
  return /char|text|citext/i.test(dataType);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 横断検索する。
 *
 * @param translate 設定・画面の辞書引き。route 側が渡す（ここでは文言を持たない）
 */
export async function search(
  actor: Actor,
  rawQuery: string,
  translate: (entries: StaticEntry[]) => TranslatedEntry[],
): Promise<SearchResult> {
  const q = rawQuery.trim();
  // 🚨 空なら**何も返さない**。全件を返すと、それ自体が一覧の漏洩になる（仕様 §2-1）。
  if (q.length === 0) return EMPTY;

  const overview = await getSchemaOverview();
  const userCollections = Object.keys(overview)
    .filter((name) => !isSystemTableName(name))
    .sort();

  // ── 読めるコレクションを決める。ここだけが私の判断で、可否は resolvePermission が決める ──
  const readable: string[] = [];
  for (const collection of userCollections) {
    if (readable.length >= MAX_COLLECTIONS_SCANNED) break;
    const permission = await resolvePermission(actor, collection, "read");
    if (permission.allowed) readable.push(collection);
  }

  const [items, files] = await Promise.all([
    searchItems(actor, readable, overview, q),
    searchFiles(actor, q),
  ]);

  return {
    items,
    files,
    // コレクション名そのもの。**読めるものだけ**（名前を見せるのも漏洩なので）。
    collections: readable
      .filter((name) => normalize(name).includes(normalize(q)))
      .slice(0, PER_KIND_LIMIT)
      .map((name) => ({ label: name, href: `/admin/collections/${name}` })),
    // 設定と画面は管理操作の権限が要る。無ければ**キーごと空**にして存在を示さない。
    settings: await searchStatic(actor, SETTINGS_ENTRIES, q, translate, "settings:read"),
    pages: await searchStatic(actor, PAGE_ENTRIES, q, translate, "settings:read"),
  };
}

/**
 * アイテムを探す。
 *
 * 🚨 **コレクションごとに `listItems()` を呼ぶ**（N+1 の形）。1本のクエリに畳むと
 *    権限判定を自分で書くことになり、仕様 §3-1 に反する。**遅さより安全を取る。**
 *    件数が問題になったら MAX_COLLECTIONS_SCANNED を下げるか、
 *    対象コレクションを利用者に選ばせる（検索の意味は変わらない）。
 */
async function searchItems(
  actor: Actor,
  collections: string[],
  overview: Record<string, { name: string; data_type: string; is_primary_key: boolean }[]>,
  q: string,
): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];

  for (const collection of collections) {
    if (hits.length >= PER_KIND_LIMIT) break;

    const columns = overview[collection] ?? [];
    const primaryKey = columns.find((c) => c.is_primary_key)?.name;
    const searchable = columns.filter((c) => isSearchableColumn(c.data_type)).map((c) => c.name);
    if (!primaryKey || searchable.length === 0) continue;

    // 文字列カラムのどれかに部分一致（ILIKE）。
    const filter = { _or: searchable.map((field) => ({ [field]: { _icontains: q } })) };

    let result;
    try {
      result = await listItems(actor, collection, {
        filter: JSON.stringify(filter),
        limit: String(PER_KIND_LIMIT),
        // 主キーと文字列カラムだけ取る。許可されていないフィールドは listItems が落とす。
        fields: [primaryKey, ...searchable].join(","),
      });
    } catch {
      // 権限やフィールドの都合で弾かれたコレクションは**黙って飛ばす**。
      // ここで例外を投げると、1つ読めないコレクションがあるだけで検索全体が落ちる。
      continue;
    }

    for (const row of result.data) {
      if (hits.length >= PER_KIND_LIMIT) break;
      const record = row as Record<string, unknown>;
      const id = record[primaryKey];
      // 表示は「一致した値」を優先する。無ければ主キー。
      const matched = searchable
        .map((field) => record[field])
        .find((value) => typeof value === "string" && normalize(value).includes(normalize(q)));
      hits.push({
        label: typeof matched === "string" && matched.length > 0 ? matched : String(id),
        hint: collection,
        href: `/admin/content/${collection}/${String(id)}`,
      });
    }
  }

  return hits;
}

/**
 * ファイルを探す。
 *
 * 🚨 `listFiles()` は本文の絞り込みを受け取らないので、**権限つきで読んでから
 *    アプリ側で突き合わせる**。SQL に ILIKE を足す方が速いが、それには
 *    `lib/files/service.ts`（別トラックが編集中）を変える必要があり、
 *    **権限の入口を増やす危険**もある。MVP では読む件数に上限を付けて済ませる。
 */
async function searchFiles(actor: Actor, q: string): Promise<SearchHit[]> {
  let rows;
  try {
    rows = await listFiles(actor, { limit: String(FILE_SCAN_LIMIT) });
  } catch {
    // ファイルを読む権限が無い人には、**空で返す**（403 を検索全体の失敗にしない）。
    return [];
  }

  const needle = normalize(q);
  return rows
    .filter((row) => {
      const record = row as unknown as Record<string, unknown>;
      const name = typeof record.filename_download === "string" ? record.filename_download : "";
      const title = typeof record.title === "string" ? record.title : "";
      return normalize(name).includes(needle) || normalize(title).includes(needle);
    })
    .slice(0, PER_KIND_LIMIT)
    .map((row) => {
      const record = row as unknown as Record<string, unknown>;
      const name =
        (typeof record.title === "string" && record.title) ||
        (typeof record.filename_download === "string" && record.filename_download) ||
        String(record.id);
      return { label: name, href: `/admin/files/${String(record.id)}` };
    });
}

/**
 * 設定項目・画面を探す。
 * 🚨 **管理操作の権限が無ければ、1件も返さない。** 名前を見せるだけでも
 *    「そういう画面がある」という情報になるため。
 */
async function searchStatic(
  actor: Actor,
  entries: StaticEntry[],
  q: string,
  translate: (entries: StaticEntry[]) => TranslatedEntry[],
  capability: "settings:read",
): Promise<SearchHit[]> {
  // 🚨 既存の管理権限チェックをそのまま使う（検索用の判定を作らない）。
  //    権限が無ければ throw されるので、**空配列で返して存在を示さない**。
  try {
    await requireAdminAccess(actor, capability);
  } catch {
    return [];
  }

  const needle = normalize(q);
  return translate(entries)
    .filter((entry) => normalize(entry.label).includes(needle))
    .slice(0, PER_KIND_LIMIT)
    .map((entry) => ({ label: entry.label, href: entry.href }));
}

export { SETTINGS_ENTRIES, PAGE_ENTRIES };
export type { StaticEntry };
