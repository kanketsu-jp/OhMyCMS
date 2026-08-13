import "server-only";
import { getSettings } from "./service";

/**
 * 画面に出すサービス名を返す。
 *
 * 解決の順序は **設定（DB → 環境変数）→ 辞書** の3段。
 * - 設定に値があればそれを使う（GUI で変えたものが勝つ）
 * - 無ければ i18n 辞書の `common.app_name` を使う
 *
 * 🚨 **辞書は消さない。** 設定テーブルがまだ無い（マイグレーション前）状態でも
 * 画面が落ちないようにするためのフォールバックとして残してある。
 * したがってこの関数は **例外を投げない**。設定が読めなければ黙って辞書側へ倒す。
 *
 * @param fallback 辞書から取った名前（`tCommon("app_name")` の結果）
 */
export async function projectName(fallback: string): Promise<string> {
  try {
    const settings = await getSettings();
    const name = settings.project_name?.trim();
    return name && name.length > 0 ? name : fallback;
  } catch {
    // 設定テーブルが無い / DB へ繋がらない場合でも、名前を出せずに画面ごと落とさない
    return fallback;
  }
}
