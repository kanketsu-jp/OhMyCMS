/**
 * 各ページの**アクションボタン**の定義。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「アクションボタンが適切ではない問題
 * >   今のアクションボタンはまだまだ足りない。＋**ページの性質を理解していない**。
 * >   - https://ohmycms.kanketsu.app/admin/collections：**新規作成ボタンがデフォルト**」
 *
 * 置き場所（同・ヘッダーの構成）:
 * > 「その次にアクションボタン（**SPと同じ**）（一番右）」
 * → PC は `#header-primary-action`（shell が置く枠）、SP は `#mobile-primary-action`
 *   （下部ナビの右端）。**どちらも同じ定義から出す**ので、PC と SP で食い違わない。
 *
 * 🚨 **文言そのものは持たない。辞書のキーだけを持つ**（`AGENTS.md §3.8`）。
 *    `lib/admin/page-meta.ts` と同じ理由・同じ書き方に揃えてある
 *    （ルートの形をキーにする／辞書キーは名前空間つき）。
 *
 * 🚨 **`lib/` には React も `next/*` も持ち込まない**（`AGENTS.md §3.6`）。
 *    だからアイコンは**名前（文字列）**で持ち、部品（`components/admin/*`）側で
 *    lucide の実体へ対応づける。ここに `<Plus />` を書くと lib/ が React に依存する。
 *
 * この定数を読むのは 3 箇所（page-meta.ts と同じ考え方）:
 * - 各ページ（実際にボタンを描く）
 * - Storybook（そのページで何ができるかの説明として）
 * - LLM / MCP（「このページで取れる操作」を答えるとき）
 */

/**
 * ボタンの押し方。**ページの性質で決まる**。
 *
 * - `link`   … 一覧ページ。次の画面へ行く（例: 一覧 → 新規作成）
 * - `submit` … フォームのページ。**ページの中にある form を、外にあるボタンから送る**。
 *              HTML の `form` 属性（`<button type="submit" form="...">`）で成立する。
 *              🚨 これが無いと「保存」をヘッダーへ出せない（form の外側に置かれるため）。
 * - `button` … その場で何かする（すべて既読にする・更新を確認する・報告を開く 等）
 */
export type PageActionKind = "link" | "submit" | "button";

export type PageActionDef = {
  /** 押したときに何が起きるか */
  kind: PageActionKind;
  /** ボタンの文字に使う辞書キー（名前空間つき）。SP では `aria-label` にも使う */
  labelKey: string;
  /** lucide のアイコン名。実体への対応づけは部品側（lib/ に React を持ち込まないため） */
  icon: string;
  /**
   * `kind: "link"` の行き先。**ルートの形で書く**（`[collection]` を含む）。
   * 実際のパスへの差し替えは `resolveActionHref()` が行う。
   */
  href?: string;
  /**
   * `kind: "submit"` のとき、送る相手の `<form id="...">`。
   * 🚨 **ページ側の form に同じ id を付けること**。付け忘れるとボタンが黙って効かない。
   */
  form?: string;
  /**
   * 主要か、補助か。
   * 🚨 **主要は 1 ページに 1 つだけ**。2 つ並べると「まずこれ」が消える。
   *    （守り手: `scripts/check-page-actions.mjs` の「主要ボタン」。0 件でも 2 件でも落ちる。
   *      🚨 **見ていない範囲**: この表を**別ファイルで組み立てて import** する形。検査は
   *      `page-actions.ts` 1 本しか読まないので、構造ごと動かされたら何も見えない）
   */
  role: "primary" | "secondary";
  /** 取り消せない操作（削除）。押し間違いが戻せないものだけ true */
  destructive?: boolean;
  /**
   * ▾（オプション）の中に出る操作。**主ボタンの横には出ない**。
   *
   * 🚨 283 A（堀池さん 2026-08-15「削除はオプションへ」）で、削除が ▾ の中へ移った。
   *    入れ子の `options` にせず**平らな 1 行**にしてあるのは、`check-page-actions` が
   *    ブロックを字下げ 2 で切るため（**入れ子にすると次のルートを飲み込む**。
   *    2026-08-16 に実際に起こした）。
   */
  inMenu?: boolean;
  /**
   * その画面が**表示モード / 編集モードを持つ**とき、**どちらで出るか**。
   *
   * 規約: `knowledge/decisions/action-button-and-edit-mode.md`（堀池さん 2026-08-15・原文
   * 「**全てにおいて基本は編集モードと表示を分ける**」）。
   *
   * ```
   * "view" … 表示モードでだけ出る（例:「編集する」／▾ の中の削除）
   * "edit" … 編集モードでだけ出る（例:「保存」「やめる」）
   * 🚨 省略 … **どちらのモードでも出る**（モードを持たない画面も、ここに入る）
   * ```
   *
   * 🚨 **省略の意味を「モードを持たない画面」にしない**（polish 2026-08-16 の指摘）。
   *    そうすると、**その画面が後でモードを持った日に、省略の行が全部、
   *    誰も書き換えていないのに意味を変えます**。「どちらでも出る」なら、その日も正しいまま。
   *
   * 🚨 **「この画面はモードを持つか」は表から導出できる**（どれかが `mode` を宣言しているか）ので、
   *    宣言に持たせない。**導出できるものを宣言に持たせない。**
   *
   * 🚨 **`disabled` の条件（`!dirty` など）はここに持たせない。**
   *    polish が `<PageAction … disabled={…}>` の**条件式そのもの**を実装から導出しており
   *    （`!ready` / `!dirty` / `users.length === 0 || …` の 3 件）、
   *    宣言で持つと**実装と食い違って腐る**ため。
   */
  mode?: "view" | "edit";
};

/**
 * ルートの形 → そのページのアクション。
 *
 * 🚨 キーは `lib/admin/page-meta.ts` の `PAGE_META` と**同じ表記**にしてある。
 *    片方にだけルートが増えると、パンくずは出るのにボタンが無い（逆も同じ）が起きる。
 *
 * 🚨 **転送だけのページ（`/admin`・`/admin/folders`）は持たない。** 画面が無いので操作も無い。
 */
export const PAGE_ACTIONS: Readonly<Record<string, readonly PageActionDef[]>> = {
  // ── コレクション ──────────────────────────────────────────
  // 堀池さんが名指しした 1 件。一覧ページの既定は**新規作成**。
  "/admin/collections": [
    {
      kind: "link",
      labelKey: "collections.new_button",
      icon: "Plus",
      href: "/admin/collections/new",
      role: "primary",
    },
  ],
  "/admin/collections/new": [
    {
      kind: "submit",
      labelKey: "collections.create_button",
      icon: "Check",
      form: "collection-create-form",
      role: "primary",
    },
  ],
  // フィールド定義の画面。次にすることは**フィールドを足す**こと。
  "/admin/collections/[collection]": [
    // 🚨 **字下げを変えないこと。** `check-page-actions` はブロックを
    //    `^ {2}"…": \[ … ^ {2}\],` で切り出すので、閉じ `],` が 2 でないと
    //    **次のルートまで飲み込み**、主要ボタンが 2 件に見える（2026-08-16 に実際にやった）。
    {
      kind: "link",
      labelKey: "fields.add_button",
      icon: "Plus",
      href: "/admin/collections/[collection]/fields/new",
      role: "primary",
    },
    {
      kind: "submit",
      labelKey: "collections.delete_button",
      icon: "Trash2",
      form: "collection-delete-form",
      role: "secondary",
      destructive: true,
      inMenu: true,
    },
  ],
  "/admin/collections/[collection]/fields/new": [
    {
      kind: "submit",
      labelKey: "fields.add_button",
      icon: "Check",
      form: "field-create-form",
      role: "primary",
    },
  ],

  // ── コンテンツ（アイテム）─────────────────────────────────
  "/admin/content/[collection]": [
    {
      kind: "link",
      labelKey: "items.new_item",
      icon: "Plus",
      href: "/admin/content/[collection]/new",
      role: "primary",
    },
  ],
  "/admin/content/[collection]/new": [
    {
      kind: "submit",
      labelKey: "items.create_button",
      icon: "Check",
      form: "item-form",
      role: "primary",
    },
  ],
  // 編集画面。堀池さん（憲章 §7）:「その画面ですぐにしたいアクション（**編集、保存など**）」。
  //
  // 🚨 **削除は入れていない。** 実装を読んだ結果、削除は
  //    `/admin/content/[collection]`（一覧）の**行の中にしか無い**（`_method=delete` の form）。
  //    編集画面に削除を足すのは**新しい操作を作ること**なので、
  //    「足りないボタンを足す」作業の範囲を超える（取り消せない操作なので確認の設計も要る）。
  //    → 司令塔へ提案として上げてある。決まったらここに 1 件足す。
  "/admin/content/[collection]/[id]": [
    {
      kind: "submit",
      labelKey: "items.save_button",
      icon: "Check",
      form: "item-form",
      role: "primary",
    },
  ],

  // ── ファイル ──────────────────────────────────────────────
  // 🚨 一覧の既定は「追加」。**フォルダ作成は補助**（毎回作るものではない）。
  "/admin/files": [
    {
      kind: "link",
      labelKey: "files.new_file_button",
      icon: "Upload",
      href: "/admin/files/new",
      role: "primary",
    },
    {
      kind: "link",
      labelKey: "files.new_folder_button",
      icon: "FolderPlus",
      href: "/admin/files/new-folder",
      role: "secondary",
    },
  ],
  "/admin/files/new": [
    {
      kind: "submit",
      labelKey: "files.upload_button",
      icon: "Upload",
      form: "file-upload-form",
      role: "primary",
    },
  ],
  "/admin/files/new-folder": [
    {
      kind: "submit",
      labelKey: "folders.create_button",
      icon: "Check",
      form: "folder-create-form",
      role: "primary",
    },
  ],
  "/admin/files/[id]": [
    // 🚨 2026-08-16、この画面を表示モード / 編集モードに分けた（`file-detail-manager.tsx`）。
    //    **画面を開いた直後に出るのは「編集する」だけ**なので、ここにはそれを書く。
    //    `/admin/profile` と同じ形（この表にはモードの概念が無い。下の「見ていない範囲」）。
    //
    // 🚨 **この表が見ていない範囲**（塞げないものは隠さず書く）:
    //    ・**編集モードの「保存」「やめる」は、ここに宣言できない**
    //      （表は 1 ルート＝1 組で、**状態で入れ替わるもの**を表せない）
    //    ・＝ **その 2 つが壊れても、`check-page-actions` / `-rendered` は気づかない**
    //    🚨 ・**この表が古くなっても、検査は通る。** 実際、2026-08-16 に主アクションを
    //      「保存」から「編集する」へ変えたとき、**2 本とも緑のままだった**
    //      （検査は「宣言が実在するものを指すか」を見ており、**実物と一致するかは見ていない**）
    {
      kind: "button",
      labelKey: "common.action_edit",
      icon: "Pencil",
      role: "primary",
      mode: "view",
    },
    // 🚨 削除は**本文から ▾ の中へ移した**（規約 §3「破壊的な操作は必ず ▾ の中」）。
    //    `submit` ではない。専用の form を持たず、押したときの処理を渡す形。
    //    🚨 ▾ を出しているのは**表示モードの主ボタン**なので `mode: "view"`。
    {
      kind: "button",
      labelKey: "files.delete_button",
      icon: "Trash2",
      role: "secondary",
      destructive: true,
      inMenu: true,
      mode: "view",
    },
    {
      kind: "button",
      labelKey: "common.action_cancel",
      icon: "X",
      role: "secondary",
      mode: "edit",
    },
    {
      kind: "submit",
      labelKey: "common.action_save",
      icon: "Check",
      form: "file-detail-form",
      role: "primary",
      mode: "edit",
    },
  ],

  // ── お知らせ ──────────────────────────────────────────────
  // 一覧を見に来た人がすぐしたいのは「全部読んだことにする」。
  "/admin/notifications": [
    {
      kind: "button",
      labelKey: "notifications.mark_all_read",
      icon: "CheckCheck",
      role: "primary",
    },
  ],

  // ── 不具合報告 ────────────────────────────────────────────
  // 🚨 `link` ではない。**その場で報告の入力を開く**
  //    （SP=モーダル / PC=右サイドバー。どちらも shell の `useRightPanel().push()` が面倒を見る）。
  "/admin/reports": [
    {
      kind: "button",
      labelKey: "reports.nav_create",
      icon: "MessageSquarePlus",
      role: "primary",
    },
  ],

  // ── 設定 ──────────────────────────────────────────────────
  "/admin/settings/general": [
    // 🚨 表示モード / 編集モードに分けてある（`settings-manager.tsx`・②の 1 枚目）。`mode` の意味は型の JSDoc。
    {
      kind: "button",
      labelKey: "common.action_edit",
      icon: "Pencil",
      role: "primary",
      mode: "view",
    },
    {
      kind: "button",
      labelKey: "common.action_cancel",
      icon: "X",
      role: "secondary",
      mode: "edit",
    },
    {
      kind: "submit",
      labelKey: "common.action_save",
      icon: "Check",
      form: "settings-form",
      role: "primary",
      mode: "edit",
    },
  ],
  "/admin/settings/storage": [
    // 🚨 表示モード / 編集モードに分けてある（`storage-settings-manager.tsx`・②の 4 枚目）。`mode` の意味は型の JSDoc。
    {
      kind: "button",
      labelKey: "common.action_edit",
      icon: "Pencil",
      role: "primary",
      mode: "view",
    },
    {
      kind: "button",
      labelKey: "common.action_cancel",
      icon: "X",
      role: "secondary",
      mode: "edit",
    },
    {
      kind: "submit",
      labelKey: "common.action_save",
      icon: "Check",
      form: "storage-settings-form",
      role: "primary",
      mode: "edit",
    },
  ],
  "/admin/settings/sso": [
    // 🚨 表示モード / 編集モードに分けてある（`saml-settings-manager.tsx`・②の 2 枚目）。`mode` の意味は型の JSDoc。
    {
      kind: "button",
      labelKey: "common.action_edit",
      icon: "Pencil",
      role: "primary",
      mode: "view",
    },
    {
      kind: "button",
      labelKey: "common.action_cancel",
      icon: "X",
      role: "secondary",
      mode: "edit",
    },
    {
      kind: "submit",
      labelKey: "common.action_save",
      icon: "Check",
      form: "saml-settings-form",
      role: "primary",
      mode: "edit",
    },
  ],
  "/admin/settings/roles": [
    {
      kind: "submit",
      labelKey: "roles.create_button",
      icon: "Plus",
      form: "role-create-form",
      role: "primary",
    },
  ],
  "/admin/settings/policies": [
    {
      kind: "submit",
      labelKey: "policies.create_button",
      icon: "Plus",
      form: "policy-create-form",
      role: "primary",
    },
  ],
  // 🚨 このページに `<form>` は無い（`policy-permissions-manager.tsx` は
  //    `type="button"` ＋ onClick で保存している）。form 属性では送れないので `button`。
  // 🚨 文字は**状態で変わる**。行を選んでいない間は「追加」、選んでいる間は「更新」
  //    （`policies.update_button`）。ここに書けるのは既定の側だけなので、
  //    実装が `update_button` も出すことをこの注記で残す。
  "/admin/settings/policies/[id]": [
    {
      kind: "button",
      labelKey: "policies.add_button",
      icon: "Check",
      role: "primary",
    },
  ],
  "/admin/settings/users": [
    {
      kind: "submit",
      labelKey: "users.assign_button",
      icon: "Plus",
      form: "user-policy-assign-form",
      role: "primary",
    },
  ],
  "/admin/settings/agents": [
    {
      kind: "submit",
      labelKey: "agents.issue_button",
      icon: "Plus",
      form: "agent-issue-form",
      role: "primary",
    },
  ],
  // 🚨 MCP のページは**設定を読むだけ**で、そこで作るものが無い。
  //    次にすることは「繋ぐためのトークンを発行する」なので、行き先はエージェント管理。
  //    （画面内の「コピー」は行ごとの操作なので、ページの主要アクションではない）
  "/admin/settings/mcp": [
    {
      kind: "link",
      labelKey: "mcp.issue_token_link",
      icon: "KeyRound",
      href: "/admin/settings/agents",
      role: "primary",
    },
  ],
  "/admin/settings/version": [
    {
      kind: "button",
      labelKey: "version.check_button",
      icon: "RefreshCw",
      role: "primary",
    },
  ],
  // ユーザーメニューから来る個人ページなので、ナビ項目の最後に置く。
  "/admin/profile": [
    // 🚨 **2026-08-16 に解消**（この節は消さず、何が塞がったかを残す）:
    //    2026-08-15 の時点では「**この表にはモードの概念がありません**」と書いてあり、
    //    **編集モードの「保存」「やめる」を宣言できず**、壊れても検査が気づかなかった。
    //    → 型に `mode` を足したので、**いまは 3 つとも宣言できている**。
    // 🚨 **まだ見ていない範囲**（塞げないものは隠さず書く）:
    //    ・`-rendered` は**表示モードで画面を開いて**照合するので、
    //      **`mode: "edit"` の行は「描かれているか」を確かめていない**
    //    ・言語切替は**編集モードの対象外**（即時に効く）ので、そもそもここに出ない
    {
      kind: "button",
      labelKey: "common.action_edit",
      icon: "Pencil",
      role: "primary",
      mode: "view",
    },
    {
      kind: "button",
      labelKey: "common.action_cancel",
      icon: "X",
      role: "secondary",
      mode: "edit",
    },
    {
      kind: "submit",
      labelKey: "common.action_save",
      icon: "Check",
      form: "profile-name-form",
      role: "primary",
      mode: "edit",
    },
  ],
};

/** ルートの形かどうか（`[collection]` のような区間） */
function isParamSegment(segment: string): boolean {
  return segment.startsWith("[") && segment.endsWith("]");
}

/**
 * 実際のパスに当たるルートの形を返す。無ければ null。
 *
 * 🚨 **区間数が同じで、`[…]` は何にでも当たる**（`page-meta.ts` の `pageMeta()` と同じ規則）。
 *    ただし**具体的な区間を先に見る**ので、`/admin/files/new` は `/admin/files/[id]` より
 *    先に `/admin/files/new` へ当たる。
 */
export function matchActionRoute(pathname: string): string | null {
  if (PAGE_ACTIONS[pathname]) return pathname;

  const parts = pathname.split("/").filter(Boolean);
  for (const route of Object.keys(PAGE_ACTIONS)) {
    const routeParts = route.split("/").filter(Boolean);
    if (routeParts.length !== parts.length) continue;
    const hit = routeParts.every(
      (segment, i) => isParamSegment(segment) || segment === parts[i],
    );
    if (hit) return route;
  }
  return null;
}

/** そのパスのアクション。無ければ空配列（**ヘッダーには何も出ない**） */
export function pageActions(pathname: string): readonly PageActionDef[] {
  const route = matchActionRoute(pathname);
  return route ? PAGE_ACTIONS[route] : [];
}

/**
 * ルートの形の区間名 → 実際の値。
 * 例: route `/admin/collections/[collection]` ＋ pathname `/admin/collections/posts`
 *     → `{ collection: "posts" }`
 */
export function routeParams(route: string, pathname: string): Record<string, string> {
  const routeParts = route.split("/").filter(Boolean);
  const parts = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  routeParts.forEach((segment, i) => {
    if (isParamSegment(segment) && parts[i] !== undefined) {
      params[segment.slice(1, -1)] = parts[i];
    }
  });
  return params;
}

/**
 * `href` のルート表記を実際のパスへ差し替える。
 *
 * 🚨 **値は URL として組み立てる前に encode する**。コレクション名やファイル ID に
 *    `/` や `?` が入っても行き先が壊れない（一覧の行のリンクが既にそうしている）。
 * 🚨 差し替えられなかった区間が残ったら null を返す（**壊れたリンクを描かない**）。
 *    「押しても何も起きない」より「出さない」ほうが分かる。
 */
export function resolveActionHref(
  template: string,
  params: Record<string, string>,
): string | null {
  const parts = template.split("/").filter(Boolean);
  const resolved: string[] = [];
  for (const segment of parts) {
    if (!isParamSegment(segment)) {
      resolved.push(segment);
      continue;
    }
    const value = params[segment.slice(1, -1)];
    if (value === undefined) return null;
    resolved.push(encodeURIComponent(value));
  }
  return `/${resolved.join("/")}`;
}
