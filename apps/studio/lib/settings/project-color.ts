import "server-only";
import { getSettings } from "./service";

/** 妥当な16進の色か。`service.ts` の保存時検証と同じ形にしてある。 */
const HEX = /^#[0-9a-fA-F]{3,8}$/;

/**
 * 画面に効かせるアクセント色を返す。読めない・不正なら `null`。
 *
 * 🚨 **この関数が無かったので `project_color` は「保存できるのに誰も読まない」状態だった。**
 * 設定画面では値も出所（環境変数 / この設定で保存済み）も正しく表示されるので、
 * **画面を見ているかぎり永久に気づかない**（`knowledge/decisions/verify-the-verifier.md` の 8番）。
 *
 * 🚨 `projectName()` と同じく**例外を投げない**。設定テーブルがまだ無い状態でも
 * 画面ごと落とさない（色が付かないだけ）。
 */
export async function projectColor(): Promise<string | null> {
  try {
    const value = (await getSettings()).project_color?.trim();
    return value && HEX.test(value) ? value : null;
  } catch {
    return null;
  }
}
