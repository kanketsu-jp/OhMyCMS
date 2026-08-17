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
   * **ページの意図が分かる方の名前**（パンくず・右サイドバー用）。
   *
   * 由来（堀池・2026-08-15 原文）:
   * > 「ページ名はユーザーではなく**ユーザー管理**などにする。理由として、左サイドバーに表示する用の
   * >   **短いタイトル**と、ページの意図がわかる**本タイトル**を用意して、パンクズには本タイトルを採用」
   *
   * 🚨 **省略可。省略したら `titleKey` を使う**（`fullTitleKey ?? titleKey`）。
   *    必須にすると **26 ページ全部に書かせる**ことになり、意味の無い本タイトルが並ぶ。
   *    実際「ファイル」に「管理」を足しても情報は増えない——**本タイトルを持たないのが正解のページがある**。
   *
   * 🚨 **短い方はここに無い。** 左サイドバーの項目名は
   *    `app/(admin)/layout.tsx` の `labelKey`（`nav` 名前空間）が持っており、**既に短い**。
   *    ここに「短いタイトル」を足すと、**同じものが2箇所になって必ず片方が腐る**。
   */
  fullTitleKey?: string;
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
  /**
   * 🚨 **名前は在るが、ページは無い区画**（`/admin/content` / `/admin/settings`）。
   *
   * 由来: 2026-08-17。`/admin/collections/<名前>` と `/admin/content/<名前>` を並べたら、
   * **h1・パンくず・`<title>` の 3 つとも同一**で、**どちらの区画に居るか画面から分からなかった**。
   * 根は `buildTrail` が「`PAGE_META` に無い区間を捨てる」ことで、
   * `/admin/content` にはページが無いので載っておらず、**区画の名前ごと落ちていた**。
   *
   * 🚨 **載せるが、リンクにはしない。** 押すと 404 になるため
   *   （`page-trail.ts` の「実在しない中間パスは出さない」は**リンクの話**であって、
   *    **名前を落とせという話ではなかった**——そこを取り違えていた）。
   */
  navigable?: false;
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
  "/admin/collections/[collection]": {
    titleKey: "collections.title",
    // 🚨 居座る画面（DESIGN.md §1-11）。動的な名前が入るので、**名前でなく「何ができる画面か」**を書く。
    descriptionKey: "collections.detail_description",
    titleFromData: true,
    sectionKeys: ["fields.list_title", "relations.list_title", "relations.add_title"],
  },
  "/admin/collections/[collection]/fields/new": { titleKey: "fields.add_title" },

  // 🚨 コレクションが在れば最初の 1 つへ送り、無ければ作成導線を出す。
  "/admin/content": { titleKey: "nav.content_heading" },
  "/admin/content/[collection]": {
    titleKey: "items.title_for_collection",
    // 🚨 居座る画面（§1-11）。いちばん長く居る一覧なので、ここが無いのがいちばん効いていた。
    descriptionKey: "items.list_description",
    titleFromData: true,
    sectionKeys: ["items.list_title"],
  },
  "/admin/content/[collection]/new": { titleKey: "items.new_item" },
  // 🚨 居座る画面（§1-11）。司令塔の名指しには無いが、上の一覧と対で作業が続くので足した。
  "/admin/content/[collection]/[id]": {
    titleKey: "items.edit_item_title",
    descriptionKey: "items.edit_description",
  },

  // 🚨 【反転済み・2026-08-17 D5】ここには「files には概要の文言が無いので推測で足さない」と
  //    書いてあったが、**その下の行で D5 が `files.description` を足したので、もう当てはまらない**。
  //    残す理由は経緯: **「無い＝まだ決まっていない」と「無い＝要らない」を混ぜない**という判断で、
  //    決まってから書いた、という順番だったこと（この順番自体は今も正しい）。
  // 🚨 sectionKeys を持たせない（堀池・2026-08-17 D3 原文）:
  //    「admin/files の右サイドバーにある『項目一覧』アコーディオンは、
  //      現状『一覧』という文字しかなく機能していないため廃止してください」
  //    節が 1 つだけで、その名前が「一覧」だった。飛び先の一覧として意味を成していない。
  //    🚨 0 件のときに枠ごと消す動きは page-info-panel.tsx:80 に既に在るので、
  //       ここを空にするだけで枠は出なくなる（新しい分岐を足していない）。
  // 🚨 descriptionKey を持たせる（堀池・2026-08-17 D5）。**概要の枠はこれが在るときだけ出る**
  //    （`page-info-panel.tsx` が `meta?.descriptionKey` で囲っている）。
  //    ＝ 「ストレージ情報を概要に出す」は、**枠を出すことと中身を入れることの 2 つ**だった。
  "/admin/files": { titleKey: "files.title", descriptionKey: "files.description" },
  "/admin/files/new": { titleKey: "files.upload_title" },
  "/admin/files/new-folder": { titleKey: "folders.title" },
  "/admin/labels": { titleKey: "labels.title", descriptionKey: "labels.description" },
  // 🚨 居座る画面（§1-11）。実際にできること（題・説明・タグ・置き場所）を実装から読んで書いた。
  "/admin/files/[id]": {
    titleKey: "files.detail_fallback_title",
    descriptionKey: "files.detail_description",
    titleFromData: true,
  },

  "/admin/notifications": {
    titleKey: "notifications.title",
    descriptionKey: "notifications.description",
  },
  "/admin/reports": { titleKey: "reports.title", descriptionKey: "reports.description" },
  // `/admin/reports/manage` は `[id]` と区間数が同じだが、`pageMeta()` は
  // **まず完全一致を見る**（`PAGE_META[pathname]`）ので `[id]` に吸われない。
  // 🚨 並び順で守られているのではない。順序を入れ替えても解決先は変わらないことを実測した
  //    （最初「先に置かないと吸われる」と書いたが、**それは誤り**だった）。
  // 🚨 **一覧と同じ `reports.title` を使わない。** 使うと見出しが
  //    「不具合の報告（不具合の報告）」になる（実測 2026-08-17）。
  //    `page-heading.tsx` は **葉の名前（{name}）と、その上の区画（{context}）**を
  //    `nav.page_title_with_context`＝`{name}（{context}）` に流す。
  //    葉も区画も `/admin/reports` の名前だと、**同じ語が 2 回出る**。
  //    ＝ ここは「その報告のやりとり」なので、葉には別の名前を与える。
  // 🚨 説明を足した（`DESIGN.md` §1-11「居座る画面には『この画面は何か』を出す」）。
  //    実測（2026-08-17・pages）: 右パネルの概要が、私の 5 画面のうちここだけ空だった
  //    （他の 4 つは「概要」＋ 1 文が出る。ここは「やりとり / API・MCP」だけ）。
  //    🚨 §1-11 の「動的な名前が入る画面は、名前ではなく**何ができる画面か**を書く」に従い、
  //    報告の題名ではなく「返信を書ける」を書いている。
  //    🚨 「解決済みにできます」とは書かない——**それができるのは管理できる人だけ**で、
  //    できない人に約束することになる。
  "/admin/reports/[id]": {
    titleKey: "reports.thread_title",
    descriptionKey: "reports.thread_description",
  },

  // 🚨 居座る画面（§1-11）。ここは節が「API・MCP」1 つしか無く、説明が無いと
  //    右サイドバーを開いてもプロンプトの話しか出ない（実測: 節 1・開いている 0）。
  "/admin/profile": { titleKey: "nav.profile", descriptionKey: "nav.profile_description" },

  // 🚨 ここが無いと、`buildTrail` は**生の URL 区間**を名前にする（＝ パンくずに `trash` と英字で出る）。
  //    2026-08-17 に実測して気づいた（`<h1>` を足したら、その中身が「ゴミ箱」ではなく `trash` だった）。
  //    ＝ **AGENTS.md §3.8 の「UI に文言を直接書かない」の、書かなかったほうの穴**
  //      （辞書を通していないのではなく、**辞書へ辿り着けていない**）。
  //    🚨 未登録は黙って通る（`pageMeta` が null を返し、区間名で代用される）ので、
  //      **新しい画面を足したら、ここにも 1 行足すこと**。
  "/admin/trash": { titleKey: "trash.title", descriptionKey: "trash.description" },

  // 🚨 `/admin/content` と同じ理由。ページは無いが名前は道筋に出す。
  "/admin/settings": { titleKey: "nav.settings", navigable: false },
  "/admin/settings/general": { titleKey: "settings.title", descriptionKey: "settings.description" },
  "/admin/settings/ai": { titleKey: "agents.ai_title", descriptionKey: "agents.ai_description" },
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
  "/admin/version": { titleKey: "version.title", descriptionKey: "version.description" },
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
