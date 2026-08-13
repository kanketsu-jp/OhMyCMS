import "server-only";
import { getSettings } from "./service";

/**
 * 画面に出すロゴの src を返す。無ければ null（＝文字だけで出す）。
 *
 * 順序は DB → 環境変数。環境変数は初期値で、GUI で保存された DB の設定が正なので先に読む。
 * DB はファイル ID、環境変数は URL で形が違うため、ここで src 文字列へ揃えて呼ぶ側に区別させない。
 */
export async function projectLogo(): Promise<string | null> {
  try {
    const settings = await getSettings();
    const id = settings.project_logo?.trim();
    // 🚨 `width` は**画面での最大幅 128px（max-w-32）の2倍**にしてある。
    // 64 で配信すると、480x48 のような横長のロゴが **64x6** まで縮められ、
    // それを 128px 幅で描くので**2倍に引き伸ばされてぼやける**（実測。高精細画面では4倍）。
    // `fit=contain` は変えないこと。`cover` にすると横長のロゴが切れる。
    if (id) return `/api/assets/${encodeURIComponent(id)}?width=256&fit=contain`;
    const url = process.env.OHMYCMS_PROJECT_LOGO_URL?.trim();
    return url && url.length > 0 ? url : null;
  } catch {
    return process.env.OHMYCMS_PROJECT_LOGO_URL?.trim() || null;
  }
}
