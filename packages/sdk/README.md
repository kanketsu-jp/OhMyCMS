# @ohmycms/sdk

OhMyCMS の REST API を型付きで叩くクライアント。**CLI (`@ohmycms/cli`) と MCP サーバ (`@ohmycms/mcp`) が共用する。**

- 実行時依存 **ゼロ**。HTTP は Node 22+ 標準の `fetch`（axios 等は入れない）
- **DB へ直接繋がない。** 権限の強制点をサーバの API 層 1 箇所に保つため（`knex` / `pg` は依存に入れない）
- ビルドは `tsup`（ESM + CJS + `.d.ts` を 1 コマンドで出せて、設定が 10 行で済むため）

```bash
pnpm --filter @ohmycms/sdk build       # dist を出す
pnpm --filter @ohmycms/sdk typecheck   # tsc --noEmit
OHMYCMS_URL=http://localhost:3000 node packages/sdk/scripts/smoke.mjs   # 起動中の API に実際に叩く
```

## 使い方

```ts
import { createClient, isOhMyCmsError } from "@ohmycms/sdk";

const cms = createClient({
  baseUrl: "http://localhost:3000",
  token: process.env.OHMYCMS_TOKEN,   // エージェントトークン（Authorization: Bearer）
});

const { data, meta } = await cms.items.list("articles", {
  filter: { _and: [{ status: { _eq: "published" } }, { views: { _gte: 100 } }] },
  fields: ["id", "title", "author.name"],
  sort: ["-views"],
  limit: 20,
  meta: ["total_count", "filter_count"],
});

try {
  await cms.collections.list();
} catch (error) {
  if (isOhMyCmsError(error) && error.isForbidden) {
    // 例: CAPABILITY_DENIED / このcapabilityでは管理操作が許可されていません
    console.error(error.code, error.message);
  }
}
```

---

# 実測した API の形

> 2026-08-13 に `apps/studio` のコードを読み、**起動中の API へ実際に HTTP を投げて確認**した内容
> （dev サーバ `:3000` と、Docker の受入用コンテナ `:3999` の両方で実測）。
> 推測は含めていない。確認していない事項は「未検証」と明記している。
> 他トラック（CLI / MCP / 管理画面 / i18n）が同じことを読み直さなくて済むように残してある。

## 1. 認証 — 二階建て。Bearer は「エージェント」専用

出典: `apps/studio/lib/auth/context.ts` の `resolveActor()`

| 送るもの | 解決されるアクター | 備考 |
|---|---|---|
| `Authorization: Bearer <token>` | **`agent` のみ** | `agent_principals` を sha256 照合。失効・期限切れは 401 |
| `Cookie: session=<生トークン>` | `human` | `directus_sessions` を sha256 照合。HttpOnly / SameSite=Lax / Secure は本番のみ |

🚨 **Bearer で「人間ユーザー」になる経路は存在しない。** `directus_users.token` 列はあるが未使用。
🚨 **Bearer と Cookie を両方送ると Bearer が勝つ**（`resolveActor` が Bearer を先に見て即 return する）。

**エージェントの権限は、委任元ユーザー（`on_behalf_of`）のポリシーから決まる**（`lib/permissions/resolve.ts`）。
つまり「管理者トークン」＝**管理者ユーザーが発行したエージェントトークン**。トークン自体に管理者フラグは無い。

実測（`Authorization` の形と応答）:

```
$ curl -sS -w '\n%{http_code}\n' localhost:3000/api/collections
{"error":{"code":"UNAUTHENTICATED","message":"認証が必要です"}}            401

$ curl ... -H 'authorization: Token abc'
{"error":{"code":"INVALID_BEARER_TOKEN","message":"Bearer トークンが不正です"}}   401

$ curl ... -H 'authorization: Bearer deadbeef-invalid'
{"error":{"code":"INVALID_AGENT_TOKEN","message":"エージェントトークンが無効です"}} 401
```

### セッションを取る手段は 2 つしかない

1. `GET /api/auth/google` → Google OAuth（リダイレクト）
2. `POST /api/auth/dev-login` — **開発専用バックドア**。サーバ側が `NODE_ENV!=="production"` かつ
   `ALLOW_DEV_LOGIN==="true"` のときだけ動く。無効時は**本文の無い 404**（JSON ではない）

🚨 **ID / パスワードでログインする API は存在しない。** そのため CLI は「人間が発行したトークンを預かって動く」設計にしてある
（司令塔決定・2026-08-13）。

## 2. エージェントトークン（`/api/auth/agents`）

🚨 **発行には Cookie セッションが必須。** `requireHumanActor` を通るので、
**エージェントトークンで新しいトークンを発行することはできない**（403 `HUMAN_AUTH_REQUIRED`）。

```
POST /api/auth/agents          （Cookie セッション必須）
  body: { name: string, expires_in_days: 1..365 の整数,
          origin?: string, tenant_scope?: object|null, capabilities?: object|null }
  200:  { "data": { id, name, on_behalf_of, tenant_scope, capabilities,
                    origin, expires_at, revoked_at, created_at },
          "token": "<平文・43文字・この1回だけ>" }

GET    /api/auth/agents        自分（on_behalf_of = 自分）のものだけ返る。token は返らない
DELETE /api/auth/agents/[id]   204
```

- サーバは **sha256 しか保存しない**。平文トークンは POST の戻り値でしか手に入らない
- `tenant_scope` を渡すと、items の全クエリにその行フィルタが AND で足される

### 🚨 capabilities の既定が `collections` と `admin` で逆（2026-08-13 の F2-0 で追加された）

```jsonc
{
  "collections": { "articles": ["read", "create", "update", "delete"] },
  "admin": ["schema:read", "schema:write", "settings:read", "settings:write"]
}
```

| `capabilities` の値 | items（行の読み書き） | 管理系（collections / fields / roles / policies / …） |
|---|---|---|
| **未指定（null）** | ✅ 委任元ユーザーの権限をそのまま継承 | ❌ 全部 403 `CAPABILITY_DENIED` |
| `{admin:[…]}` **だけ** | ❌ **全部 403 `PERMISSION_DENIED`** | ✅ 指定した範囲だけ |
| `{admin:[…], collections:{…}}` | ✅ 列挙したコレクションだけ | ✅ 指定した範囲だけ |

🚨 **`capabilities` を一度でも指定したら `collections` も必ず書く。**
`capabilityAllows()` は `capabilities` が `null` のときだけ継承し、オブジェクトが入っていると
`capabilities.collections[<名前>]` の**完全一致**でしか許可しない。`admin` だけ渡したトークンは
「テーブルは作れるが行は 1 件も読み書きできない」になる（実測で確認済み）。

さらに **`collections` にワイルドカードが無い**ため、「管理操作もできて全コレクションの行も扱える」
トークンは現状**表現できない**（コレクションは GUI で後から増えるので発行時の列挙は原理的に無理）。
→ 司令塔へ報告済み。API 側の対応が入ったらこの節を直すこと。

`admin` に指定できるのは `schema:read` / `schema:write` / `settings:read` / `settings:write`
（`ALL_ADMIN_CAPABILITIES` としてエクスポートしている）。

## 3. `filter` 記法（items）

出典: `apps/studio/lib/items/filter.ts` / `lib/items/query.ts`

**クエリパラメータに JSON を URL エンコードして渡す。** `?filter={"status":{"_eq":"published"}}`

| 分類 | 使えるもの |
|---|---|
| 比較 | `_eq` `_neq` `_lt` `_lte` `_gt` `_gte` |
| 集合 | `_in` `_nin`（配列またはカンマ区切り文字列） |
| NULL | `_null` `_nnull`（真偽値） |
| 文字列 | `_contains` `_ncontains` `_icontains`（大小無視） `_starts_with` `_ends_with` |
| 範囲 | `_between` `_nbetween`（2 要素の配列） |
| 空 | `_empty` `_nempty`（NULL または空文字） |
| 論理 | `_and` `_or`（配列） |

- 演算子を省くと `_eq`: `{"status":"published"}` == `{"status":{"_eq":"published"}}`
- **ネストしたオブジェクトはリレーション先の絞り込み**: `{"author":{"name":{"_eq":"x"}}}`
- 未対応の演算子は 400 `UNSUPPORTED_OPERATOR`（実測: `未対応の演算子です: _bogus`）

併用できるクエリ:

| パラメータ | 形 | 備考 |
|---|---|---|
| `fields` | カンマ区切り | ドットでリレーション（`author.name`）。末尾に `*` を置ける。**未指定なら権限で許された列だけが既定になる** |
| `sort` | カンマ区切り | 先頭 `-` で降順。**実列のみ**（ドット不可 → 400 `INVALID_SORT`） |
| `deep` | JSON | リレーション先の `_filter` / `_sort` / `_limit` |

## 4. ページネーション

| パラメータ | 既定 | 上限・注意 |
|---|---|---|
| `limit` | **100** | 最大 **1000**（超えると 400 `INVALID_LIMIT`）。`-1` は 10000 で頭打ち |
| `offset` | 0 | 負数は 400 |
| `page` | — | **1 始まり**。指定すると `offset = (page-1) * limit` で上書きされる |
| `meta` | **なし** | 🚨 **指定しないと総件数は返らない**。`meta=total_count,filter_count` |

```
GET /api/items/sdk_probe?meta=total_count,filter_count&sort=views
→ {"data":[...3件...],"meta":{"total_count":3,"filter_count":3}}

GET /api/items/sdk_probe?filter={"views":{"_gte":20}}&meta=filter_count,total_count
→ {"data":[...2件...],"meta":{"total_count":3,"filter_count":2}}
```

- `total_count` = フィルタ**なし**の件数（権限の行フィルタは効く） / `filter_count` = フィルタ**あり**の件数
- 🚨 **`/api/files` と `/api/folders` は `limit` / `offset` のみ。`meta` も `filter` も無い**
- 🚨 **files / folders の権限は `directus_files` / `directus_folders` という名前のコレクション権限**として設定する。
  エージェントトークンの `capabilities.collections` にもこの名前を書く必要がある
  （2026-08-13 の F2-0 で認可が入った。それ以前は認証だけで誰でも読み書きできた）

## 5. エラーレスポンス

**形は 1 つ**（`apps/studio/lib/schema/api.ts` の `errorResponse`）:

```json
{ "error": { "code": "PERMISSION_DENIED", "message": "権限がありません" } }
```

`message` は**日本語**。UI で辞書を引くときは `code` を使う。

| status | code | message（実測） |
|---|---|---|
| 400 | `INVALID_BODY` | JSONオブジェクトを指定してください |
| 400 | `INVALID_FILTER` | filterはJSONオブジェクトで指定してください |
| 400 | `UNSUPPORTED_OPERATOR` | 未対応の演算子です: `<op>` |
| 400 | `UNKNOWN_FIELD` / `UNKNOWN_RELATION` | 存在しない列です / 存在しないリレーションです |
| 400 | `INVALID_LIMIT` | limitは最大1000です / limitは0以上、または-1で指定してください |
| 400 | `INVALID_OFFSET` / `INVALID_PAGE` / `INVALID_SORT` / `INVALID_FIELDS` / `INVALID_META` / `INVALID_DEEP` | — |
| 400 | `INVALID_FIELD_TYPE` | 未対応の型です: `<type>` |
| 400 | `INVALID_AGENT_BODY` / `INVALID_AGENT_EXPIRATION` | `<key>` は必須です / expires_in_days は 1 から 365 の整数で指定してください |
| 400 | `INVALID_EMAIL` | emailを指定してください |
| 400 | `FILE_REQUIRED` | fileフィールドにファイルを指定してください |
| 401 | `UNAUTHENTICATED` | 認証が必要です |
| 401 | `INVALID_BEARER_TOKEN` | Bearer トークンが不正です |
| 401 | `INVALID_AGENT_TOKEN` | エージェントトークンが無効です |
| 401 | `INVALID_SESSION` | セッションが無効です |
| 401 | `DELEGATED_USER_NOT_FOUND` | 委任元ユーザーが見つかりません |
| 403 | `PERMISSION_DENIED` | 権限がありません |
| 403 | `ADMIN_ACCESS_REQUIRED` | 管理者権限が必要です（委任元ユーザーが管理者でない） |
| 403 | `CAPABILITY_DENIED` | このcapabilityでは管理操作が許可されていません（トークンの `admin` が足りない） |
| 403 | `HUMAN_AUTH_REQUIRED` | 人間のセッション認証が必要です |
| 403 | `FIELD_FORBIDDEN` | 許可されていないフィールドです: `<field>` |
| 403 | `SYSTEM_COLLECTION_FORBIDDEN` | システムテーブルはitems APIからアクセスできません |
| 403 | `INVALID_TENANT_SCOPE` | エージェントのtenantScopeが不正です |
| 404 | `COLLECTION_NOT_FOUND` | コレクションが見つかりません |
| 404 | `ITEM_NOT_FOUND` | アイテムが見つかりません |
| 500 | `INVALID_PERMISSION_FILTER` | 権限フィルタが不正です |
| 500 | `INTERNAL_ERROR` | （例外の message がそのまま出る） |

**この形に従わない例外が 3 つある**（SDK 側で吸収済み）:

1. `DELETE` 系の成功 → **204・本文なし**（items / files / folders / roles / policies / permissions / access / agents）
2. `POST /api/auth/dev-login` が無効なとき → **404・本文なし**（JSON ではない）
3. `GET /api/auth/google` → **リダイレクト**（302 + `Location`）

## 6. 🚨 レスポンスの包み方が 2 種類ある

**同じ API の中で `{data:...}` で包むものと包まないものが混在している。**
SDK は**どちらも中身だけを返す**ように正規化してある（呼び出し側はこの差を意識しなくてよい）。
将来 API 側を揃えるときの資料として、実測した対応表を残す。

| 包まない（そのまま返る） | 包む（`{ "data": ... }`） |
|---|---|
| `GET/POST /api/collections` | `GET/POST /api/items/[collection]` |
| `GET/PATCH/DELETE /api/collections/[collection]` | `GET/PATCH /api/items/[collection]/[id]` |
| `GET /api/fields` | `GET/POST /api/files`, `GET/PATCH /api/files/[id]` |
| `GET/POST /api/fields/[collection]` | `GET/POST /api/folders`, `GET/PATCH /api/folders/[id]` |
| `GET/PATCH/DELETE /api/fields/[collection]/[field]` | `GET /api/users` |
| `GET/POST /api/relations` | `GET/POST /api/roles`, `GET/PATCH /api/roles/[id]` |
| `GET/PATCH/DELETE /api/relations/[mc]/[mf]` | `GET/POST /api/policies`, `GET/PATCH /api/policies/[id]` |
| `GET /api/auth/me`（Actor が裸で返る） | `GET/POST /api/permissions`, `GET/PATCH /api/permissions/[id]` |
| `GET /api/health` → `{"status":"ok","db":"connected"}` | `GET/POST /api/access` |
| | `POST /api/auth/dev-login` |
| | `GET/POST /api/auth/agents`（＋ POST は `token` が **`data` の外**にある） |

ステータスコードも揃っていない: `POST /api/collections` と `POST /api/fields/[c]` は **200**、
`POST /api/items/[c]` `POST /api/files` `POST /api/roles` などは **201**。

## 7. 権限の効き方（SDK の呼び出し側が知っておくこと）

| エンドポイント群 | 必要な権限 |
|---|---|
| `/api/collections` `/api/fields` `/api/relations` | 委任元が**管理者**、かつトークンの `admin` に `schema:read` / `schema:write` |
| `/api/roles` `/api/policies` `/api/permissions` `/api/access` `/api/users` | 委任元が**管理者**、かつトークンの `admin` に `settings:read` / `settings:write` |
| `/api/items/**` | `directus_permissions` の行・列単位の権限 ∩ トークンの `collections`。無ければ 403 `PERMISSION_DENIED` |
| `/api/files/**` `/api/folders/**` `/api/assets/[id]` | `directus_files` / `directus_folders` を**コレクション名として** `resolvePermission` にかける。行フィルタも効く |
| `/api/auth/agents/**` | Cookie セッション（人間）必須 |

権限で見えない**行**は 403 ではなく **404 `ITEM_NOT_FOUND`** になる（行フィルタが WHERE に足されるため）。
権限で見えない**列**を明示指定すると 403 `FIELD_FORBIDDEN`。

## 8. 未検証（unverified）

このリリース時点で **確認できていない**もの:

- `GET /api/auth/google` → `/api/auth/google/callback` の OAuth 往復（Google の資格情報が要るため未実施）
- `POST /api/files` のアップロードと `GET /api/assets/[id]` の実挙動（SVG/HTML の `attachment` 強制を含む）。
  SDK にメソッドは用意してあるが**実 HTTP で叩いていない**
- `relations` の作成・更新（`POST /api/relations` の body の形は `lib/schema/service.ts` を読んだだけ）
- `deep` パラメータの実挙動（型と直列化のみ実装。実データでの検証はしていない）
- `tenant_scope` を設定したエージェントトークンでの行フィルタ

---

## SDK の設計メモ

- **エラーは必ず例外** (`OhMyCmsError`)。`status` / `code` / `detail.body` を持ち、
  `isUnauthenticated` / `isForbidden` / `isNotFound` / `isNetworkError` で分岐できる。
  ネットワーク到達前の失敗は `status: 0`（`NETWORK_ERROR` / `TIMEOUT`）
- **トークンをログ・戻り値に出さない。** `client.baseUrl` は接続先だけを返す
- `createClient({ token })` = エージェント / `createClient({ sessionToken })` = 人間セッション。
  両方渡した場合は API 側の挙動に合わせて **Bearer が優先**される
- タイムアウトは既定 30 秒（`timeoutMs` で変更、0 以下で無効）
