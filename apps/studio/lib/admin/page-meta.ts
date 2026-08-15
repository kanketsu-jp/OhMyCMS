/**
 * 各ページの「名前」と「概要」の定義。
 *
 * 🚨 **文言そのものは持たない。辞書のキーだけを持つ**（`AGENTS.md §3.8`）。
 * ここに日本語を書くと、英語へ切り替えたときにここだけ残る。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「…は必要ない。理由は**タイトルはパンクズで表示する**のと、
 * >   その下の概要は**「info」アイコンで説明する**。」
 * > 「…右サイドバーが表示され、そこにアコーディオンで『そのページの概要…』を記載。
 * >   これは **LLM がそのページを見た時や人間が見てもその説明文で理解できるように**する。
 * >   **これは Storybook にもつかう。なので const として定数化も OK**）」
 *
 * 読む側は3つ:
 * - **パンくず**（ヘッダ）と**右サイドバーの概要**（shell ペインが作る）
 * - **Storybook**（ページの説明として）
 * - **LLM**（MCP 経由でページを説明するとき）
 *
 * 🚨 **ページ本文には出さない。** 見出しと概要をページ上部から外したのが、この定数の発端。
 */

export type PageMeta = {
  /** パンくずと右サイドバーの見出しに使う辞書キー（`名前空間.キー`） */
  titleKey: string;
  /**
   * 右サイドバー「概要」の本文に使う辞書キー。
   * **概要を持たないページもある**（作成フォームなど、見れば分かるもの）。
   */
  descriptionKey?: string;
  /**
   * 🚨 **名前が実データで決まるページ**（コレクション名・ファイル名・ポリシー名）。
   * この印があるとき、`titleKey` は**取れなかったときの控え**であって、
   * ふだんはパンくずが**実データの名前**を出す。
   * 例: `/admin/files/[id]` は本来ファイル名を出し、無いときだけ `titleKey` を使う。
   */
  titleFromData?: true;
  /**
   * 右サイドバー「項目一覧」に出す節の辞書キー。
   * 🚨 **ページ本文の見出しとは別物**。本文から見出しを消しても、ここには残す。
   * 由来:「`/admin/collections` の『一覧』は廃止。そもそも見てわかるので。
   * **ただし右サイドバーの項目一覧には『コレクション一覧』と表示する**。」
   */
  sectionKeys?: readonly string[];
};

/**
 * 🚨 キーは**ルートの形**で持つ（`[collection]` などを含む実際のパス）。
 * 解決は `pageMeta()` が区間ごとに突き合わせる。
 */
export const PAGE_META: Readonly<Record<string, PageMeta>> = {
  "/admin/collections": {
    titleKey: "collections.title",
    descriptionKey: "collections.subtitle",
    sectionKeys: ["collections.list_title"],
  },
  "/admin/collections/new": { titleKey: "collections.create_title" },
  "/admin/collections/[collection]": { titleKey: "collections.title", titleFromData: true },
  "/admin/collections/[collection]/fields/new": { titleKey: "fields.add_title" },

  "/admin/content/[collection]": { titleKey: "items.title_for_collection", titleFromData: true },
  "/admin/content/[collection]/new": { titleKey: "items.new_item" },
  "/admin/content/[collection]/[id]": { titleKey: "items.edit_item_title" },

  // 🚨 files には概要の文言が無い（`description` キーが存在しない）。
  //    **推測で辞書へ足さない**。概要が要ると決まったら、そのとき書く。
  "/admin/files": { titleKey: "files.title", sectionKeys: ["files.list_title"] },
  "/admin/files/new": { titleKey: "files.upload_title" },
  "/admin/files/new-folder": { titleKey: "folders.title" },
  "/admin/files/[id]": { titleKey: "files.detail_fallback_title", titleFromData: true },

  "/admin/notifications": {
    titleKey: "notifications.title",
    descriptionKey: "notifications.description",
  },
  "/admin/reports": { titleKey: "reports.title", descriptionKey: "reports.description" },
  // `/admin/reports/manage` は `[id]` と区間数が同じだが、`pageMeta()` は
  // **まず完全一致を見る**（`PAGE_META[pathname]`）ので `[id]` に吸われない。
  // 🚨 並び順で守られているのではない。順序を入れ替えても解決先は変わらないことを実測した
  //    （最初「先に置かないと吸われる」と書いたが、**それは誤り**だった）。
  "/admin/reports/manage": { titleKey: "reports.nav_manage" },
  "/admin/reports/[id]": { titleKey: "reports.title" },

  "/admin/profile": { titleKey: "nav.profile" },

  "/admin/settings/general": { titleKey: "settings.title", descriptionKey: "settings.description" },
  "/admin/settings/agents": { titleKey: "agents.title", descriptionKey: "agents.description" },
  "/admin/settings/mcp": { titleKey: "mcp.title", descriptionKey: "mcp.description" },
  "/admin/settings/policies": { titleKey: "policies.title", descriptionKey: "policies.description" },
  "/admin/settings/policies/[id]": {
    titleKey: "policies.detail_fallback_title",
    descriptionKey: "policies.detail_description",
    titleFromData: true,
  },
  "/admin/settings/roles": { titleKey: "roles.title", descriptionKey: "roles.description" },
  "/admin/settings/sso": { titleKey: "sso.title", descriptionKey: "sso.description" },
  "/admin/settings/storage": { titleKey: "storage.title", descriptionKey: "storage.description" },
  "/admin/settings/users": { titleKey: "users.title", descriptionKey: "users.description" },
  "/admin/settings/version": { titleKey: "version.title", descriptionKey: "version.description" },
};

/**
 * パスに対応する定義。無ければ null（パンくずは実データだけで組み立てる）。
 *
 * 🚨 実際のパス（`/admin/files/abc-123`）を、ルートの形（`/admin/files/[id]`）へ
 * 突き合わせる。**区間数が同じで、`[…]` は何にでも当たる**という単純な規則。
 * 具体的な区間を優先するので、`/admin/files/new` は `[id]` より先に当たる。
 */
export function pageMeta(pathname: string): PageMeta | null {
  const direct = PAGE_META[pathname];
  if (direct) return direct;

  const parts = pathname.split("/").filter(Boolean);
  for (const [route, meta] of Object.entries(PAGE_META)) {
    const routeParts = route.split("/").filter(Boolean);
    if (routeParts.length !== parts.length) continue;
    const hit = routeParts.every(
      (segment, i) => (segment.startsWith("[") && segment.endsWith("]")) || segment === parts[i],
    );
    if (hit) return meta;
  }
  return null;
}
