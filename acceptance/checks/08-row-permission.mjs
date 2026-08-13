/**
 * 受入基準8: 他人の行に ID を直打ちしても 403/404。
 *          （フィルタで隠しているだけになっていない）
 *
 * `.temp/2026-08-13/f0c/f0c-test8.sh` を読んで、ハーネス用に再実装したもの。
 *
 * 🚨 このチェックの肝は「否定形が自明に成立しないこと」。
 *   「A に B の行が見えない」は、B の行が存在しなければ常に真になる。
 *   なので順番を必ず守る:
 *     1) 管理者で B の行を作り、**管理者からは見える**ことを確認（＝行は実在する）
 *     2) A が**自分の行は見える**ことを確認（＝A の権限は生きている）
 *     3) そのうえで A から B の行が見えない・書けない・消せないことを確認
 *
 * 後片付け: 作るものはすべて acc- 接頭辞。最後に消す。
 *   消せないもの（ユーザー行）は cleanupLeftovers に積んで一覧を出す。
 */

import { Session } from "../lib/http.mjs";
import { assertion, result, statusFromAssertions } from "../lib/result.mjs";

const PREFIX = "acc-";
// 🚨 コレクション名（＝テーブル名）にハイフンは使えない。
//    実測: {"code":"INVALID_IDENTIFIER","message":"識別子は小文字英字・数字・アンダースコアのみ"}
//    後片付けで見分けられるよう acc_ 接頭辞にしている。
const COLLECTION = "acc_notes";

/** 403 か 404 なら「拒否された」とみなす（どちらでもよい。仕様どおり）。 */
function isDenied(status) {
  return status === 403 || status === 404;
}

export async function check(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const assertions = [];
  const details = [];
  const repro = [`(cd ${"."} && bun run acceptance --only 8)`];
  const leftovers = [];

  const admin = new Session(baseUrl, "admin");
  const userA = new Session(baseUrl, "A");
  const userB = new Session(baseUrl, "B");

  // ── セッションを3つ取る。dev-login が無い（本番ビルド）ならここで判定不能 ──
  const adminLogin = await admin.postJson("/api/auth/dev-login?admin=true", {
    email: `${PREFIX}admin@example.com`,
  });
  if (adminLogin.status !== 200) {
    return blocked(
      8,
      "他人の行に直打ち → 403/404",
      `dev-login が使えません (HTTP ${adminLogin.status})`,
      [
        "受入基準8 はログイン済みセッションが3つ（管理者・A・B）要りますが、",
        "dev-login は NODE_ENV !== 'production' のときだけ有効で、",
        "next build は NODE_ENV をインライン展開するため本番ビルドでは分岐ごと消えています。",
        "→ acceptance/compose.acceptance.yml の dev モード studio を起動してください。",
      ],
      ["bun run acceptance:up   # dev モードの studio を 3999 で起動する"],
      started,
    );
  }

  const adminId = adminLogin.json?.data?.userId;
  const aLogin = await userA.postJson("/api/auth/dev-login", { email: `${PREFIX}a@example.com` });
  const bLogin = await userB.postJson("/api/auth/dev-login", { email: `${PREFIX}b@example.com` });
  const aId = aLogin.json?.data?.userId;
  const bId = bLogin.json?.data?.userId;

  if (!adminId || !aId || !bId) {
    return blocked(
      8,
      "他人の行に直打ち → 403/404",
      "検証用ユーザーを3人作れませんでした",
      [`admin=${Boolean(adminId)} A=${Boolean(aId)} B=${Boolean(bId)}`],
      [],
      started,
    );
  }
  // ユーザー行は API から消せないので、後で一覧に出す。
  leftovers.push(
    `user ${PREFIX}admin@example.com (${adminId})`,
    `user ${PREFIX}a@example.com (${aId})`,
    `user ${PREFIX}b@example.com (${bId})`,
  );

  let policyId = null;
  try {
    // ── 検証用コレクション ──
    await admin.postJson("/api/collections", {
      collection: COLLECTION,
      fields: [
        { field: "id", type: "uuid", schema: { is_primary_key: true } },
        { field: "owner", type: "string" },
        { field: "title", type: "string" },
        { field: "secret", type: "string" },
      ],
    });

    // ── 「自分の行だけ」ポリシー（admin_access=false）──
    //
    // 🚨 --red 8 のときだけ admin_access を true にする。
    //    これは「ハーネスが本当に赤くなるか」を確かめるための仕込み（F9h 受入基準3）。
    //    PASS しか出ないハーネスは何も検証していないので、**誰でも赤を再現できる**
    //    入口を残してある。触るのは acc- 接頭辞の検証用ポリシーだけ。
    const sabotage = context.red?.includes(8) ?? false;
    const policy = await admin.postJson("/api/policies", {
      name: `${PREFIX}owner-only`,
      description: sabotage
        ? "受入ハーネス RED 確認: わざと全行見えるようにしたポリシー"
        : "受入ハーネス: 自分の行だけ見える",
      admin_access: sabotage,
    });
    if (sabotage) {
      details.push(
        "⚠ --red 8 が指定されているため、検証用ポリシーを admin_access:true にしています" +
          "（＝わざと壊した状態）。この実行結果は FAIL になるのが正しい。",
      );
    }
    policyId = policy.json?.data?.id ?? null;

    // fields から secret を意図的に外す（フィールド単位の権限も見るため）
    for (const action of ["read", "update", "delete", "create"]) {
      await admin.postJson("/api/permissions", {
        policy: policyId,
        collection: COLLECTION,
        action,
        permissions: { owner: { _eq: "$CURRENT_USER" } },
        fields: "id,owner,title",
      });
    }
    for (const user of [aId, bId]) {
      await admin.postJson("/api/access", { policy: policyId, user });
    }

    // ── A と B がそれぞれ自分の行を作る ──
    const aItem = await userA.postJson(`/api/items/${COLLECTION}`, {
      owner: aId,
      title: `${PREFIX}A のメモ`,
    });
    const bItem = await userB.postJson(`/api/items/${COLLECTION}`, {
      owner: bId,
      title: `${PREFIX}B のメモ`,
    });
    const aItemId = aItem.json?.data?.id;
    const bItemId = bItem.json?.data?.id;

    if (!aItemId || !bItemId) {
      return blocked(
        8,
        "他人の行に直打ち → 403/404",
        "検証用の行を作れませんでした",
        [
          `A の行 HTTP ${aItem.status} / B の行 HTTP ${bItem.status}`,
          "権限設定（policy / permissions / access）が効いていない可能性があります。",
        ],
        [],
        started,
        leftovers,
      );
    }

    await admin.patchJson(`/api/items/${COLLECTION}/${aItemId}`, { secret: "SECRET-OF-A" });
    await admin.patchJson(`/api/items/${COLLECTION}/${bItemId}`, { secret: "SECRET-OF-B" });

    // ══ ここから判定 ══

    // 【肯定形①】B の行は実在する（管理者からは見える）
    // これが無いと、以降の否定形はすべて自明に成立してしまう。
    const adminSeesB = await admin.get(`/api/items/${COLLECTION}/${bItemId}`);
    assertions.push(
      assertion("positive", "管理者から B の行が見える（行が実在することの裏取り）",
        adminSeesB.status === 200, adminSeesB.status, "200"),
    );

    // 【肯定形②】A は自分の行が見える（A の権限が死んでいない）
    const aSeesOwn = await userA.get(`/api/items/${COLLECTION}/${aItemId}`);
    assertions.push(
      assertion("positive", "A が自分の行を GET できる",
        aSeesOwn.status === 200, aSeesOwn.status, "200"),
    );

    // 【肯定形③】A の一覧が 0 件でない（0 件なら「他人の行が無い」は自明）
    const aList = await userA.get(`/api/items/${COLLECTION}`);
    const aRows = Array.isArray(aList.json?.data) ? aList.json.data : [];
    assertions.push(
      assertion("positive", "A の一覧が 1 件以上ある",
        aRows.length > 0, `${aRows.length} 件`, "1 件以上"),
    );

    // 【否定形①】A から B の行を GET → 403/404、かつ本文に B の値が出ない
    const aGetsB = await userA.get(`/api/items/${COLLECTION}/${bItemId}`);
    assertions.push(
      assertion("negative", "A が B の行を GET できない",
        isDenied(aGetsB.status), aGetsB.status, "403 か 404"),
    );
    assertions.push(
      assertion("negative", "拒否レスポンスに B の値が漏れていない",
        !aGetsB.text.includes("SECRET-OF-B") && !aGetsB.text.includes(`${PREFIX}B のメモ`),
        aGetsB.text.includes("SECRET-OF-B") ? "SECRET-OF-B が含まれる" : "含まれない",
        "含まれない"),
    );

    // 【否定形②】A から B の行を PATCH → 拒否され、実際に値も変わっていない
    const aPatchesB = await userA.patchJson(`/api/items/${COLLECTION}/${bItemId}`, {
      title: "乗っ取り",
    });
    assertions.push(
      assertion("negative", "A が B の行を PATCH できない",
        isDenied(aPatchesB.status), aPatchesB.status, "403 か 404"),
    );
    const bAfterPatch = await admin.get(`/api/items/${COLLECTION}/${bItemId}`);
    assertions.push(
      assertion("negative", "B の行の値が実際に書き換わっていない",
        bAfterPatch.json?.data?.title === `${PREFIX}B のメモ`,
        String(bAfterPatch.json?.data?.title), `${PREFIX}B のメモ`),
    );

    // 【否定形③】A から B の行を DELETE → 拒否され、実際に残っている
    const aDeletesB = await userA.delete(`/api/items/${COLLECTION}/${bItemId}`);
    assertions.push(
      assertion("negative", "A が B の行を DELETE できない",
        isDenied(aDeletesB.status), aDeletesB.status, "403 か 404"),
    );
    const bAfterDelete = await admin.get(`/api/items/${COLLECTION}/${bItemId}`);
    assertions.push(
      assertion("negative", "B の行が実際に残っている",
        bAfterDelete.status === 200, bAfterDelete.status, "200"),
    );

    // 【否定形④】一覧に他人の行が混ざらない
    const foreign = aRows.filter((row) => row.owner && row.owner !== aId);
    assertions.push(
      assertion("negative", "A の一覧に A 以外の owner の行が無い",
        foreign.length === 0, `${foreign.length} 件`, "0 件"),
    );

    // 【否定形⑤】許可されていないフィールド(secret)が出ない・要求しても拒否される
    assertions.push(
      assertion("negative", "A の行のレスポンスに secret が出ない",
        !aSeesOwn.text.includes("SECRET-OF-A"),
        aSeesOwn.text.includes("SECRET-OF-A") ? "出ている" : "出ていない", "出ていない"),
    );
    const aAsksSecret = await userA.get(`/api/items/${COLLECTION}/${aItemId}?fields=secret`);
    assertions.push(
      assertion("negative", "A が fields=secret を明示要求しても拒否される",
        isDenied(aAsksSecret.status) || !aAsksSecret.text.includes("SECRET-OF-A"),
        aAsksSecret.status, "403/404 か secret 非表示"),
    );

    // 【否定形⑥】自前 filter で他人の行を狙えない（権限フィルタと AND されるか）
    const aFilters = await userA.get(
      `/api/items/${COLLECTION}?filter=${encodeURIComponent(JSON.stringify({ owner: { _eq: bId } }))}`,
    );
    const filteredRows = Array.isArray(aFilters.json?.data) ? aFilters.json.data : [];
    assertions.push(
      assertion("negative", "A が filter で B の行を引き出せない",
        filteredRows.length === 0, `${filteredRows.length} 件`, "0 件"),
    );

    // 【否定形⑦】所有権の移し替えができない
    const aStealsOwner = await userA.patchJson(`/api/items/${COLLECTION}/${aItemId}`, {
      owner: bId,
    });
    const aAfterSteal = await admin.get(`/api/items/${COLLECTION}/${aItemId}`);
    assertions.push(
      assertion("negative", "A が自分の行の owner を B へ書き換えられない",
        aAfterSteal.json?.data?.owner === aId,
        `owner=${aAfterSteal.json?.data?.owner} (PATCH は HTTP ${aStealsOwner.status})`,
        `owner=${aId}`),
    );

    // 【否定形⑧】認証なしでは触れない
    const anon = new Session(baseUrl, "anon");
    const anonGet = await anon.get(`/api/items/${COLLECTION}/${aItemId}`);
    assertions.push(
      assertion("negative", "認証なしで行を GET できない",
        anonGet.status === 401 || isDenied(anonGet.status), anonGet.status, "401/403/404"),
    );

    // 【否定形⑨】一般ユーザーが管理 API を叩けない
    const aAdminApi = await userA.get("/api/collections");
    assertions.push(
      assertion("negative", "A が /api/collections を叩けない",
        isDenied(aAdminApi.status) || aAdminApi.status === 401, aAdminApi.status, "401/403/404"),
    );

    const verdict = statusFromAssertions(assertions);
    return result({
      id: 8,
      title: "他人の行に直打ち → 403/404",
      status: verdict.status,
      positive: `自分の行 ${aSeesOwn.status} / 一覧 ${aRows.length}件`,
      negative: `他人の行 ${aGetsB.status}`,
      details: [...details, ...verdict.details, ...leftoverNote(leftovers)],
      repro:
        verdict.status === "PASS"
          ? []
          : [
              ...repro,
              `curl -sS -o /dev/null -w '%{http_code}\\n' '${baseUrl}/api/items/${COLLECTION}/<Bの行id>'  # A の cookie で`,
            ],
      assertions,
      ms: Date.now() - started,
    });
  } finally {
    // ── 後片付け（acc- が付いたものを消す） ──
    await cleanup(admin, policyId, leftovers);
  }
}

async function cleanup(admin, policyId, leftovers) {
  // コレクションを落とせばアイテムも消える。
  await admin.delete(`/api/collections/${COLLECTION}`).catch(() => {});
  if (policyId) await admin.delete(`/api/policies/${policyId}`).catch(() => {});
}

function leftoverNote(leftovers) {
  if (leftovers.length === 0) return [];
  return [
    "消せなかったもの（API に削除の入口が無いため。手で消すか、次回も同じ行が再利用されます）:",
    ...leftovers.map((l) => `    ${l}`),
  ];
}

function blocked(id, title, reason, details, repro, started, leftovers = []) {
  return result({
    id,
    title,
    status: "BLOCKED",
    reason,
    details: [...details, ...leftoverNote(leftovers)],
    repro,
    ms: Date.now() - started,
  });
}

export const meta = { id: 8, needsServer: true };
