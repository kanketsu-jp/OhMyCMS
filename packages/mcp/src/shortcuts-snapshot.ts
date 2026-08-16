/**
 * 画面のキーボードショートカットの写し。
 *
 * 🚨 **生成物です。手で直さないでください。**
 *   正   : `apps/studio/components/admin/shortcuts.ts` の `SHORTCUTS`
 *   作り方: `node apps/studio/scripts/build-shortcuts-manifest.mjs --json`
 *   検査  : `apps/studio/scripts/check-mcp-catalog.mjs`（ずれたら落ちます）
 *
 * ■ なぜ写しを置くのか
 *   `packages/mcp` は `apps/studio` を **import できません**（実測 2026-08-15）:
 *   依存に無い / `exports` 未定義 / studio に zod が無い。
 *   API を新設する案も在りましたが、**使う人が現れる前に口を開けない**という判断
 *   （司令塔 2026-08-16）。→ **生成された写し + ずれ検査**（`tool-catalog.json` と同じ形）。
 *
 * ■ `scope` の読み方
 *   `"global"` … どこでも効く ／ `"editor"` … 本文入力中
 *   `["page:<パス>", …]` … **その画面でだけ**効く
 *   🚨 `"unknown"` … **導出できなかった**。**"global" と読まないこと**
 *      （倒すと「どこでも効く」という嘘になり、操作する側が誤って押します）
 *
 * ■ 🚨 **キーは「いま割り当てられている値」であって、固定ではありません**
 *   堀池さん 2026-08-16 の原文:「ショートカットは必要そうなものを、なるべくたくさん
 *   用意するが、**初期は未設定（ショートカットが空）でいい**。もちろん重複はできない。」
 *   ＝ **利用者が自分で割り当てる**・**既定は空**・**重複は弾く**。
 *   🚨 いまここに入っている `key` は、実装が固定で持っている 2026-08-16 時点の値です。
 *
 * ■ 🚨 **この写しは、生成器（`build-shortcuts-manifest.mjs --json`）と同じ形のまま持ちます**
 *   ＝ ずれ検査が**直接比べるだけ**で済む。**形を変えるのは返すとき（`server.ts`）に 1 回だけ**。
 *   変換を 2 箇所に持つと、片方が必ず腐ります。
 *
 * 🚨 **押させるためのものではありません。** 操作するのは Chrome 拡張などの側で、
 *   MCP は「伝わる」側です（堀池さんの原文「Skills・MCP で伝わるように」の読み）。
 */
export type ShortcutSnapshot = {
  key: string;
  action: string;
  /** "global" / "editor" / "unknown" / ["page:…", …] */
  scope: string | string[];
  label_key: string;
  /**
   * 本文入力中に編集側が先に取るか。
   * 🚨 `owner` は **衝突しているときだけ**付く（誰が取っているか）。
   *    先頭 1 件だけ見て型を決めたら tsc に捕まった（2026-08-16）。
   */
  editor: { conflicts: boolean; owner?: readonly string[] };
};

export const SHORTCUTS_SNAPSHOT: readonly ShortcutSnapshot[] = [
  {
    "key": "mod+k",
    "action": "search",
    "scope": "global",
    "label_key": "common.shortcut_search",
    "editor": {
      "conflicts": false
    }
  },
  {
    "key": "mod+arrowleft",
    "action": "back",
    "scope": "global",
    "label_key": "common.shortcut_back",
    "editor": {
      "conflicts": false
    }
  },
  {
    "key": "mod+enter",
    "action": "save",
    "scope": [
      "page:/admin/collections/new",
      "page:/admin/collections/[collection]/fields/new",
      "page:/admin/content/[collection]/new",
      "page:/admin/content/[collection]/[id]",
      "page:/admin/files/new",
      "page:/admin/files/new-folder",
      "page:/admin/files/[id]",
      "page:/admin/settings/general",
      "page:/admin/settings/storage",
      "page:/admin/settings/sso",
      "page:/admin/settings/roles",
      "page:/admin/settings/policies",
      "page:/admin/settings/users",
      "page:/admin/settings/agents",
      "page:/admin/profile"
    ],
    "label_key": "common.shortcut_save",
    "editor": {
      "conflicts": true,
      "owner": [
        "@tiptap/core",
        "@tiptap/extension-hard-break"
      ]
    }
  },
  {
    "key": "mod+shift+enter",
    "action": "submit",
    "scope": "global",
    "label_key": "common.shortcut_submit",
    "editor": {
      "conflicts": false
    }
  },
  {
    "key": "mod+b",
    "action": "toggleLeftSidebar",
    "scope": "global",
    "label_key": "common.shortcut_toggle_left_sidebar",
    "editor": {
      "conflicts": true,
      "owner": [
        "@tiptap/extension-bold"
      ]
    }
  },
  {
    "key": "mod+j",
    "action": "toggleRightSidebar",
    "scope": "global",
    "label_key": "common.shortcut_toggle_right_sidebar",
    "editor": {
      "conflicts": false
    }
  }
] as const;

/** 導出できなかった件数。🚨 **0 でも出す**（「見ていない 0」と区別するため）。 */
export const SHORTCUTS_UNKNOWN_SCOPE = 0;
