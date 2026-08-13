# @ohmycms/mcp

OhMyCMS の MCP サーバ（stdio）。LLM から CMS を操作するための入口。

**`@ohmycms/sdk` 経由で REST API を HTTP で叩くだけ。DB へは直結しない。**

```bash
bun --filter @ohmycms/sdk build && bun --filter @ohmycms/mcp build
OHMYCMS_URL=http://localhost:3999 node packages/mcp/scripts/verify.mjs   # 実際の MCP クライアントで検証
```

## Claude Code に登録する

```bash
claude mcp add ohmycms --scope local \
  --env OHMYCMS_URL=http://localhost:3000 \
  --env OHMYCMS_TOKEN=<エージェントトークン> \
  -- node /絶対パス/packages/mcp/dist/index.js

claude mcp list      # → ohmycms: … - ✔ Connected
```

トークンは `ohmycms token create --name mcp --admin-capability … --collection-capability …`
（`@ohmycms/cli`）か、管理画面の「エージェント」から発行する。

## 環境変数

| 変数 | 既定 | 説明 |
|---|---|---|
| `OHMYCMS_URL` | `http://localhost:3000` | 接続先 |
| `OHMYCMS_TOKEN` | （なし） | エージェントトークン。**未設定だと認証が要るツールは全部 401** |

🚨 **トークンはツールの応答にもログにも出さない。** 起動メッセージも接続先だけを stderr に出す
（stdio は MCP の通信路そのものなので、**stdout には MCP のメッセージ以外を書いてはいけない**）。

## 設計の原則

旧PJの調査結論に従っている（仕様 `.temp/2026-08-13/specs/F3-F5-sdk-cli-mcp.md` §4）:

- **検索プリミティブ 1 つ = ツール 1 つ。** 何でもやる万能ツールを作らない
- **サーバ側に LLM を持たない。** ここは REST を叩いて JSON を返すだけで、
  どう組み合わせるかはクライアント側（LLM）が決める
- 出力は **`outputSchema` で型を強制**する（全 20 ツールに付いている）

### 権限は API に任せる

- **MCP 側で権限を判定しない。** 403 / 404 は API が出した結論をそのまま返す
- **「管理者のときだけ使えるツール」も MCP 側では区別せず全部登録する。**
  成否は API が決める（MCP が判定すると権限が二重実装になり、必ず片方が腐る）
- MCP 側でフィルタして隠す実装をしない（隠すのではなく、API が拒否する）

## ツール

| ツール | 何をするか | 必要な権限 |
|---|---|---|
| `ohmycms_health` | 疎通確認 | 不要 |
| `ohmycms_collections_list` | コレクション一覧 | `schema:read` |
| `ohmycms_collection_get` | コレクションを1つ | `schema:read` |
| `ohmycms_fields_list` | フィールド一覧 | `schema:read` |
| `ohmycms_collection_create` | コレクション作成（`CREATE TABLE`） | `schema:write` |
| `ohmycms_field_create` | フィールド追加（`ALTER TABLE`） | `schema:write` |
| `ohmycms_items_query` | 行を絞り込んで取る | `collections` の `read` |
| `ohmycms_item_get` | 行を1件 | 同上 |
| `ohmycms_item_create` | 行を作る | `collections` の `create` |
| `ohmycms_item_update` | 行を更新 | `collections` の `update` |
| `ohmycms_files_list` | ファイル一覧 | `directus_files` の `read` |
| `ohmycms_permissions_describe` | **今のトークンで何ができるか** | 不要（結果は権限に依存） |
| `ohmycms_roles_list` / `ohmycms_policies_list` / `ohmycms_permissions_list` / `ohmycms_users_list` | 設定の読み取り | `settings:read` |
| `ohmycms_role_create` / `ohmycms_policy_create` / `ohmycms_permission_create` / `ohmycms_access_create` | 設定の編集 | `settings:write` |

### `ohmycms_permissions_describe` について

「このトークンで何ができるか」を返す。**MCP 側の推測ではなく、実際に API を叩いた結果**を載せる:

```json
{
  "actor": { "type": "agent", "name": "mcp-limited", "on_behalf_of": "…" },
  "capabilities": { "collections": { "articles": ["read", "create"] } },
  "probes": [
    { "what": "コレクション一覧の取得（schema:read）", "allowed": false, "code": "CAPABILITY_DENIED" },
    { "what": "items の読み取り: articles", "allowed": true, "detail": "1 件" }
  ],
  "readable_collections": ["articles"]
}
```

## トークンの作り方（権限の設計）

エージェントトークンの権限は **委任元ユーザーの権限 ∩ capabilities**。
`collections` と `admin` で**既定が逆**なので注意する（詳細は `packages/sdk/README.md` §2）:

```jsonc
// LLM に記事だけ書かせたい（設定は触らせない）
{ "collections": { "articles": ["read", "create", "update"] } }

// LLM にスキーマ設計まで任せたい
{
  "admin": ["schema:read", "schema:write"],
  "collections": { "articles": ["read", "create", "update", "delete"] }
}
```

🚨 **`capabilities` を指定するときは `collections` も必ず書く。**
`admin` だけ書くと「テーブルは作れるが行は 1 件も読み書きできない」トークンになる。

## エラーの返り方

ツールがエラーを返すとき（`isError: true`）、`structuredContent` に API の結論がそのまま入る:

```json
{
  "error": {
    "code": "CAPABILITY_DENIED",
    "message": "このcapabilityでは管理操作が許可されていません",
    "status": 403,
    "request": "POST http://localhost:3000/api/collections"
  }
}
```

`code` で分岐できる。`message` は日本語。**トークンは含まれない**（認証はヘッダで送っているため、
`request` の URL に混ざることはない）。

## 検証

`scripts/verify.mjs` が**本物の MCP クライアント（stdio）**でサーバに繋いで確かめる。
肯定形と否定形を必ずセットで出す:

- ツール一覧が返る / 全ツールに `outputSchema` がある
- 一般トークンで許可されたコレクションは読み書きできる（肯定形）
- 同じトークンで、capability に無いコレクションは 403 / 無いコレクションは 404（否定形）
- 設定編集ツールは**一般トークンで 403、管理者トークンで成功**（両方を出す）
- トークンが応答に一切含まれていない
