import {
  ALL_ADMIN_CAPABILITIES,
  type AdminCapability,
  type AgentCapabilities,
  type PermissionAction,
} from "@ohmycms/sdk";
import { flagString, type ParsedArgs } from "./args.js";
import { usageError } from "./errors.js";

const ACTIONS: readonly PermissionAction[] = ["read", "create", "update", "delete"];

/**
 * `--admin-capability schema:read,schema:write` を読む。`all` で全部。
 *
 * 🚨 API 側は **admin capability を明示しないと管理操作を全部拒否する**
 * （403 CAPABILITY_DENIED）。「管理もできるトークン」を作るときは必ず渡すこと。
 */
export function adminCapabilities(
  args: ParsedArgs,
  fallback: readonly AdminCapability[] = [],
): AdminCapability[] {
  const raw = flagString(args, "admin-capability");
  if (raw === undefined) return [...fallback];
  if (raw === "all") return [...ALL_ADMIN_CAPABILITIES];

  const requested = raw.split(",").map((part) => part.trim()).filter(Boolean);
  for (const value of requested) {
    if (!(ALL_ADMIN_CAPABILITIES as readonly string[]).includes(value)) {
      throw usageError(
        `使えない管理 capability です: ${value}`,
        `使えるのは ${ALL_ADMIN_CAPABILITIES.join(" / ")} と all です。`,
      );
    }
  }
  return requested as AdminCapability[];
}

/**
 * `--collection-capability articles:read,create` を読む（繰り返し指定できる）。
 * 値を省くと 4 アクション全部（`--collection-capability articles`）。
 */
export function collectionCapabilities(
  argv: readonly string[],
): Record<string, PermissionAction[]> {
  const result: Record<string, PermissionAction[]> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    let raw: string | undefined;
    if (arg === "--collection-capability") raw = argv[i + 1];
    else if (arg.startsWith("--collection-capability=")) {
      raw = arg.slice("--collection-capability=".length);
    } else continue;

    if (!raw || raw.startsWith("--")) {
      throw usageError(
        "--collection-capability は <コレクション>[:<アクション,...>] の形で指定してください",
        "例: --collection-capability articles:read,create",
      );
    }

    const separator = raw.indexOf(":");
    const name = separator === -1 ? raw : raw.slice(0, separator);
    const actionsRaw = separator === -1 ? "" : raw.slice(separator + 1);
    const actions =
      actionsRaw === ""
        ? [...ACTIONS]
        : actionsRaw.split(",").map((part) => part.trim()).filter(Boolean);

    for (const action of actions) {
      if (!(ACTIONS as readonly string[]).includes(action)) {
        throw usageError(
          `使えないアクションです: ${action}`,
          `使えるのは ${ACTIONS.join(" / ")} です。`,
        );
      }
    }
    result[name] = actions as PermissionAction[];
  }

  return result;
}

export type BuiltCapabilities = {
  capabilities: AgentCapabilities | undefined;
  /** 利用者に見せる注意。空なら何も出さない */
  warnings: string[];
};

/**
 * トークン発行時に渡す capabilities を組み立てる。
 *
 * 🚨 **API の落とし穴（2026-08-13 実測）**: `capabilities` を一度でも指定すると、
 * `collections` を明示しない限り items が**すべて 403 PERMISSION_DENIED になる**。
 * `capabilityAllows()` は `capabilities` が null のときだけ「委任元の権限を継承」し、
 * オブジェクトが入っていると `capabilities.collections[<名前>]` の完全一致でしか許可しないため
 * （ワイルドカードは無い）。admin だけ付けたトークンは「テーブルは作れるが行は書けない」になる。
 */
export function buildCapabilities(
  admin: readonly AdminCapability[],
  collections: Record<string, PermissionAction[]>,
): BuiltCapabilities {
  const hasAdmin = admin.length > 0;
  const hasCollections = Object.keys(collections).length > 0;

  if (!hasAdmin && !hasCollections) {
    // 何も指定しない = capabilities を送らない = 委任元の権限をそのまま継承（管理操作は不可）
    return { capabilities: undefined, warnings: [] };
  }

  const warnings: string[] = [];
  if (hasAdmin && !hasCollections) {
    warnings.push(
      "管理 capability だけを指定したため、このトークンでは items の読み書きが 403 になります。" +
        "行も扱うなら --collection-capability <コレクション>:read,create,update,delete を足してください。",
    );
  }

  return {
    capabilities: {
      ...(hasAdmin ? { admin: [...admin] } : {}),
      ...(hasCollections ? { collections } : {}),
    },
    warnings,
  };
}
