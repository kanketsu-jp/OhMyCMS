---
name: ohmycms-mcp
description: OhMyCMS の MCP を設定したい、エージェントトークンを発行したい、MCP でコレクションを操作したい、OhMyCMS に Claude/Codex から接続したいときに使う。
---

# OhMyCMS MCP

OhMyCMS の MCP サーバは `packages/mcp` にある stdio サーバです。`@ohmycms/sdk` 経由で REST API を呼び、DB へは直結しません。

## 接続手順

1. `/admin/settings/agents` でエージェントトークンを発行する。
2. `packages/mcp/README.md` の `claude mcp add` の要領で登録する。`OHMYCMS_URL` は接続先 URL、`OHMYCMS_TOKEN` は発行したトークンを指定する。
3. `claude mcp list` を実行し、`ohmycms` が `✔ Connected` になっていることを確認する。

## ツール一覧

`packages/mcp/src/server.ts` の `registerTool(...)` から実測したツールは 20 件です。

| ツール | 何をするか | 必要な権限 |
|---|---|---|
| `ohmycms_health` | API と DB までの疎通を確認する | 不要 |
| `ohmycms_collections_list` | コレクション一覧と列情報を取得する | `schema:read` |
| `ohmycms_collection_get` | 指定コレクションの定義を取得する | `schema:read` |
| `ohmycms_fields_list` | 指定コレクションのフィールド一覧を取得する | `schema:read` |
| `ohmycms_collection_create` | コレクションを作成し PostgreSQL に `CREATE TABLE` を実行する | `schema:write` |
| `ohmycms_field_create` | 既存コレクションへフィールドを追加し `ALTER TABLE` を実行する | `schema:write` |
| `ohmycms_items_query` | コレクションの行を検索・ページングして取得する | 対象コレクションの `read` |
| `ohmycms_item_get` | 主キーで行を 1 件取得する | 対象コレクションの `read` |
| `ohmycms_item_create` | 行を 1 件作成する | 対象コレクションの `create` |
| `ohmycms_item_update` | 行を 1 件更新する | 対象コレクションの `update` |
| `ohmycms_files_list` | アップロード済みファイル一覧を取得する | `directus_files` の `read` |
| `ohmycms_permissions_describe` | 現在のトークンで何ができるかを API へ実際に問い合わせて返す | 不要 |
| `ohmycms_roles_list` | ロール一覧を取得する | `settings:read` |
| `ohmycms_role_create` | ロールを作成する | `settings:write` |
| `ohmycms_policies_list` | ポリシー一覧を取得する | `settings:read` |
| `ohmycms_policy_create` | ポリシーを作成する | `settings:write` |
| `ohmycms_permissions_list` | ポリシーに紐づく権限一覧を取得する | `settings:read` |
| `ohmycms_permission_create` | ポリシーへコレクション操作権限を追加する | `settings:write` |
| `ohmycms_access_create` | ユーザーまたはロールへポリシーを結び付ける | `settings:write` |
| `ohmycms_users_list` | ユーザー一覧を取得する | `settings:read` |

## 設計の要点

コレクション名はツールの引数（自由文字列）なので、GUI で新しいコレクションを作れば、MCP のツールを追加しなくても即座に使える。

MCP 側では権限を判定しません。403 / 404 は OhMyCMS API が出した結論をそのまま返します。

## 秘密の扱い

エージェントトークンは発行直後の 1 回しか画面に表示されません。紛失したら既存トークンを失効し、再発行してください。トークンの生値をログ、コミット、チャット、Issue、スクリーンショットに貼らないでください。
