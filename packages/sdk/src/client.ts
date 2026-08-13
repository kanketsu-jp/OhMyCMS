import { Transport, type TransportOptions } from "./http.js";
import { itemsQueryToParams } from "./query.js";
import type {
  Access,
  Actor,
  Agent,
  AssetResult,
  AssetTransform,
  Collection,
  CreateAgentInput,
  CreateAgentResult,
  CreateCollectionInput,
  Field,
  FieldSpec,
  FileListQuery,
  FileRecord,
  Folder,
  FolderListQuery,
  HealthResult,
  Item,
  ItemsListResult,
  ItemsQuery,
  Permission,
  Policy,
  Relation,
  Role,
  UploadInput,
  User,
} from "./types.js";

export type ClientOptions = TransportOptions;

function encode(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * OhMyCMS の REST クライアント。
 *
 * レスポンスの形は API 側で不統一（`{data:...}` で包むものと包まないものがある）。
 * ここで正規化して、**どのメソッドも中身だけを返す**。詳しくは README を参照。
 */
export class OhMyCmsClient {
  readonly transport: Transport;

  constructor(options: ClientOptions) {
    this.transport = new Transport(options);
  }

  /** 接続先。トークンは含まない */
  get baseUrl(): string {
    return this.transport.url;
  }

  /* ---------------- health ---------------- */

  /** GET /api/health。DB まで到達できていれば `{status:"ok",db:"connected"}` */
  health(): Promise<HealthResult> {
    return this.transport.request<HealthResult>({ path: "/api/health" });
  }

  /* ---------------- auth ---------------- */

  readonly auth = {
    /** GET /api/auth/me。Actor をそのまま返す（`{data}` で包まれない） */
    me: (): Promise<Actor> =>
      this.transport.request<Actor>({ path: "/api/auth/me" }),

    /** POST /api/auth/logout */
    logout: (): Promise<void> =>
      this.transport
        .raw({ method: "POST", path: "/api/auth/logout" })
        .then(() => undefined),

    /** GET /api/auth/google の遷移先 URL（リダイレクトは辿らない） */
    googleAuthorizeUrl: async (): Promise<string | null> => {
      const response = await this.transport.raw({ path: "/api/auth/google" });
      return response.headers.get("location");
    },

    /**
     * POST /api/auth/dev-login。**開発専用のバックドア**。
     * サーバ側で `NODE_ENV!=="production"` かつ `ALLOW_DEV_LOGIN==="true"` のときだけ動く
     * （無効なら本文の無い 404 が返る）。
     *
     * 戻り値の `sessionToken` は Set-Cookie から取り出した生トークン。
     * これを `createClient({ sessionToken })` に渡すと人間セッションとして叩ける。
     */
    devLogin: async (
      email: string,
      options: { admin?: boolean } = {},
    ): Promise<{ actor: Actor; sessionToken: string | null }> => {
      const response = await this.transport.raw({
        method: "POST",
        path: "/api/auth/dev-login",
        query: options.admin ? { admin: "true" } : undefined,
        json: { email },
        headers: { "content-type": "application/json" },
      });
      const payload = (await response.json()) as { data: Actor };
      const setCookie = response.headers.get("set-cookie");
      const match = setCookie?.match(/(?:^|;\s*)session=([^;]+)/);
      return {
        actor: payload.data,
        sessionToken: match?.[1] ? decodeURIComponent(match[1]) : null,
      };
    },
  };

  /* ---------------- agents（エージェントトークン） ---------------- */

  readonly agents = {
    /**
     * GET /api/auth/agents。自分が発行したものだけが返る。
     * **Cookie セッションが必要**（Bearer だと 403 HUMAN_AUTH_REQUIRED）。
     */
    list: (): Promise<Agent[]> =>
      this.transport.requestData<Agent[]>({ path: "/api/auth/agents" }),

    /**
     * POST /api/auth/agents。**Cookie セッションが必要**。
     * 平文トークンはこの戻り値でしか手に入らない（サーバは sha256 しか保存しない）。
     */
    create: async (input: CreateAgentInput): Promise<CreateAgentResult> => {
      const payload = await this.transport.request<{
        data: Agent;
        token: string;
      }>({ method: "POST", path: "/api/auth/agents", json: input });
      return { agent: payload.data, token: payload.token };
    },

    /** DELETE /api/auth/agents/[id]。**Cookie セッションが必要** */
    delete: (id: string): Promise<void> =>
      this.transport
        .raw({ method: "DELETE", path: `/api/auth/agents/${encode(id)}` })
        .then(() => undefined),
  };

  /* ---------------- collections（管理者のみ） ---------------- */

  readonly collections = {
    /** GET /api/collections。`system:true` で directus_* も含める */
    list: (options: { system?: boolean } = {}): Promise<Collection[]> =>
      this.transport.request<Collection[]>({
        path: "/api/collections",
        query: options.system ? { system: "true" } : undefined,
      }),

    get: (collection: string): Promise<Collection> =>
      this.transport.request<Collection>({
        path: `/api/collections/${encode(collection)}`,
      }),

    /** POST /api/collections。CREATE TABLE がその場で走る */
    create: (input: CreateCollectionInput): Promise<Collection> =>
      this.transport.request<Collection>({
        method: "POST",
        path: "/api/collections",
        json: input,
      }),

    update: (
      collection: string,
      patch: Record<string, unknown>,
    ): Promise<Collection> =>
      this.transport.request<Collection>({
        method: "PATCH",
        path: `/api/collections/${encode(collection)}`,
        json: patch,
      }),

    /** DELETE /api/collections/[collection]。DROP TABLE がその場で走る */
    delete: (collection: string): Promise<{ collection: string }> =>
      this.transport.request<{ collection: string }>({
        method: "DELETE",
        path: `/api/collections/${encode(collection)}`,
      }),
  };

  /* ---------------- fields（管理者のみ） ---------------- */

  readonly fields = {
    /** GET /api/fields。全コレクション分 */
    listAll: (): Promise<Field[]> =>
      this.transport.request<Field[]>({ path: "/api/fields" }),

    list: (collection: string): Promise<Field[]> =>
      this.transport.request<Field[]>({
        path: `/api/fields/${encode(collection)}`,
      }),

    get: (collection: string, field: string): Promise<Field> =>
      this.transport.request<Field>({
        path: `/api/fields/${encode(collection)}/${encode(field)}`,
      }),

    /** POST /api/fields/[collection]。ALTER TABLE ADD COLUMN がその場で走る */
    create: (collection: string, spec: FieldSpec): Promise<Field> =>
      this.transport.request<Field>({
        method: "POST",
        path: `/api/fields/${encode(collection)}`,
        json: spec,
      }),

    update: (
      collection: string,
      field: string,
      patch: Record<string, unknown>,
    ): Promise<Field> =>
      this.transport.request<Field>({
        method: "PATCH",
        path: `/api/fields/${encode(collection)}/${encode(field)}`,
        json: patch,
      }),

    delete: (
      collection: string,
      field: string,
    ): Promise<{ collection: string; field: string }> =>
      this.transport.request<{ collection: string; field: string }>({
        method: "DELETE",
        path: `/api/fields/${encode(collection)}/${encode(field)}`,
      }),
  };

  /* ---------------- relations（管理者のみ） ---------------- */

  readonly relations = {
    list: (): Promise<Relation[]> =>
      this.transport.request<Relation[]>({ path: "/api/relations" }),

    get: (manyCollection: string, manyField: string): Promise<Relation> =>
      this.transport.request<Relation>({
        path: `/api/relations/${encode(manyCollection)}/${encode(manyField)}`,
      }),

    create: (input: Record<string, unknown>): Promise<Relation> =>
      this.transport.request<Relation>({
        method: "POST",
        path: "/api/relations",
        json: input,
      }),

    update: (
      manyCollection: string,
      manyField: string,
      patch: Record<string, unknown>,
    ): Promise<Relation> =>
      this.transport.request<Relation>({
        method: "PATCH",
        path: `/api/relations/${encode(manyCollection)}/${encode(manyField)}`,
        json: patch,
      }),

    delete: (
      manyCollection: string,
      manyField: string,
    ): Promise<{ many_collection: string; many_field: string }> =>
      this.transport.request<{ many_collection: string; many_field: string }>({
        method: "DELETE",
        path: `/api/relations/${encode(manyCollection)}/${encode(manyField)}`,
      }),
  };

  /* ---------------- items ---------------- */

  readonly items = {
    /**
     * GET /api/items/[collection]。
     * **`meta` を指定しないと総件数は返らない**（`meta: ["total_count"]`）。
     */
    list: <T extends Item = Item>(
      collection: string,
      query?: ItemsQuery,
    ): Promise<ItemsListResult<T>> =>
      this.transport.request<ItemsListResult<T>>({
        path: `/api/items/${encode(collection)}`,
        query: itemsQueryToParams(query),
      }),

    get: <T extends Item = Item>(
      collection: string,
      id: string,
      query?: ItemsQuery,
    ): Promise<T> =>
      this.transport.requestData<T>({
        path: `/api/items/${encode(collection)}/${encode(id)}`,
        query: itemsQueryToParams(query),
      }),

    /** POST /api/items/[collection]。オブジェクトを渡せば 1 件、配列を渡せば複数件返る */
    create: <T extends Item = Item>(
      collection: string,
      payload: Partial<T>,
    ): Promise<T> =>
      this.transport.requestData<T>({
        method: "POST",
        path: `/api/items/${encode(collection)}`,
        json: payload,
      }),

    createMany: <T extends Item = Item>(
      collection: string,
      payload: Partial<T>[],
    ): Promise<T[]> =>
      this.transport.requestData<T[]>({
        method: "POST",
        path: `/api/items/${encode(collection)}`,
        json: payload,
      }),

    update: <T extends Item = Item>(
      collection: string,
      id: string,
      patch: Partial<T>,
    ): Promise<T> =>
      this.transport.requestData<T>({
        method: "PATCH",
        path: `/api/items/${encode(collection)}/${encode(id)}`,
        json: patch,
      }),

    /** DELETE /api/items/[collection]/[id]。成功時は 204（本文なし） */
    delete: (collection: string, id: string): Promise<void> =>
      this.transport
        .raw({
          method: "DELETE",
          path: `/api/items/${encode(collection)}/${encode(id)}`,
        })
        .then(() => undefined),
  };

  /* ---------------- files ---------------- */

  readonly files = {
    /** GET /api/files。limit / offset / folder のみ（meta は無い） */
    list: (query: FileListQuery = {}): Promise<FileRecord[]> =>
      this.transport.requestData<FileRecord[]>({
        path: "/api/files",
        query: {
          limit: query.limit,
          offset: query.offset,
          folder: query.folder,
        },
      }),

    get: (id: string): Promise<FileRecord> =>
      this.transport.requestData<FileRecord>({
        path: `/api/files/${encode(id)}`,
      }),

    /** POST /api/files。multipart/form-data。`file` フィールドが必須 */
    upload: (input: UploadInput): Promise<FileRecord> => {
      const form = new FormData();
      const blob =
        input.body instanceof Blob
          ? input.body
          : new Blob([input.body as BlobPart], {
              type: input.contentType ?? "application/octet-stream",
            });
      form.append("file", blob, input.filename);
      if (input.title != null) form.append("title", input.title);
      if (input.description != null) form.append("description", input.description);
      if (input.tags != null) form.append("tags", input.tags);
      if (input.folder != null) form.append("folder", input.folder);

      return this.transport.requestData<FileRecord>({
        method: "POST",
        path: "/api/files",
        body: form,
      });
    },

    update: (id: string, patch: Record<string, unknown>): Promise<FileRecord> =>
      this.transport.requestData<FileRecord>({
        method: "PATCH",
        path: `/api/files/${encode(id)}`,
        json: patch,
      }),

    delete: (id: string): Promise<void> =>
      this.transport
        .raw({ method: "DELETE", path: `/api/files/${encode(id)}` })
        .then(() => undefined),

    /**
     * GET /api/assets/[id]。実体を取り出す。
     * `contentDisposition` は API が付けた値をそのまま返す
     * （SVG/HTML は `attachment` が強制される。握りつぶさないこと）。
     */
    asset: async (
      id: string,
      transform: AssetTransform = {},
    ): Promise<AssetResult> => {
      const response = await this.transport.raw({
        path: `/api/assets/${encode(id)}`,
        query: {
          width: transform.width,
          height: transform.height,
          fit: transform.fit,
          format: transform.format,
          quality: transform.quality,
        },
      });
      const buffer = new Uint8Array(await response.arrayBuffer());
      return {
        body: buffer,
        contentType:
          response.headers.get("content-type") ?? "application/octet-stream",
        contentLength: Number(
          response.headers.get("content-length") ?? buffer.byteLength,
        ),
        contentDisposition: response.headers.get("content-disposition"),
      };
    },
  };

  /* ---------------- folders ---------------- */

  readonly folders = {
    list: (query: FolderListQuery = {}): Promise<Folder[]> =>
      this.transport.requestData<Folder[]>({
        path: "/api/folders",
        query: { limit: query.limit, offset: query.offset },
      }),

    get: (id: string): Promise<Folder> =>
      this.transport.requestData<Folder>({ path: `/api/folders/${encode(id)}` }),

    create: (input: Record<string, unknown>): Promise<Folder> =>
      this.transport.requestData<Folder>({
        method: "POST",
        path: "/api/folders",
        json: input,
      }),

    update: (id: string, patch: Record<string, unknown>): Promise<Folder> =>
      this.transport.requestData<Folder>({
        method: "PATCH",
        path: `/api/folders/${encode(id)}`,
        json: patch,
      }),

    delete: (id: string): Promise<void> =>
      this.transport
        .raw({ method: "DELETE", path: `/api/folders/${encode(id)}` })
        .then(() => undefined),
  };

  /* ---------------- roles / policies / permissions / access（管理者のみ） ---------------- */

  readonly roles = {
    list: (): Promise<Role[]> =>
      this.transport.requestData<Role[]>({ path: "/api/roles" }),
    get: (id: string): Promise<Role> =>
      this.transport.requestData<Role>({ path: `/api/roles/${encode(id)}` }),
    create: (input: Record<string, unknown>): Promise<Role> =>
      this.transport.requestData<Role>({
        method: "POST",
        path: "/api/roles",
        json: input,
      }),
    update: (id: string, patch: Record<string, unknown>): Promise<Role> =>
      this.transport.requestData<Role>({
        method: "PATCH",
        path: `/api/roles/${encode(id)}`,
        json: patch,
      }),
    delete: (id: string): Promise<void> =>
      this.transport
        .raw({ method: "DELETE", path: `/api/roles/${encode(id)}` })
        .then(() => undefined),
  };

  readonly policies = {
    list: (): Promise<Policy[]> =>
      this.transport.requestData<Policy[]>({ path: "/api/policies" }),
    get: (id: string): Promise<Policy> =>
      this.transport.requestData<Policy>({ path: `/api/policies/${encode(id)}` }),
    create: (input: Record<string, unknown>): Promise<Policy> =>
      this.transport.requestData<Policy>({
        method: "POST",
        path: "/api/policies",
        json: input,
      }),
    update: (id: string, patch: Record<string, unknown>): Promise<Policy> =>
      this.transport.requestData<Policy>({
        method: "PATCH",
        path: `/api/policies/${encode(id)}`,
        json: patch,
      }),
    delete: (id: string): Promise<void> =>
      this.transport
        .raw({ method: "DELETE", path: `/api/policies/${encode(id)}` })
        .then(() => undefined),
  };

  readonly permissions = {
    /** GET /api/permissions。`policy` でポリシー単位に絞れる */
    list: (options: { policy?: string } = {}): Promise<Permission[]> =>
      this.transport.requestData<Permission[]>({
        path: "/api/permissions",
        query: { policy: options.policy },
      }),
    get: (id: string | number): Promise<Permission> =>
      this.transport.requestData<Permission>({
        path: `/api/permissions/${encode(String(id))}`,
      }),
    create: (input: Record<string, unknown>): Promise<Permission> =>
      this.transport.requestData<Permission>({
        method: "POST",
        path: "/api/permissions",
        json: input,
      }),
    update: (
      id: string | number,
      patch: Record<string, unknown>,
    ): Promise<Permission> =>
      this.transport.requestData<Permission>({
        method: "PATCH",
        path: `/api/permissions/${encode(String(id))}`,
        json: patch,
      }),
    delete: (id: string | number): Promise<void> =>
      this.transport
        .raw({
          method: "DELETE",
          path: `/api/permissions/${encode(String(id))}`,
        })
        .then(() => undefined),
  };

  readonly access = {
    list: (): Promise<Access[]> =>
      this.transport.requestData<Access[]>({ path: "/api/access" }),
    create: (input: Record<string, unknown>): Promise<Access> =>
      this.transport.requestData<Access>({
        method: "POST",
        path: "/api/access",
        json: input,
      }),
    delete: (id: string): Promise<void> =>
      this.transport
        .raw({ method: "DELETE", path: `/api/access/${encode(id)}` })
        .then(() => undefined),
  };

  readonly users = {
    /** GET /api/users。管理者のみ。パスワードやトークンは返らない */
    list: (): Promise<User[]> =>
      this.transport.requestData<User[]>({ path: "/api/users" }),
  };
}

/** クライアントを作る。`token`（エージェント）か `sessionToken`（人間）のどちらかを渡す */
export function createClient(options: ClientOptions): OhMyCmsClient {
  return new OhMyCmsClient(options);
}
