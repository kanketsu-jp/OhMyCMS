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
[]
```

## 🚨 この一覧が見ていない範囲：**モードで出し分ける画面**

下の画面は「表示モード」と「編集モード」に分かれていて、**開いた直後は保存できません**
（「編集する」を押してから保存できるようになります）。
🚨 **この一覧は表示モードの状態しか見ていません。** そのため:

- 保存が編集モードにしか無い画面は、`save` の `scope` に**出ません**（効かないように見えます）
- 逆に `scope` に出ていても、**開いた直後は効きません**（「編集する」を押すまで）

🚨 **該当する画面は 7 件**（0 件なら探し方が壊れています。この生成器が落ちます）:

- `/admin/content/[collection]/[id]`
- `/admin/content/[collection]/new`
- `/admin/files/[id]`
- `/admin/profile`
- `/admin/settings/general`
- `/admin/settings/sso`
- `/admin/settings/storage`

実測（2026-08-16・ヘッドレスで送信を横取りして止めた状態）:
`/admin/settings/general` は表示モードで ⌘Enter → 送信 **0 件**、
「編集する」を押してから ⌘Enter → 送信 **1 件**（`settings-form`）。
🚨 **元になっている表（`PAGE_ACTIONS`）がモードを表せない**ため、ここは導出できません。
表にモードの欄が入り次第、この節は導出に置き換わります。

## 🚨 さらに：**押せる状態でないと効かない**画面

保存ボタンが `disabled` のとき、**⌘Enter も効きません**
（`page-action.tsx` がショートカット側でも `disabled` を見ているため。
「押せないボタンの働きを鍵から起こさない」）。
🚨 **モードだけでなく「保存できる状態か」でも変わります。**

🚨 **保存を止めている画面は 7 件**（0 件なら拾い方が壊れています。この生成器が落ちます）:

- `/admin/collections/[collection]` … 押せない条件: `fieldName.trim() === ""`
- `/admin/collections/[collection]/fields/new` … 押せない条件: `fieldName.trim() === ""`
- `/admin/settings/policies` … 押せない条件: `!name.trim()`
- `/admin/settings/roles` … 押せない条件: `!name.trim()`
- `/admin/settings/sso` … 押せない条件: `!ready`
- `/admin/settings/storage` … 押せない条件: `!dirty`
- `/admin/settings/users` … 押せない条件: `assignDisabled`

実測（2026-08-16）: `/admin/settings/storage` は編集モードでも**何も変えなければ** ⌘Enter で
送信 **0 件**。値を 1 つ変えると送信 **1 件**（`storage-settings-form`）。
🚨 **「効かない」ではなく「保存できる状態のときだけ効く」**です。
🚨 こちらは**条件式ごと導出しています**（上のモードの節と違い、推測ではありません）。

## 🚨 本文エディタが押さえている組み合わせ（**割り当ててはいけない側**）

本文（Tiptap）の中では、下の組み合わせは**エディタの働き**になります。
🚨 **新しいショートカットを割り当てるときは、ここと被らせないでください。**
被らせると「入力欄の外では効いて、中では効かない」という**説明できない挙動**になります。

出どころは `apps/studio/scripts/tiptap-combos.mjs`（`node_modules` の Tiptap から抽出）。
🚨 **動的に決まるものが 1 件、読めなかったパッケージが 1 件あります**（＝ **この一覧は下限です**）。

| 組み合わせ | どの働きか（パッケージ） |
| --- | --- |
| `alt+mod+0` | @tiptap/extension-paragraph |
| `alt+mod+c` | @tiptap/extension-code-block |
| `mod+\u044f` | @tiptap/extensions |
| `mod+a` | @tiptap/core |
| `mod+b` | @tiptap/extension-bold |
| `mod+backspace` | @tiptap/extension-table / @tiptap/core / @tiptap/extension-list |
| `mod+delete` | @tiptap/extension-table / @tiptap/core / @tiptap/extension-list |
| `mod+e` | @tiptap/extension-code |
| `mod+enter` | @tiptap/core / @tiptap/extension-hard-break |
| `mod+i` | @tiptap/extension-italic |
| `mod+shift+7` | @tiptap/extension-list |
| `mod+shift+8` | @tiptap/extension-list |
| `mod+shift+9` | @tiptap/extension-list |
| `mod+shift+b` | @tiptap/extension-blockquote |
| `mod+shift+s` | @tiptap/extension-strike |
| `mod+u` | @tiptap/extension-underline |
| `mod+y` | @tiptap/extensions |
| `mod+z` | @tiptap/extensions |
