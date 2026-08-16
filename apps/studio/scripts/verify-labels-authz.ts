/**
 * ラベル付け対象の認可ハーネス（サービス層）。
 *
 *   bun --filter @ohmycms/studio verify:labels-authz
 *
 * `labelsForTarget` / `setLabelsForTarget` が、対象行の rowFilter と
 * コレクション権限を本当に見ていることを測る。
 *
 * 注意:
 * この検査には 0 件ガード（自己検査）はあるが、囮（decoy）が無い。
 * 実測: 自己検査は 3 件（行フィルタが付いている / 被害者のファイルが実在する /
 * フォルダ権限が無い）、囮は 0 件。比較: scripts/verify-labels.ts には囮がある。
 *
 * 囮と 0 件ガードは別のものを守る:
 * 囮＝探し方（規則）が当たっているか / 0 件ガード＝そもそも読めているか。
 * だから 0 件ガードがあるからといって、規則が当たっている保証にはならない。
 *
 * この検査は実行時の振る舞いを見るので、囮を仕込むには製品コードを一時的に
 * 壊す必要があり、スクリプトの中には入れていない。
 *
 * したがって: lib/labels/service.ts の assertTargetVisible を変えたら、
 * 手で RED を採り直すこと。
 * やり方: labelsForTarget から assertTargetVisible の呼び出しを一時的に外す →
 * この検査が #3 と #6 で FAIL・exit 1 になることを見る → 戻す。
 *
 * 🚨 「検出されてはいけない」側も入っている（過検出を捕まえる向き）:
 *   #1 #2 attacker が **自分の** ファイルを読む・書く → 例外が出てはいけない
 *   #8 #9 admin が他人のファイル・フォルダを触る     → 例外が出てはいけない
 * ＝ 守りを「全部拒否」に壊すと #1/#2/#8/#9 が落ち、
 *    「全部許可」に壊すと #3/#4/#6/#7 が落ちる。**両方向から挟んである。**
 *    （これは**コードを読んで言えること**で、「全部拒否」に壊して測ってはいない。）
 *
 * 🚨 この検査は**共有 DB に一時的な利用者・ファイル・ポリシーを作る**（走っている間だけ）。
 *    他のペインが同じ瞬間に「利用者の件数」を数えると、その数がずれる。
 *    数を測っている人が居るときは、声を掛けてから走らせること。
 */
import { randomUUID } from "node:crypto";
import type { Actor } from "../lib/auth/context";
import { db } from "../lib/db/knex";
import {
  createLabel,
  deleteLabel,
  labelsForTarget,
  listLabels,
  setLabelsForTarget,
  targetIdsByLabelName,
} from "../lib/labels/service";
import { resolvePermission } from "../lib/permissions/resolve";

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

/** 例外を「起きたこと」として扱えるようにする（起きなければ null）。 */
async function caught(fn: () => Promise<unknown>): Promise<{ status?: number; code?: string } | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const e = error as { status?: number; code?: string };
    return { status: e.status, code: e.code };
  }
}

// 赤くなったときに何が起きたかを名指しする。ただし detail は事実だけを書く（『素通り』のような判断を混ぜると、通ってよい対照が違反に読める）。
function detail(r: { status?: number; code?: string } | null): string {
  return r === null
    ? "例外なし"
    : `${r.status ?? "(status なし)"} ${r.code ?? "(code なし)"}`;
}

type UserRow = {
  id: string;
  email: string;
  role: string | null;
};

type Fixture = {
  attackerActor: Actor;
  adminActor: Actor;
  labelId: string;
  attackerFileId: string;
  victimFileId: string;
  folderId: string;
};

const policyId = "00000000-0000-4000-8000-00000000a001";
const attackerId = "00000000-0000-4000-8000-00000000a002";
const victimId = "00000000-0000-4000-8000-00000000a003";
const accessId = "00000000-0000-4000-8000-00000000a004";
const attackerFileId = "00000000-0000-4000-8000-00000000a005";
const victimFileId = "00000000-0000-4000-8000-00000000a006";
const folderId = "00000000-0000-4000-8000-00000000a007";
/** ラベルのソフトデリートを測るための使い捨てラベル（**固定 ID**・後片付けもこの ID を指す）。 */
const probeLabelId = "00000000-0000-4000-8000-00000000a008";
const probeLabelName = "zz-authz-softdelete-probe";

function actorForUser(user: UserRow): Actor {
  return {
    type: "human",
    userId: user.id,
    email: user.email,
    role: user.role ?? null,
    picture: null,
    avatarEmoji: null,
    firstName: null,
    lastName: null,
  };
}

async function assignmentCount(): Promise<number> {
  const row = await db("ohmycms_label_assignments").count<{ count: string }>({ count: "*" }).first();
  return Number(row?.count ?? 0);
}

async function cleanupAuthzFixture(): Promise<void> {
  await db("ohmycms_label_assignments")
    .whereIn("target_id", [attackerFileId, victimFileId, folderId])
    .delete();
  // 🚨 使い捨てラベルは **物理削除**（`deleteLabel` は印を立てるだけなので、
  //    サービス層で消すと**ゴミ箱に残り続ける**）。ここは掃除なので素の delete でよい。
  //    割り当ては `label_id` の CASCADE で道連れに消える（**物理削除なので動く**）。
  // 🚨 **id だけでなく、名前の完全一致でも消す。** 実測 2026-08-16:
  //    製品コードが物理削除だった版でこの検査を走らせると、#21 の `createLabel` が
  //    **成功して別の UUID の行を作り**、id を指した掃除では**残った**（次の実行が
  //    `LABEL_EXISTS` で止まった）。**前方一致ではなく完全一致**なので、
  //    他のペインの `zz_*` を巻き込まない。
  await db("ohmycms_labels")
    .where({ id: probeLabelId })
    .orWhere({ name: probeLabelName })
    .delete();

  // 🚨 消すのは **この検査が作った固定 ID の行だけ**。名前や email の前方一致で消さない。
  //    DB は全ペインの共有物なので、`LIKE 'authz-%'` のような掃き方をすると
  //    **他のペインが同じ接頭辞で作ったものまで巻き込む**（起きてからでは復元できない）。
  //    ID は作成時からずっと固定（a001〜a007）なので、残骸も必ずこの ID を持つ。
  //    ＝ 前方一致は掃除の役に立っておらず、危険だけが残っていた。
  await db("directus_files").whereIn("id", [attackerFileId, victimFileId]).delete();
  await db("directus_folders").where({ id: folderId }).delete();

  await db("directus_permissions").where({ policy: policyId }).delete();
  await db("directus_access").where({ policy: policyId }).delete();
  await db("directus_policies").where({ id: policyId }).delete();
  await db("directus_users").whereIn("id", [attackerId, victimId]).delete();
}

async function adminActor(): Promise<Actor | null> {
  const user = await db("directus_access")
    .join("directus_policies", "directus_access.policy", "directus_policies.id")
    .join("directus_users", function join() {
      this.on("directus_access.user", "=", "directus_users.id").orOn(
        "directus_access.role",
        "=",
        "directus_users.role",
      );
    })
    .where("directus_policies.admin_access", true)
    .select<UserRow>({
      id: "directus_users.id",
      email: "directus_users.email",
      role: "directus_users.role",
    })
    .first();

  return user ? actorForUser(user) : null;
}

async function setupFixture(): Promise<Fixture | null> {
  const label = await db("ohmycms_labels").select<{ id: string }>("id").first();
  if (!label) {
    console.error("ラベルが1件も無いので測れません（unverified）");
    return null;
  }

  const admin = await adminActor();
  if (!admin) {
    console.error("admin_access を持つ利用者が見つからないので測れません（unverified）");
    return null;
  }

  await db("directus_policies").insert({
    id: policyId,
    name: "authz-owner-only",
    admin_access: false,
    app_access: true,
  });
  await db("directus_users").insert([
    {
      id: attackerId,
      email: "authz-attacker@example.com",
      status: "active",
      provider: "default",
    },
    {
      id: victimId,
      email: "authz-victim@example.com",
      status: "active",
      provider: "default",
    },
  ]);
  await db("directus_access").insert({
    id: accessId,
    user: attackerId,
    policy: policyId,
  });
  await db("directus_permissions").insert([
    {
      policy: policyId,
      collection: "directus_files",
      action: "read",
      permissions: { uploaded_by: { _eq: "$CURRENT_USER" } },
      fields: "*",
    },
    {
      policy: policyId,
      collection: "directus_files",
      action: "update",
      permissions: { uploaded_by: { _eq: "$CURRENT_USER" } },
      fields: "*",
    },
  ]);
  await db("directus_folders").insert({
    id: folderId,
    name: "authz-folder",
  });
  await db("directus_files").insert([
    {
      id: attackerFileId,
      storage: "local",
      filename_disk: `authz-attacker-${randomUUID()}.txt`,
      filename_download: "authz-attacker-file.txt",
      title: "authz-attacker-file",
      type: "text/plain",
      uploaded_by: attackerId,
    },
    {
      id: victimFileId,
      storage: "local",
      filename_disk: `authz-victim-${randomUUID()}.txt`,
      filename_download: "authz-victim-file.txt",
      title: "authz-victim-file",
      type: "text/plain",
      uploaded_by: victimId,
    },
  ]);

  const attacker = await db("directus_users")
    .select<UserRow>({ id: "id", email: "email", role: "role" })
    .where({ id: attackerId })
    .first();
  if (!attacker) {
    console.error("authz-attacker@example.com を作成できず測れません（unverified）");
    return null;
  }

  return {
    attackerActor: actorForUser(attacker),
    adminActor: admin,
    labelId: label.id,
    attackerFileId,
    victimFileId,
    folderId,
  };
}

async function runChecks(fixture: Fixture): Promise<void> {
  const fileUpdatePermission = await resolvePermission(
    fixture.attackerActor,
    "directus_files",
    "update",
  );
  check(
    "自己検査: directus_files update に行フィルタが付いている",
    fileUpdatePermission.allowed && fileUpdatePermission.rowFilter !== null,
    `allowed=${fileUpdatePermission.allowed} rowFilter=${JSON.stringify(fileUpdatePermission.rowFilter)}`,
  );

  const victimFile = await db("directus_files").where({ id: fixture.victimFileId }).first();
  check(
    "自己検査: 被害者のファイルは DB に実在する",
    Boolean(victimFile),
    victimFile ? fixture.victimFileId : "0 件",
  );

  const folderReadPermission = await resolvePermission(
    fixture.attackerActor,
    "directus_folders",
    "read",
  );
  check(
    "自己検査: directus_folders read は許可されていない",
    folderReadPermission.allowed === false,
    `allowed=${folderReadPermission.allowed}`,
  );

  const ownRead = await caught(() =>
    labelsForTarget(fixture.attackerActor, "file", fixture.attackerFileId),
  );
  check("1: attacker は自分のファイルのラベルを読める", ownRead === null, detail(ownRead));

  const ownWrite = await caught(() =>
    setLabelsForTarget(fixture.attackerActor, "file", fixture.attackerFileId, [fixture.labelId]),
  );
  check(
    "2: attacker は自分のファイルのラベルを置き換えられる",
    ownWrite === null,
    detail(ownWrite),
  );

  const victimRead = await caught(() =>
    labelsForTarget(fixture.attackerActor, "file", fixture.victimFileId),
  );
  check(
    "3: attacker は他人のファイルのラベルを読めない",
    victimRead?.status === 404 && victimRead.code === "FILE_NOT_FOUND",
    detail(victimRead),
  );

  const beforeDeniedWrite = await assignmentCount();
  const victimWrite = await caught(() =>
    setLabelsForTarget(fixture.attackerActor, "file", fixture.victimFileId, [fixture.labelId]),
  );
  check(
    "4: attacker は他人のファイルのラベルを置き換えられない",
    victimWrite?.status === 404 && victimWrite.code === "FILE_NOT_FOUND",
    detail(victimWrite),
  );
  const afterDeniedWrite = await assignmentCount();
  check(
    "5: 拒否された書き込みで割り当て件数が変わらない",
    afterDeniedWrite === beforeDeniedWrite,
    `${beforeDeniedWrite} 件 → ${afterDeniedWrite} 件`,
  );

  const folderRead = await caught(() =>
    labelsForTarget(fixture.attackerActor, "folder", fixture.folderId),
  );
  check(
    "6: attacker は権限の無いフォルダのラベルを読めない",
    folderRead?.status === 403 && folderRead.code === "PERMISSION_DENIED",
    detail(folderRead),
  );

  const folderWrite = await caught(() =>
    setLabelsForTarget(fixture.attackerActor, "folder", fixture.folderId, [fixture.labelId]),
  );
  check(
    "7: attacker は権限の無いフォルダのラベルを置き換えられない",
    folderWrite?.status === 403 && folderWrite.code === "PERMISSION_DENIED",
    detail(folderWrite),
  );

  const adminWrite = await caught(() =>
    setLabelsForTarget(fixture.adminActor, "file", fixture.victimFileId, [fixture.labelId]),
  );
  check("8: admin は他人のファイルのラベルを置き換えられる", adminWrite === null, detail(adminWrite));

  const adminFolderRead = await caught(() =>
    labelsForTarget(fixture.adminActor, "folder", fixture.folderId),
  );
  check(
    "9: admin はフォルダのラベルを読める",
    adminFolderRead === null,
    detail(adminFolderRead),
  );

  // 🚨 10〜11: **ゴミ箱に入れたもののラベルは、もう触れない**（283 A・2026-08-16）。
  //    削除が「消す」から「印を立てる」に変わったので、`db(collection)` を素で引くと
  //    **消したファイルのラベルが読み書きできる**。実測でその状態を作って確かめる。
  //    🚨 ここは admin で測る（**行フィルタではなく `deleted_at` で落ちること**を見たいので、
  //    権限で落ちる利用者だと、どちらで落ちたのか区別できない）。
  await db("directus_files").where({ id: fixture.victimFileId }).update({ deleted_at: new Date() });
  const deletedRead = await caught(() =>
    labelsForTarget(fixture.adminActor, "file", fixture.victimFileId),
  );
  check(
    "10: ゴミ箱のファイルのラベルは読めない",
    deletedRead?.status === 404 && deletedRead.code === "FILE_NOT_FOUND",
    detail(deletedRead),
  );

  const beforeDeletedWrite = await assignmentCount();
  // 🚨 **空の一覧**を渡す。同じラベルを渡すと、置き換えが通っても件数が変わらず、
  //    12 が「拒否された」と「通った」で**同じ結果**になる（実測 2026-08-16: RED でも PASS した）。
  //    空なら、通れば割り当てが消えるので、件数で区別が付く。
  const deletedWrite = await caught(() =>
    setLabelsForTarget(fixture.adminActor, "file", fixture.victimFileId, []),
  );
  check(
    "11: ゴミ箱のファイルのラベルは置き換えられない",
    deletedWrite?.status === 404 && deletedWrite.code === "FILE_NOT_FOUND",
    detail(deletedWrite),
  );
  check(
    "12: 拒否された書き込みで割り当て件数が変わらない（ゴミ箱の側）",
    (await assignmentCount()) === beforeDeletedWrite,
    `${beforeDeletedWrite} 件 → ${await assignmentCount()} 件`,
  );

  // 🚨 対照: **戻せば、また触れる**（＝ 落ちた理由が `deleted_at` であることの裏づけ。
  //    権限や行フィルタで落ちていたなら、戻しても 404 のまま）。
  await db("directus_files").where({ id: fixture.victimFileId }).update({ deleted_at: null });
  const restoredRead = await caught(() =>
    labelsForTarget(fixture.adminActor, "file", fixture.victimFileId),
  );
  check("13: 🟢 対照 戻すと、また読める", restoredRead === null, detail(restoredRead));

  // ── ラベル側のソフトデリート（2026-08-16） ──────────────────────────
  // 🚨 ここまでは **ファイルがゴミ箱に在るとき**の話。以下は **ラベルがゴミ箱に在るとき**。
  //    どちらも「消えたものが読み書きに出てこない」だが、**外す場所が違う**
  //    （前者は対象の行フィルタ、後者は join 先のラベルの印）。
  const createdLabel = await createLabel(fixture.adminActor, { name: probeLabelName });
  await db("ohmycms_labels").where({ id: createdLabel.id }).update({ id: probeLabelId });
  await setLabelsForTarget(fixture.adminActor, "file", fixture.victimFileId, [probeLabelId]);
  const attachedBefore = (
    await labelsForTarget(fixture.adminActor, "file", fixture.victimFileId)
  ).some((label) => label.id === probeLabelId);
  check("14: 🟢 対照 消す前は、対象に付いて見える", attachedBefore, `付いている=${attachedBefore}`);

  const assignmentsBeforeDelete = await assignmentCount();
  await deleteLabel(fixture.adminActor, probeLabelId);

  const rowAfter = await db("ohmycms_labels")
    .where({ id: probeLabelId })
    .first<{ deleted_at: string | null } | undefined>();
  check(
    "15: 削除は行を消さず、印を立てる（ゴミ箱に出せる）",
    Boolean(rowAfter) && rowAfter?.deleted_at !== null,
    `行=${rowAfter ? "在る" : "無い"} / deleted_at=${rowAfter?.deleted_at ?? "null"}`,
  );
  check(
    "16: 🚨 割り当ての行は消えない（戻したときに付き直さなくてよい）",
    (await assignmentCount()) === assignmentsBeforeDelete,
    `${assignmentsBeforeDelete} 件 → ${await assignmentCount()} 件`,
  );

  const listed = (await listLabels(fixture.adminActor)).some((l) => l.id === probeLabelId);
  check("17: 一覧に出ない", !listed, `一覧に在る=${listed}`);
  const attachedAfter = (
    await labelsForTarget(fixture.adminActor, "file", fixture.victimFileId)
  ).some((label) => label.id === probeLabelId);
  check("18: 対象に付いたまま見えない", !attachedAfter, `付いて見える=${attachedAfter}`);
  const searched = await targetIdsByLabelName("file", probeLabelName);
  check("19: 検索でも引っかからない", searched.size === 0, `${searched.size} 件`);

  const reattach = await caught(() =>
    setLabelsForTarget(fixture.adminActor, "file", fixture.attackerFileId, [probeLabelId]),
  );
  check(
    "20: ゴミ箱のラベルは付け直せない（id を知っていても）",
    reattach?.status === 400 && reattach.code === "LABEL_NOT_FOUND",
    detail(reattach),
  );
  const recreate = await caught(() => createLabel(fixture.adminActor, { name: probeLabelName }));
  check(
    "21: 同じ名前は作れないが、**ゴミ箱に在ると分かる文言**になる",
    recreate?.status === 409 && recreate.code === "LABEL_EXISTS_TRASHED",
    detail(recreate),
  );

  // 🚨 対照: **戻すと、割り当ても含めて元どおり**（290 A「戻すと全部戻る」の実測）。
  await db("ohmycms_labels").where({ id: probeLabelId }).update({ deleted_at: null });
  const restoredAttached = (
    await labelsForTarget(fixture.adminActor, "file", fixture.victimFileId)
  ).some((label) => label.id === probeLabelId);
  check(
    "22: 🟢 対照 戻すと、ラベルも割り当ても戻る",
    restoredAttached,
    `付いて見える=${restoredAttached}`,
  );
}

async function main(): Promise<number> {
  try {
    await cleanupAuthzFixture();
    const fixture = await setupFixture();
    if (!fixture) return 2;
    await runChecks(fixture);
    console.log(failures === 0 ? "\nすべて通りました" : `\n落ちた項目: ${failures}`);
    return failures === 0 ? 0 : 1;
  } catch (error) {
    console.error(error);
    return 2;
  } finally {
    try {
      await cleanupAuthzFixture();
    } finally {
      await db.destroy();
    }
  }
}

process.exit(await main());
