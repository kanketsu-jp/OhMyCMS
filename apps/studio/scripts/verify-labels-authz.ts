/**
 * ラベル付け対象の認可ハーネス（サービス層）。
 *
 *   bun --filter @ohmycms/studio verify:labels-authz
 *
 * `labelsForTarget` / `setLabelsForTarget` が、対象行の rowFilter と
 * コレクション権限を本当に見ていることを測る。
 */
import { randomUUID } from "node:crypto";
import type { Actor } from "../lib/auth/context";
import { db } from "../lib/db/knex";
import { labelsForTarget, setLabelsForTarget } from "../lib/labels/service";
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

  const authzFiles = await db("directus_files")
    .select<{ id: string }[]>("id")
    .whereLike("filename_download", "authz-%");
  if (authzFiles.length > 0) {
    await db("ohmycms_label_assignments")
      .whereIn("target_id", authzFiles.map((file) => file.id))
      .delete();
    await db("directus_files")
      .whereIn("id", authzFiles.map((file) => file.id))
      .delete();
  }

  const authzFolders = await db("directus_folders")
    .select<{ id: string }[]>("id")
    .whereLike("name", "authz-%");
  if (authzFolders.length > 0) {
    await db("ohmycms_label_assignments")
      .whereIn("target_id", authzFolders.map((folder) => folder.id))
      .delete();
    await db("directus_folders")
      .whereIn("id", authzFolders.map((folder) => folder.id))
      .delete();
  }

  await db("directus_permissions").where({ policy: policyId }).delete();
  await db("directus_access").where({ policy: policyId }).delete();
  await db("directus_policies").where({ id: policyId }).delete();
  await db("directus_users").whereLike("email", "authz-%").delete();
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
  check("1: attacker は自分のファイルのラベルを読める", ownRead === null, `${ownRead?.status} ${ownRead?.code}`);

  const ownWrite = await caught(() =>
    setLabelsForTarget(fixture.attackerActor, "file", fixture.attackerFileId, [fixture.labelId]),
  );
  check(
    "2: attacker は自分のファイルのラベルを置き換えられる",
    ownWrite === null,
    `${ownWrite?.status} ${ownWrite?.code}`,
  );

  const victimRead = await caught(() =>
    labelsForTarget(fixture.attackerActor, "file", fixture.victimFileId),
  );
  check(
    "3: attacker は他人のファイルのラベルを読めない",
    victimRead?.status === 404 && victimRead.code === "FILE_NOT_FOUND",
    `${victimRead?.status} ${victimRead?.code}`,
  );

  const beforeDeniedWrite = await assignmentCount();
  const victimWrite = await caught(() =>
    setLabelsForTarget(fixture.attackerActor, "file", fixture.victimFileId, [fixture.labelId]),
  );
  check(
    "4: attacker は他人のファイルのラベルを置き換えられない",
    victimWrite?.status === 404 && victimWrite.code === "FILE_NOT_FOUND",
    `${victimWrite?.status} ${victimWrite?.code}`,
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
    `${folderRead?.status} ${folderRead?.code}`,
  );

  const folderWrite = await caught(() =>
    setLabelsForTarget(fixture.attackerActor, "folder", fixture.folderId, [fixture.labelId]),
  );
  check(
    "7: attacker は権限の無いフォルダのラベルを置き換えられない",
    folderWrite?.status === 403 && folderWrite.code === "PERMISSION_DENIED",
    `${folderWrite?.status} ${folderWrite?.code}`,
  );

  const adminWrite = await caught(() =>
    setLabelsForTarget(fixture.adminActor, "file", fixture.victimFileId, [fixture.labelId]),
  );
  check("8: admin は他人のファイルのラベルを置き換えられる", adminWrite === null, `${adminWrite?.status} ${adminWrite?.code}`);

  const adminFolderRead = await caught(() =>
    labelsForTarget(fixture.adminActor, "folder", fixture.folderId),
  );
  check(
    "9: admin はフォルダのラベルを読める",
    adminFolderRead === null,
    `${adminFolderRead?.status} ${adminFolderRead?.code}`,
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
