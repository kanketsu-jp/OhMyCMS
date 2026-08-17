import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { getTables } from "@/lib/schema/introspect";
import { ApiError } from "@/lib/schema/errors";
import { resolvePermission, type PermissionAction } from "@/lib/permissions/resolve";

export type EffectiveCollectionView = {
  collection: string;
  read: boolean;
  write: boolean;
  delete: boolean;
  rowFiltered: boolean;
  fieldsRestricted: boolean;
  fields: string[] | "*";
};

export async function getEffectiveView(userId: string): Promise<EffectiveCollectionView[]> {
  const user = await db("directus_users")
    .select("id", "role")
    .where({ id: userId })
    .first<{ id: string; role: string | null }>();
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "その利用者は見つかりません");

  const actor: Actor = {
    type: "human",
    userId: user.id,
    email: "",
    role: user.role,
    picture: null,
    avatarEmoji: null,
    firstName: null,
    lastName: null,
  };
  const collections = await getTables();
  const actions: PermissionAction[] = ["read", "create", "update", "delete"];
  const results = await Promise.all(
    collections.map(async (collection) => {
      const permissions = await Promise.all(
        actions.map((action) => resolvePermission(actor, collection, action)),
      );
      const read = permissions[0];
      const write = permissions[1].allowed || permissions[2].allowed;
      return {
        collection,
        read: read.allowed,
        write,
        delete: permissions[3].allowed,
        rowFiltered: read.allowed && read.rowFilter !== null,
        fieldsRestricted: read.allowed && read.allowedFields !== "*",
        fields: read.allowedFields,
      };
    }),
  );

  return results;
}
