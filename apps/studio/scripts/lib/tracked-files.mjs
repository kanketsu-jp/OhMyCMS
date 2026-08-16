/**
 * 検査が読むファイルを **git が追跡しているものだけ**に絞る。
 *
 * ■ なぜ要るか（2026-08-16・実際に全員が止まった）
 *   このリポジトリは **1 つの作業ツリーを 20 ペインで共有**している。
 *   検査が `globSync` で作業ツリーをそのまま読むと、**他のペインの書きかけ（未追跡）まで見える**。
 *   実測: `app/(admin)/admin/trash/` `components/admin/trash-manager.tsx`（design が実装中・未追跡）が
 *   `check-audit-coverage`（巡回していないページ 1 件）と `check-submit-once`（未防御 1 箇所）を赤くし、
 *   🚨 **そのファイルに触っていない人のコミットが止まった**。
 *
 *   ＝ 今日 3 回起きた「**変更した人と、落ちる人が違う**」の 3 回目。
 *   ①写しが古い → 関係ない人が落ちた ②mcp の正を変えた人が落ちず → 関係ない人が落ちた
 *   ③ここ。①②は `lefthook.yml` の glob で直した。③は「**何を読むか**」なのでここで直す。
 *
 * ■ なぜ「追跡済み」が正しい境界か（司令塔 2026-08-16 の決定）
 *   門が守っているのは **リポジトリに入るもの**。まだ `git add` していないものは入らない。
 *   🚨 そして `git ls-files` は **索引**を読むので、**`git add` した新規ファイルは含まれる**
 *   ＝ **add した瞬間に、本人の手元で落ちる**（＝ 直せる人が落ちる。抜け道にならない）。
 *
 * ■ 🚨 これで消えないもの（隠さず書く・toast の指摘）
 *   同じツリーを共有しているので、**他の人が `git add` した瞬間**、その人のファイルは
 *   こちらの門にも入ってくる。**消えるのは「まだ add していない」1 種類だけ**。
 *
 * ■ 使い方（`globSync` の差し替え。引数は同じ）
 *     import { trackedGlob } from "./lib/tracked-files.mjs";
 *     const files = trackedGlob("{app,components}/**\/*.tsx", { cwd: root });
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { matchesGlob, relative, resolve } from "node:path";

/** リポジトリの根（このファイルは apps/studio/scripts/lib/ に在る）。 */
const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..", "..", "..");

let cached = null;

/**
 * 追跡済みファイルの集合（リポジトリ相対・POSIX 区切り）。
 * 🚨 `git ls-files` は**索引**を読むので、staged した新規ファイルを含む。
 */
export function trackedFiles() {
  if (cached) return cached;
  const out = execFileSync("git", ["-C", REPO_ROOT, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const set = new Set(out.split("\0").filter(Boolean));
  // 🚨 **0 の顔**: 空なら「1 つも追跡していない」ではなく「git が動いていない / 場所が違う」。
  //    そのまま返すと、**全部の検査が「対象 0 件」で緑になる**（見ていない 0 が、異常が無い 0 の顔をする）。
  if (set.size === 0) {
    throw new Error(
      `git ls-files が 0 件でした（${REPO_ROOT}）。🚨 これは「追跡ファイルが無い」ではなく` +
        "**この関数が動いていない**合図です。検査を緑にしないでください",
    );
  }
  cached = set;
  return cached;
}

/**
 * `globSync(pattern, { cwd })` と同じ形で、**索引にあるファイルだけ**を返す。
 * 戻り値は `globSync` と同じく **cwd からの相対パス**（並びは安定させるため sort 済み）。
 *
 * 🚨 **一覧は索引そのものから採る。作業ツリーを glob して交差させない。**
 *   2026-08-16、saml が測って見つけた穴:
 *     旧実装は `globSync(作業ツリー) ∩ 追跡済み` だった
 *     ＝ 🚨 **索引に在って作業ツリーに無いファイルが、黙って一覧から落ちる**
 *        （他人が消している最中 / rename の途中 / stash した直後）
 *     実測（saml・別の検査）: `result.ts` を作業ツリーから外すと **読んだ本数が 5 → 4 に減り**、
 *     それでも「未追跡で飛ばした: 0 本」と出た ＝ **見ていないのに「全部見た」と読める**。
 *   → 索引の一覧（`git ls-files`）を `path.matchesGlob` で絞る。
 *     **他人の作業ツリー操作で、読む本数が変わらない。**
 */
export function trackedGlob(pattern, options = {}) {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const prefix = relative(REPO_ROOT, cwd).split("\\").join("/");
  const out = [];
  for (const fromRepo of trackedFiles()) {
    if (prefix && !fromRepo.startsWith(`${prefix}/`)) continue;
    const rel = prefix ? fromRepo.slice(prefix.length + 1) : fromRepo;
    if (matchesGlob(rel, pattern)) out.push(rel);
  }
  return out.sort();
}

/** 追跡しているかを 1 本だけ問う（`readdirSync` で集めている検査のため）。 */
export function isTracked(absPath) {
  const fromRepo = relative(REPO_ROOT, resolve(absPath)).split("\\").join("/");
  return trackedFiles().has(fromRepo);
}

/**
 * **索引にある版**のファイルを読む（`git show :<path>`）。追跡していなければ `null`。
 *
 * 🚨 なぜ要るか（2026-08-16・toast が見つけ、司令塔が採った形）:
 *   **存在を照合する検査**（宣言と実体を突き合わせるもの）で、**片側だけを索引に移すと
 *   赤の向きが裏返るだけ**になる。実測:
 *     ページの列挙を `trackedGlob`（索引）にし、巡回一覧を `readFileSync`（作業ツリー）のままにしたら
 *       変換前 …「実在するのに**巡回していない**ページ 1 件」（未追跡の実体が見えていた）
 *       変換後 … 🚨「巡回一覧に在るが**実在しない**ページ 1 件」（宣言だけ見えていた）
 *   → **両側を同じ側（索引）から読む**。すると「**どちらもまだ入っていない → 緑**」になり、
 *     書きかけの人が他人を落とさない。**入れた側だけ入っていれば、その人が落ちる。**
 *
 * 🚨 `null`（未追跡）を「中身が空」と同じに扱わないこと。
 *   呼ぶ側で「まだ入っていない」として**照合の対象から外す**か、明示的に落とすかを決める。
 */
/**
 * 🚨 **作業ツリーと索引で中身が違うファイル**の集合（リポジトリ相対）。
 *
 * これが要る理由は速度。最初の版は **1 ファイルごとに `git show :path` を起動**していて、
 * 292 ファイルを読む生成器が **40 秒でも終わらなくなった**（2026-08-16・saml が実測して報せた。
 * 「落ちるのではなく待たされる」ので、他の人には遅いとしか見えない形だった）。
 *
 * 🚨 **中身が同じなら、どちらから読んでも同じ**。だから
 *   ・違うファイル（ふつう数本）だけ `git show :path` を起動する
 *   ・それ以外はディスクから読む（**索引と 1 バイトも違わないので、索引を読んだのと同じ**）
 * とすると、起動回数が「全ファイル」から「変更中のファイル」に落ちる。
 */
let dirtyCache = null;
function dirtyPaths() {
  if (dirtyCache) return dirtyCache;
  // `git diff --name-only`（索引 ↔ 作業ツリー）。staged 済みの変更はここに出ないが、
  // その場合は**作業ツリー = 索引**なのでディスクから読んでよい。
  const out = execFileSync("git", ["-C", REPO_ROOT, "diff", "--name-only", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  dirtyCache = new Set(out.split("\0").filter(Boolean));
  return dirtyCache;
}

export function readTracked(absPath) {
  const fromRepo = relative(REPO_ROOT, resolve(absPath)).split("\\").join("/");
  if (!trackedFiles().has(fromRepo)) return null;
  if (!dirtyPaths().has(fromRepo)) {
    // 索引と同じ中身なので、ディスクから読む（`git show` を起動しない）
    try {
      return readFileSync(resolve(REPO_ROOT, fromRepo), "utf8");
    } catch {
      // 追跡済みなのにディスクに無い（削除して未 staged）→ 索引から読む
    }
  }
  return execFileSync("git", ["-C", REPO_ROOT, "show", `:${fromRepo}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
