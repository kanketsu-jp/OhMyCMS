import { isApiErrorBody, OhMyCmsError } from "./errors.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type TransportOptions = {
  /** 例: `http://localhost:3000`。末尾の `/` は落とす */
  baseUrl: string;
  /** エージェントトークン。`Authorization: Bearer <token>` として送る */
  token?: string | undefined;
  /**
   * 人間セッションの生トークン。`Cookie: session=<value>` として送る。
   * Bearer と同時に指定した場合、API 側は Bearer を優先する（lib/auth/context.ts）。
   */
  sessionToken?: string | undefined;
  /** 追加ヘッダ。Authorization / Cookie を上書きすることもできる */
  headers?: Record<string, string> | undefined;
  /** 差し替え用。既定は globalThis.fetch（Node 22+ に標準搭載） */
  fetch?: FetchLike | undefined;
  /** ミリ秒。既定 30000。0 以下で無効 */
  timeoutMs?: number | undefined;
};

export type RequestOptions = {
  method?: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON として送る本文 */
  json?: unknown;
  /** そのまま送る本文（FormData など）。json と併用しない */
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: RequestOptions["query"],
): string {
  const url = new URL(
    path.startsWith("/") ? path : `/${path}`,
    `${stripTrailingSlash(baseUrl)}/`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const text = await response.text();
  if (text === "") return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return text;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * REST API への薄いトランスポート。
 * ここだけが fetch を知っている（リソース層は path と型だけ扱う）。
 */
export class Transport {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: TransportOptions) {
    if (!options.baseUrl) {
      throw new Error("baseUrl は必須です（例: http://localhost:3000）");
    }
    this.baseUrl = stripTrailingSlash(options.baseUrl);
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new Error(
        "fetch が見つかりません。Node 22 以上で動かすか、options.fetch を渡してください",
      );
    }
    this.fetchImpl = fetchImpl.bind(globalThis) as FetchLike;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** 現在の接続先。ログ・エラー表示用（トークンは含めない） */
  get url(): string {
    return this.baseUrl;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.options.token) {
      headers.authorization = `Bearer ${this.options.token}`;
    } else if (this.options.sessionToken) {
      headers.cookie = `session=${encodeURIComponent(this.options.sessionToken)}`;
    }
    return { ...headers, ...this.options.headers };
  }

  /** 生の Response を返す（アセット配信のようにヘッダを見たいとき用） */
  async raw(options: RequestOptions): Promise<Response> {
    const method = options.method ?? "GET";
    const url = buildUrl(this.baseUrl, options.path, options.query);

    const headers: Record<string, string> = {
      ...this.authHeaders(),
      ...options.headers,
    };

    let body: BodyInit | undefined = options.body;
    if (options.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.json);
    }

    const controller = new AbortController();
    const timer =
      this.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : undefined;
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: "manual",
      });
    } catch (cause) {
      const aborted = controller.signal.aborted;
      throw new OhMyCmsError(
        0,
        aborted ? "TIMEOUT" : "NETWORK_ERROR",
        aborted
          ? `${method} ${url} がタイムアウトしました（${this.timeoutMs}ms）`
          : `${method} ${url} へ接続できませんでした`,
        { method, url, body: null, cause },
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!response.ok) {
      const parsed = await parseBody(response);
      const code = isApiErrorBody(parsed) ? parsed.error.code : "HTTP_ERROR";
      const message = isApiErrorBody(parsed)
        ? parsed.error.message
        : `${method} ${url} が ${response.status} を返しました`;
      throw new OhMyCmsError(response.status, code, message, {
        method,
        url,
        body: parsed,
      });
    }

    return response;
  }

  /** JSON を返すエンドポイント用。204 / 空ボディは null */
  async request<T>(options: RequestOptions): Promise<T> {
    const response = await this.raw(options);
    return (await parseBody(response)) as T;
  }

  /**
   * `{ data: ... }` で包まれて返るエンドポイント用（items / files / roles など）。
   * 包まずに返るもの（collections / fields / relations）には使わない。
   */
  async requestData<T>(options: RequestOptions): Promise<T> {
    const payload = await this.request<{ data: T }>(options);
    return payload.data;
  }
}
