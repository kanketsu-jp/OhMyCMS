/**
 * 依存を増やさないための最小 HTTP クライアント。
 *
 * Node 24 の fetch には cookie jar が無い（受入基準8 は「A のセッション」「B のセッション」
 * 「管理者のセッション」を混ぜずに使い分ける必要がある）ので、Set-Cookie を自前で保持する。
 * jar を分けることが検証の本質なので、ここを共有 cookie で済ませてはいけない。
 */

/** セッションごとに1つ作る。jar は他の Session と混ざらない。 */
export class Session {
  /**
   * @param {string} baseUrl 例 http://localhost:3999
   * @param {string} label   ログに出す名前（admin / a / b / anon）
   */
  constructor(baseUrl, label) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.label = label;
    /** @type {Map<string,string>} name -> value */
    this.cookies = new Map();
  }

  cookieHeader() {
    if (this.cookies.size === 0) return null;
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  #store(response) {
    // getSetCookie() は Node 20+ で複数の Set-Cookie を配列で返す。
    const raw =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      // 削除指示（空値）は jar からも消す。ログアウトの検証で効く。
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /**
   * @returns {Promise<{status:number, headers:Headers, text:string, json:any|null}>}
   */
  async request(path, init = {}) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers ?? {});
    const cookie = this.cookieHeader();
    if (cookie) headers.set("cookie", cookie);

    let response;
    try {
      response = await fetch(url, { ...init, headers, redirect: "manual" });
    } catch (error) {
      // 接続できない場合も「実測値」として扱う（起動前の 000 と同じ扱い）。
      return {
        status: 0,
        headers: new Headers(),
        text: String(error?.message ?? error),
        json: null,
        url,
      };
    }

    this.#store(response);
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, headers: response.headers, text, json, url };
  }

  get(path, init) {
    return this.request(path, { ...init, method: "GET" });
  }

  postJson(path, body, init) {
    return this.request(path, {
      ...init,
      method: "POST",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      body: JSON.stringify(body),
    });
  }

  patchJson(path, body, init) {
    return this.request(path, {
      ...init,
      method: "PATCH",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      body: JSON.stringify(body),
    });
  }

  delete(path, init) {
    return this.request(path, { ...init, method: "DELETE" });
  }
}

/**
 * ベース URL が応答するまで待つ。
 * @returns {Promise<number>} 最後に観測した HTTP ステータス（届かなければ 0）
 */
export async function waitForHealth(baseUrl, { timeoutMs = 120_000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    const probe = new Session(baseUrl, "probe");
    const response = await probe.get("/api/health");
    last = response.status;
    if (response.status === 200) return 200;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

/** 一度だけ叩いてステータスを返す。「起動前は 200 にならない」の裏取りに使う。 */
export async function probeStatus(baseUrl, path = "/api/health") {
  const probe = new Session(baseUrl, "probe");
  const response = await probe.get(path);
  return response.status;
}

/**
 * 対象が**開発ビルドか本番ビルドか**を実測で見分ける。
 *
 * 🚨 「どのフラグで起動したか」で判断しない。`--base-url` を付けたかどうかは
 *   対象の性質と何の関係も無く、そこで判断すると**開発ビルドの結果を本番の結果として
 *   記録してしまう**（2026-08-13 に実際にこの穴があった）。
 *
 * 見分け方: `POST /api/auth/dev-login` を**空ボディで**叩く。
 *   400 INVALID_EMAIL → dev-login が存在する = **開発ビルド**
 *   404（本文なし）   → 分岐ごと消えている = **本番ビルド**
 *   （next build は NODE_ENV をインライン展開するので、本番成果物に dev-login は物理的に無い）
 * 空ボディなので**ユーザーを作らずに**判定できる。
 *
 * @returns {Promise<"dev"|"production"|"unreachable">}
 */
export async function probeBuildKind(baseUrl) {
  const probe = new Session(baseUrl, "buildkind");
  const response = await probe.postJson("/api/auth/dev-login", {});
  if (response.status === 0) return "unreachable";
  if (response.status === 404) return "production";
  return "dev";
}

/**
 * **対象が実際に動かしているコードの版**を取る。
 *
 * 🚨 リポジトリの HEAD は「対象の版」ではない。
 *   studio-acc は Dockerfile の `COPY . .` で**ビルド時のコードを焼き込む**（volumes マウントは無い）。
 *   だから作業ツリーを更新しても、**焼き直すまで対象は古いまま**。
 *   実測（2026-08-13）: 作業ツリーに /api/auth/setup があるのに、
 *   :3103 のコンテナには無く 404 だった。HEAD を見出しに出すと**嘘になる**。
 *
 * 版は `/api/version` の `commit`（`OHMYCMS_GIT_COMMIT` 由来）から取る。
 * 渡されていなければ null。**null を「一致している」と解釈しないこと。**
 *
 * @returns {Promise<string|null>}
 */
export async function probeTargetCommit(baseUrl) {
  // 🚨 開発ビルドだけでなく**本番ビルドでも**版を取る。
  //   本番こそ「どの版を測ったか」が要る（出荷物の証明になるため）。
  const { establishSession } = await import("./session.mjs");
  const auth = await establishSession(baseUrl, { label: "version" });
  if (!auth.ok) return null;
  const response = await auth.session.get("/api/version");
  if (response.status !== 200) return null;
  const commit = response.json?.data?.commit;
  return typeof commit === "string" && commit.trim() !== "" && commit !== "unknown"
    ? commit.trim()
    : null;
}
