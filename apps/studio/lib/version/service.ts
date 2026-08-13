/**
 * バージョン確認（F2 §2-H）のドメイン層。
 *
 * 🚨 **このファイルの一番大事な性質: `OHMYCMS_UPDATE_FEED_URL` が未設定なら、
 *    fetch を1回も呼ばない。既定の問い合わせ先を持たない。**
 *
 * 理由（`knowledge/decisions/no-directus-fork.md`）: Directus のテレメトリ強制送信が
 * この CMS を自作した動機の1つ。「更新確認」を口実に、既定で外部へ問い合わせに行く
 * 実装にしてしまうと、自作した意味が無くなる。
 *
 * だからこのモジュールには**既定URLの定数が存在しない**。
 * URL は環境変数から来たものだけを使い、無ければ `checked: false` を返して終わる。
 *
 * 契約 §2-2: `next/*` を import しない。
 */

/** package.json から読む現在のバージョン。ビルド時に埋め込まれる。 */
import packageJson from "../../package.json" with { type: "json" };

export type VersionInfo = {
  /** いま動いているバージョン。 */
  current: string;
  /** git のコミット。分からなければ null（Docker では .git が無い）。 */
  commit: string | null;
  /** 更新確認の結果。 */
  update: UpdateCheck;
};

export type UpdateCheck =
  /** 確認先が設定されていないので**何もしなかった**。外部通信は発生していない。 */
  | { checked: false; reason: "not_configured" }
  /** 確認しに行ったが失敗した。 */
  | { checked: false; reason: "unreachable" | "invalid_response"; detail: string }
  /** 確認できた。 */
  | { checked: true; latest: string; isOutdated: boolean; url: string | null };

/**
 * 環境変数から更新確認先を読む。
 * **空文字は未設定として扱う**（compose が空文字を渡してくるため。
 * ここを `!== undefined` で判定すると、compose 経由で必ず通信しに行ってしまう）。
 */
export function updateFeedUrl(): string | null {
  const raw = process.env.OHMYCMS_UPDATE_FEED_URL?.trim();
  return raw ? raw : null;
}

/** ビルド時に埋め込まれたコミット。無ければ null。 */
function currentCommit(): string | null {
  const value = process.env.OHMYCMS_GIT_COMMIT?.trim();
  return value ? value : null;
}

/**
 * "1.2.3" 形式を比較する。プレリリース（-beta.1 など）は**必ず古い側**として扱い、
 * 「beta が出たので更新してください」と言わないようにする。
 * semver を丸ごと実装はしない（依存を増やさない・MVP に要らない）。
 */
export function isNewer(latest: string, current: string): boolean {
  const parse = (value: string) => {
    const [core] = value.replace(/^v/, "").split("-");
    const parts = core.split(".").map((n) => Number.parseInt(n, 10));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const hasPrerelease = (value: string) => value.includes("-");

  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  // 数字が同じなら、プレリリースは正式版より古い。
  return hasPrerelease(current) && !hasPrerelease(latest);
}

/**
 * 更新確認。
 *
 * @param options.timeoutMs 応答が無いときに諦めるまで。管理画面が固まらないよう短めにする
 * @returns 通信していない場合は必ず `{ checked: false, reason: "not_configured" }`
 */
export async function checkForUpdate(
  { timeoutMs = 3000 }: { timeoutMs?: number } = {},
): Promise<UpdateCheck> {
  const url = updateFeedUrl();

  // 🚨 ここが受入基準9 の本体。**未設定なら即 return し、fetch へ到達しない。**
  if (!url) return { checked: false, reason: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // 更新確認はキャッシュしない（古い結果で「最新です」と言わない）。
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return {
        checked: false,
        reason: "unreachable",
        detail: `HTTP ${response.status}`,
      };
    }
    const payload = (await response.json()) as unknown;
    const latest =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).version ??
          (payload as Record<string, unknown>).latest
        : undefined;
    const releaseUrl =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).url
        : undefined;

    if (typeof latest !== "string" || latest.length === 0) {
      return {
        checked: false,
        reason: "invalid_response",
        detail: "version（または latest）が文字列で入っていません",
      };
    }

    return {
      checked: true,
      latest,
      isOutdated: isNewer(latest, packageJson.version),
      url: typeof releaseUrl === "string" ? releaseUrl : null,
    };
  } catch (error) {
    // 🚨 例外の中身をそのまま外へ出さない（URL に認証情報が入っている場合がある）。
    const detail =
      error instanceof Error && error.name === "AbortError"
        ? `${timeoutMs}ms で応答がありませんでした`
        : "確認先へ接続できませんでした";
    return { checked: false, reason: "unreachable", detail };
  } finally {
    clearTimeout(timer);
  }
}

/** 管理画面へ出す一式。 */
export async function getVersionInfo(): Promise<VersionInfo> {
  return {
    current: packageJson.version,
    commit: currentCommit(),
    update: await checkForUpdate(),
  };
}
