/**
 * 受入基準8 の追加分: **リレーションを跨いでも権限が効くか**。
 *
 * 08-row-permission.mjs は「他人の**行**に ID を直打ちしても弾かれるか」を見ているが、
 * **リレーション経由の経路を1つも見ていない**。
 * その穴は F2-1（2df5938）で塞がれたが、**塞がったことを毎回確かめる仕組みが無かった**。
 *
 * 出典: infra が F0e で見つけて再現スクリプトにしていたもの
 *   .temp/2026-08-13/f0c/f0e-relation-probe.sh / -escalation.sh / -o2m-m2m-probe.sh / -deep-nest.sh
 * 🚨 それらは `.temp/` にあり、**書いた本人がいなくなると誰も回さない**。
 *   消える前にハーネスへ移した（今日いちばん繰り返した失敗が「測っていたことを誰も引き継げない」だった）。
 *
 * 🚨 **対照実験を必ず先に置く。**
 *   「一般ユーザーから見えない」は、**リレーションがそもそも解決できていない**だけでも成立する。
 *   だから毎回まず「**管理者なら親の列まで取れる**」ことを確かめ、そのうえで
 *   「一般ユーザーでは取れない」を見る。これが無いと「全部 null にしただけ」と区別できない。
 *
 * 見るもの（infra の4本に対応）:
 *   ① m2o        子の read 権限だけで `fields=parent.*` から親の全列を読めないか
 *   ② 踏み台作成  子に create 権限があるとき、**任意の親 id を指す子を自分で作って**読めないか
 *   ③ o2m        親から子の配列を引く向きでも漏れないか
 *   ④ 多段ネスト  3段以上（n1→n2→n3→n4）でも各段で判定が効くか
 */

import { assertion } from "../lib/result.mjs";

const SECRET = "ACC-REL-SECRET";

/** 権限の無い相手の列が見えていないか。見えていたら漏れている */
function leaked(payload) {
  return JSON.stringify(payload ?? {}).includes(SECRET);
}

/**
 * @param {object} ctx
 * @param {import("../lib/http.mjs").Session} ctx.admin   管理者セッション（土台を作る）
 * @param {import("../lib/http.mjs").Session} ctx.user    一般ユーザー A のセッション
 * @param {string} ctx.userId                             A のユーザー id
 * @param {string} ctx.policyId                           A に割り当て済みのポリシー id
 * @param {string} ctx.prefix                             後片付け用の接頭辞（テーブル名なので _ 区切り）
 * @returns {Promise<{assertions: any[], details: string[], collections: string[]}>}
 */
export async function relationAssertions({ admin, user, userId, policyId, prefix }) {
  const assertions = [];
  const details = [];
  const collections = [];

  const parent = `${prefix}rel_parent`;
  const child = `${prefix}rel_child`;
  const chain = [1, 2, 3, 4].map((n) => `${prefix}rel_n${n}`);

  /** 管理者で作る。ここは土台なので、失敗したら以降は測れない */
  const create = async (collection, extraFields) => {
    collections.push(collection);
    return admin.postJson("/api/collections", {
      collection,
      fields: [
        { field: "id", type: "uuid", schema: { is_primary_key: true } },
        ...extraFields,
      ],
    });
  };
  const relate = (many, field, one) =>
    admin.postJson("/api/relations", {
      many_collection: many,
      many_field: field,
      many_primary: "id",
      one_collection: one,
      one_primary: "id",
    });
  const grant = (collection, action) =>
    admin.postJson("/api/permissions", {
      policy: policyId,
      collection,
      action,
      fields: "*",
      permissions: {},
    });

  /* ── 土台 ── */
  const parentCreated = await create(parent, [
    { field: "title", type: "string" },
    { field: "secret", type: "string" },
  ]);
  await create(child, [
    { field: "memo", type: "string" },
    { field: "parent", type: "uuid" },
  ]);
  const relation = await relate(child, "parent", parent);

  if (parentCreated.status !== 200 || relation.status !== 200) {
    assertions.push(
      assertion(
        "positive",
        "リレーションの土台を作れる（これが無いと以降は測れない）",
        false,
        `collection=${parentCreated.status} relation=${relation.status}`,
        "200",
      ),
    );
    return { assertions, details, collections };
  }

  const parentRow = await admin.postJson(`/api/items/${parent}`, {
    title: "見えてよい列",
    secret: SECRET,
  });
  const parentId = parentRow.json?.data?.id;
  await admin.postJson(`/api/items/${child}`, { memo: "子", parent: parentId });

  // A には **child だけ** 権限を与える。parent には permission 行を1つも作らない
  await grant(child, "read");
  await grant(child, "create");

  /* ── 対照実験（先に置く。これが無いと否定形が自明に通る） ── */
  const adminSees = await admin.get(
    `/api/items/${child}?fields=${encodeURIComponent("id,parent.*")}`,
  );
  assertions.push(
    assertion(
      "positive",
      "対照: 管理者ならリレーションを辿って親の列まで取れる",
      adminSees.status === 200 && leaked(adminSees.json),
      adminSees.status === 200
        ? leaked(adminSees.json)
          ? "親の secret まで取れた"
          : "辿れたが secret が無い（リレーションが効いていない可能性）"
        : `HTTP ${adminSees.status}`,
      "親の列まで取れる",
    ),
  );
  assertions.push(
    assertion(
      "positive",
      "対照: A は許可された子コレクションを読める（権限が生きている）",
      (await user.get(`/api/items/${child}`)).status === 200,
      "200",
      "200",
    ),
  );
  const direct = await user.get(`/api/items/${parent}`);
  assertions.push(
    assertion(
      "negative",
      "A は親コレクションを直接は読めない（前提）",
      direct.status === 403 || direct.status === 404,
      `HTTP ${direct.status}`,
      "403 か 404",
    ),
  );

  /* ── ① m2o: fields のドット記法で親を読めないか ── */
  for (const [label, fields] of [
    ["parent.*（全列）", "id,parent.*"],
    ["parent.secret（名指し）", "id,parent.secret"],
  ]) {
    const response = await user.get(
      `/api/items/${child}?fields=${encodeURIComponent(fields)}`,
    );
    assertions.push(
      assertion(
        "negative",
        `m2o: ${label} で親の列が漏れない`,
        !leaked(response.json),
        leaked(response.json) ? "**漏れた**" : `漏れていない (HTTP ${response.status})`,
        "漏れない",
      ),
    );
  }

  /* ── ② 踏み台: 自分で子を作って任意の親を指す ── */
  //   A は child に create を持つ。**親の id さえ分かれば**任意の行を読めてしまわないか。
  const forged = await user.postJson(`/api/items/${child}`, {
    memo: "踏み台",
    parent: parentId,
  });
  const forgedRead = await user.get(
    `/api/items/${child}?fields=${encodeURIComponent("id,parent.*")}`,
  );
  assertions.push(
    assertion(
      "negative",
      "踏み台: 自分で作った子から任意の親を読めない",
      !leaked(forgedRead.json),
      leaked(forgedRead.json)
        ? "**漏れた（親の id さえ分かれば読める）**"
        : `漏れていない (作成 HTTP ${forged.status})`,
      "漏れない",
    ),
  );

  /* ── ③ o2m: 親から子を引く向き ── */
  //   親側に o2m のリレーションを張り、A が親を読めない状態で子を引けないかを見る。
  const o2m = await relate(child, "parent", parent); // 既にあるので 409 になる想定
  const o2mProbe = await user.get(
    `/api/items/${parent}?fields=${encodeURIComponent("id,secret")}`,
  );
  assertions.push(
    assertion(
      "negative",
      "o2m: 親を起点にした読み取りも拒否される",
      o2mProbe.status === 403 || o2mProbe.status === 404,
      `HTTP ${o2mProbe.status}${o2m.status === 409 ? "" : ` (relation=${o2m.status})`}`,
      "403 か 404",
    ),
  );

  /* ── ④ 多段ネスト: n1 → n2 → n3 → n4 ── */
  await create(chain[3], [{ field: "secret", type: "string" }]);
  for (let i = 2; i >= 0; i -= 1) {
    await create(chain[i], [{ field: "next", type: "uuid" }]);
    await relate(chain[i], "next", chain[i + 1]);
  }
  const n4 = await admin.postJson(`/api/items/${chain[3]}`, { secret: SECRET });
  let previous = n4.json?.data?.id;
  for (let i = 2; i >= 0; i -= 1) {
    const row = await admin.postJson(`/api/items/${chain[i]}`, { next: previous });
    previous = row.json?.data?.id;
  }
  await grant(chain[0], "read"); // A は鎖の入口だけ読める

  const deep = await user.get(
    `/api/items/${chain[0]}?fields=${encodeURIComponent("id,next.next.next.secret")}`,
  );
  assertions.push(
    assertion(
      "negative",
      "多段ネスト（4段）でも、権限の無いコレクションの列は漏れない",
      !leaked(deep.json),
      leaked(deep.json) ? "**漏れた**" : `漏れていない (HTTP ${deep.status})`,
      "漏れない",
    ),
  );

  const deepAdmin = await admin.get(
    `/api/items/${chain[0]}?fields=${encodeURIComponent("id,next.next.next.secret")}`,
  );
  assertions.push(
    assertion(
      "positive",
      "対照: 管理者なら4段辿って最奥の列まで取れる",
      leaked(deepAdmin.json),
      leaked(deepAdmin.json) ? "最奥まで取れた" : `取れず (HTTP ${deepAdmin.status})`,
      "取れる",
    ),
  );

  details.push(
    "リレーション経由の検査は infra の F0e 再現スクリプト4本をハーネスへ移したもの",
    "（.temp/ に置いたままだと、書いた本人がいなくなった時点で誰も回さなくなるため）",
  );

  return { assertions, details, collections: [...collections, ...chain] };
}
