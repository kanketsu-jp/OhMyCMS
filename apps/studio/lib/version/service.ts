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
import { getSettings } from "@/lib/settings/service";
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

export type BuildVersion = {
  /** ビルド時に焼かれた git commit SHA。未設定なら "unknown"。 */
  commit: string;
  /** ビルド時に作業ツリーへ未コミットの変更があったか。"0"=無い / "1"=有る / "unknown"=不明。 */
  dirty: "0" | "1" | "unknown";
  /** ビルド時刻（ISO8601）。未設定なら "unknown"。 */
  builtAt: string;
};

/**
 * 更新確認先を読む。**DB → 環境変数**の順（`projectLogo()` と同じ順序）。
 *
 * 由来: 堀池さん「**環境変数は最小にする。基本全て GUI、MCP、CLI で設定する。**」（2026-08-15）。
 * 環境変数は**初期値**として残す。GUI で保存された DB の設定が正なので先に読む。
 *
 * **空文字は未設定として扱う**（compose が空文字を渡してくるため。
 * ここを `!== undefined` で判定すると、compose 経由で必ず通信しに行ってしまう）。
 *
 * 🚨 **同期→非同期に変えた**（2026-08-16）。呼び出しは `checkForUpdate()` の 1 箇所だけで、
 *    そこは `/api/version` のリクエストの中なので、要求のたびに DB を読める（実測で確認）。
 * 🚨 DB が読めないときは**環境変数へ落ちる**。ここで例外を投げると、
 *    「更新確認が使えない」ではなく**版の画面ごと落ちる**（health の同期パスとは別だが、
 *    落とす価値は無い）。
 */
export async function updateFeedUrl(): Promise<string | null> {
  try {
    const settings = await getSettings();
    const fromDb = settings.update_feed_url?.trim();
    if (fromDb) return fromDb;
  } catch {
    // DB へ届かないときは環境変数だけで判断する（下へ落ちる）
  }
  const raw = process.env.OHMYCMS_UPDATE_FEED_URL?.trim();
  return raw ? raw : null;
}

/** ビルド時に埋め込まれたコミット。無ければ null。 */
function currentCommit(): string | null {
  const value = process.env.OHMYCMS_GIT_COMMIT?.trim();
  return value ? value : null;
}

/**
 * ビルド時に焼かれた版情報。**ネットワークアクセスを一切行わない**
 * （checkForUpdate() とは違い、health の同期パスから呼ばれるため）。
 * 環境変数が空文字/未設定なら "unknown" を返す（"unknown" を「一致」や「値あり」に読み替えないこと）。
 */
export function getBuildVersion(): BuildVersion {
  const dirty = process.env.OHMYCMS_GIT_DIRTY?.trim();
  const builtAt = process.env.OHMYCMS_BUILT_AT?.trim();

  return {
    commit: currentCommit() ?? "unknown",
    dirty: dirty === "0" || dirty === "1" ? dirty : "unknown",
    builtAt: builtAt ? builtAt : "unknown",
  };
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
  const url = await updateFeedUrl();

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
