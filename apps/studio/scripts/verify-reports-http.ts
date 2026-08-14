/**
 * 不具合報告の **HTTP 層の権限境界** を、実際のルートハンドラを呼んで測る。
 *
 *   bun scripts/verify-reports-http.ts
 *
 * なぜ要るか:
 * `AGENTS.md §3.5`「権限はフィルタで隠すのでなく、サーバ側で拒否する」が
 * **本当に守られているか**は、サービス層の単体では分からない。
 * ルートの入口（誰として来たか）まで通して初めて測れる。
 *
 * 🚨 **DB を使う。** 検査用の利用者・ポリシー・セッションを作り、**最後に必ず消す**
 *    （`finally` で片付ける。途中で落ちても残さない）。
 * 🚨 **落ちる側も測ってある。** この検査が「効いていること」は、
 *    ルートから 403 判定を外す／`isManager: true` を渡す の 2 通りで
 *    実際に赤くなることを確認済み（2026-08-15）。
 * 🚨 **サーバを起動しない**（ポートが要らない）。ハンドラを直接呼ぶ。
 */

import { randomUUID } from "node:crypto";

import { db } from "../lib/db/knex";
import { sha256Hex } from "../lib/auth/crypto";
import * as reportsRoute from "../app/api/reports/route";
import * as reportRoute from "../app/api/reports/[id]/route";
import * as messagesRoute from "../app/api/reports/[id]/messages/route";

const mk = (id: string) => ({ user: id, token: randomUUID() });
const reporter = mk(randomUUID());
const outsider = mk(randomUUID());
const manager = mk(randomUUID());
const policyId = randomUUID();
const accessId = randomUUID();

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` （期待 ${JSON.stringify(want)}）`}`);
};
const req = (who: {token: string}, url: string, init: RequestInit = {}) =>
  new Request(`http://localhost${url}`, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie: `session=${who.token}`, "content-type": "application/json" },
  });

let reportId = "";
try {
  const exp = new Date(Date.now() + 3600_000);
  for (const [i, who] of [reporter, outsider, manager].entries()) {
    await db("directus_users").insert({ id: who.user, email: `http-probe-${i}@example.test` });
    await db("directus_sessions").insert({ token: sha256Hex(who.token), user: who.user, expires: exp });
  }
  // manager に 4 権限を与える
  await db("directus_policies").insert({ id: policyId, name: "http-probe-manage", admin_access: false, app_access: true });
  await db("directus_access").insert({ id: accessId, user: manager.user, policy: policyId });
  await db("directus_permissions").insert(
    ["read","create","update","delete"].map((action) => ({ policy: policyId, collection: "ohmycms_bug_reports", action })));

  // ① 報告を出す（reporter）
  let res = await reportsRoute.POST(req(reporter, "/api/reports", {
    method: "POST", body: JSON.stringify({ title: "http probe", body: "壊れた", page_path: "/admin/files" }) }));
  eq("POST /api/reports は 201", res.status, 201);
  reportId = (await res.json()).data.id;

  // ② scope=all は権限で分かれる
  res = await reportsRoute.GET(req(reporter, "/api/reports?scope=all"));
  eq("🚨 権限が無い人の ?scope=all は 403", res.status, 403);
  res = await reportsRoute.GET(req(manager, "/api/reports?scope=all"));
  eq("管理できる人の ?scope=all は 200", res.status, 200);
  eq("can_manage が返る", (await res.clone().json()).can_manage, true);

  // ③ 自分の一覧に他人の報告は出ない
  res = await reportsRoute.GET(req(outsider, "/api/reports"));
  const body = await res.json();
  eq("🚨 他人の一覧に出ない", body.data.some((r: { id: string }) => r.id === reportId), false);
  eq("🚨 can_manage は false", body.can_manage, false);

  // ④ 他人が直接 GET すると 404（403 ではない）
  const params = { params: Promise.resolve({ id: reportId }) };
  res = await reportRoute.GET(req(outsider, `/api/reports/${reportId}`), params);
  eq("🚨 他人の報告は 404（403 にしない）", res.status, 404);
  res = await reportRoute.GET(req(reporter, `/api/reports/${reportId}`), { params: Promise.resolve({ id: reportId }) });
  eq("本人は 200", res.status, 200);
  res = await reportRoute.GET(req(manager, `/api/reports/${reportId}`), { params: Promise.resolve({ id: reportId }) });
  eq("管理できる人も 200", res.status, 200);

  // ⑤ 他人は書き込めない
  res = await messagesRoute.POST(req(outsider, `/api/reports/${reportId}/messages`, {
    method: "POST", body: JSON.stringify({ body: "割り込み" }) }), { params: Promise.resolve({ id: reportId }) });
  eq("🚨 他人は返信できない（404）", res.status, 404);

  // ⑥ 報告者は解決済みにできない／管理者はできる
  res = await reportRoute.PATCH(req(reporter, `/api/reports/${reportId}`, {
    method: "PATCH", body: JSON.stringify({ status: "resolved" }) }), { params: Promise.resolve({ id: reportId }) });
  eq("🚨 報告者は自分の報告を解決済みにできない（403）", res.status, 403);
  res = await reportRoute.PATCH(req(manager, `/api/reports/${reportId}`, {
    method: "PATCH", body: JSON.stringify({ status: "resolved" }) }), { params: Promise.resolve({ id: reportId }) });
  eq("管理できる人は解決済みにできる", res.status, 200);

  // ⑦ 未ログインは 401
  res = await reportsRoute.GET(new Request("http://localhost/api/reports"));
  eq("🚨 未ログインは 401", res.status, 401);
} finally {
  await db("ohmycms_notifications").whereIn("recipient", [reporter.user, outsider.user, manager.user]).del();
  if (reportId) await db("ohmycms_bug_reports").where({ id: reportId }).del();
  await db("ohmycms_bug_reports").whereIn("reporter", [reporter.user, outsider.user, manager.user]).del();
  await db("directus_permissions").where({ policy: policyId }).del();
  await db("directus_access").where({ id: accessId }).del();
  await db("directus_policies").where({ id: policyId }).del();
  await db("directus_sessions").whereIn("user", [reporter.user, outsider.user, manager.user]).del();
  await db("directus_users").whereIn("id", [reporter.user, outsider.user, manager.user]).del();
  console.log("\n  片付け完了");
  await db.destroy();
}
console.log(`\n測った項目: 13 / 食い違い: ${fails} 件`);
process.exit(fails ? 1 : 0);
