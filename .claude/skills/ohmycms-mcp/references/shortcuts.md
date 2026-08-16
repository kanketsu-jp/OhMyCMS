# OhMyCMS のキーボードショートカット

🚨 **このファイルは生成物です。手で直さないでください。**
元は `apps/studio/components/admin/shortcuts.ts` の `SHORTCUTS`。
作り直し: `cd apps/studio && node scripts/build-shortcuts-manifest.mjs --write`
（ずれていると同じスクリプトが `exit 1` で落ちます）

## 読み方

- `key` … **記号ではなく組み合わせ**（`mod` は macOS の ⌘ / それ以外は Ctrl）。
  🚨 記号は**プラットフォームで変わる**ので、受け取った側で決めてください。
- `scope` … `global`（管理画面のどこでも）／ `page:<ルート>`（その画面だけ）／ `unknown`。
  🚨 `global` は「**登録している部品が layout から辿れる**」の意味で、
  **「いつでも効く」ではありません**（例: `submit` は入力欄が開いている間だけ）。
- `editor` … 🚨 **本文エディタ（Tiptap）の中では別の働きをする**もの。
  `owner` がその働きを持つパッケージ。**本文の入力中は、そちらが先です。**
- `label_key` … 画面に出す名前の辞書キー（ja / en の両方に在ることを検査で確かめています）。

```json
[
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
      "page:/admin/settings/agents"
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
]
```
