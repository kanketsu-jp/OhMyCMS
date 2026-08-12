/**
 * `lib/admin/api.ts` の Storybook 用スタブ。
 *
 * なぜ要るか: `app/(admin)/layout.tsx` などの Server Component は描画のために
 * `currentUser()` / `apiFetch()` を呼ぶ。実装は `next/headers` の cookie を
 * そのまま `fetch` の `cookie` ヘッダへ載せて自分自身の API を叩くが、
 *   - Storybook には API サーバも DB も無い
 *   - ブラウザの fetch は `cookie` を禁止ヘッダとして拒否する
 * ため、そのままでは必ず失敗する。
 *
 * 差し替えているのは **この 1 モジュールだけ**。layout / page の実装そのものは
 * 本物を import しているので、実装が変われば story も変わる(F7 の要件)。
 * 何を返すかは story の `parameters.adminApi` で切り替える。
 *
 * 注意: 型は相対パスで本物から type-only import している。
 * alias は `@/lib/admin/api` にだけ効くので、ここは循環しない。
 */

import type { ApiResult, MeResult } from "../../lib/admin/api";
import type { CollectionResult } from "../../lib/schema/models";

export type { ApiResult, MeResult };

/** story ごとに差し替えられる設定。preview.tsx のデコレータが毎回書き込む。 */
export type AdminApiFixture = {
  /** `/api/auth/me` が返す本人情報。 */
  me?: MeResult;
  /** `/api/auth/me` を失敗させる。401 にすると layout が /login へ redirect する。 */
  meStatus?: number;
  /** `/api/collections` が返す一覧。 */
  collections?: Pick<CollectionResult, "collection">[];
  /** `/api/collections` を失敗させる。 */
  collectionsFails?: boolean;
};

const DEFAULT_FIXTURE: Required<Pick<AdminApiFixture, "me" | "collections">> = {
  me: {
    type: "human",
    userId: "user_01",
    email: "editor@example.com",
    role: "admin",
  },
  collections: [
    { collection: "articles" },
    { collection: "authors" },
    { collection: "categories" },
  ],
};

let fixture: AdminApiFixture = {};

/** preview.tsx のデコレータから呼ぶ。 */
export function setAdminApiFixture(next: AdminApiFixture | undefined): void {
  fixture = next ?? {};
}

function fail(status: number): ApiResult<never> {
  return { ok: false, status, message: `stubbed failure (${status})` };
}

export async function requestOrigin(): Promise<string> {
  return "http://storybook.local";
}

export async function currentUser(): Promise<ApiResult<MeResult>> {
  if (fixture.meStatus && fixture.meStatus >= 400) return fail(fixture.meStatus);
  return { ok: true, status: 200, data: fixture.me ?? DEFAULT_FIXTURE.me };
}

export async function apiFetch<T>(path: string): Promise<ApiResult<T>> {
  if (path.startsWith("/api/auth/me")) {
    return (await currentUser()) as ApiResult<T>;
  }
  if (path.startsWith("/api/collections")) {
    if (fixture.collectionsFails) return fail(500);
    const list = fixture.collections ?? DEFAULT_FIXTURE.collections;
    return {
      ok: true,
      status: 200,
      data: list.map((c) => ({
        collection: c.collection,
        meta: null,
        schema: null,
      })) as T,
    };
  }
  // 未対応のパスは「見つからない」で返す。story 側で気づけるように 404 にする。
  return fail(404);
}
