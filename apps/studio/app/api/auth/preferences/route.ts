import { requireHumanActor } from "@/lib/auth/context";
import { getUserPreferences, setUserPreference } from "@/lib/auth/preferences";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";
import { SHORTCUTS, type ShortcutName } from "@/components/admin/shortcuts";

export const runtime = "nodejs";

const PREFERENCE_KEY_MAX_LENGTH = 128;

function normalizeShortcut(value: string): string {
  const parts = value.toLowerCase().split("+");
  return [...parts.slice(0, -1).sort(), parts.at(-1)].join("+");
}

async function tiptapShortcuts(): Promise<Set<string>> {
  const modulePath = new URL("../../../../scripts/tiptap-combos.mjs", import.meta.url);
  const tiptapModule = (await import(modulePath.href)) as { tiptapCombos: () => { combos: Set<string> } };
  return tiptapModule.tiptapCombos().combos;
}

function shortcutName(key: string): ShortcutName {
  if (!key.startsWith("shortcut.")) throw new ApiError(400, "INVALID_PREFERENCE_KEY", "設定キーが正しくありません");
  const name = key.slice("shortcut.".length) as ShortcutName;
  if (!(name in SHORTCUTS)) throw new ApiError(400, "INVALID_PREFERENCE_KEY", "設定キーが正しくありません");
  return name;
}

function preferenceKey(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > PREFERENCE_KEY_MAX_LENGTH) {
    throw new ApiError(400, "INVALID_PREFERENCE_KEY", "設定キーが正しくありません");
  }
  return value;
}

/** 認証中の利用者自身の設定だけを返す。 */
export async function GET(request: Request) {
  try {
    const actor = await requireHumanActor(request);
    return ok({ data: await getUserPreferences(actor.userId), reservedShortcuts: [...(await tiptapShortcuts())] });
  } catch (error) {
    return errorResponse(error);
  }
}

/** 認証中の利用者自身の設定だけを1件保存する。 */
export async function PATCH(request: Request) {
  try {
    const actor = await requireHumanActor(request);
    const body = await readJsonObject(request);
    if ("userId" in body && body.userId !== actor.userId) {
      throw new ApiError(403, "PREFERENCE_OWNER_REQUIRED", "自分の設定だけ変更できます");
    }
    const key = preferenceKey(body.key);
    if (!("value" in body)) {
      throw new ApiError(400, "INVALID_BODY", "設定値を指定してください");
    }

    if (key.startsWith("shortcut.")) {
      const name = shortcutName(key);
      if (body.value !== null && typeof body.value !== "string") {
        throw new ApiError(400, "INVALID_SHORTCUT", "ショートカットが正しくありません");
      }
      if (typeof body.value === "string" && body.value.length > 0) {
        const combo = normalizeShortcut(body.value);
        if ((await tiptapShortcuts()).has(combo)) {
          throw new ApiError(409, "SHORTCUT_CONFLICT", "そのショートカットは本文の編集操作と重複しています");
        }
        const preferences = await getUserPreferences(actor.userId);
        const conflict = Object.entries(preferences).find(
          ([otherKey, value]) =>
            otherKey !== key && otherKey.startsWith("shortcut.") && typeof value === "string" && value.length > 0 && normalizeShortcut(value) === combo,
        );
        if (conflict) throw new ApiError(409, "SHORTCUT_CONFLICT", "そのショートカットは既に別の操作に割り当てられています");
      }
      void name;
    }
    await setUserPreference(actor.userId, key, body.value);
    return ok({ data: { key, value: body.value } });
  } catch (error) {
    return errorResponse(error);
  }
}
