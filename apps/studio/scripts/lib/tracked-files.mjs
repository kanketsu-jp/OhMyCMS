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
import { globSync } from "node:fs";
import { relative, resolve } from "node:path";

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
 * `globSync(pattern, { cwd })` と同じものを返し、**追跡していないファイルを落とす**。
 * 戻り値は `globSync` と同じく **cwd からの相対パス**。
 */
export function trackedGlob(pattern, options = {}) {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const tracked = trackedFiles();
  return globSync(pattern, options).filter((rel) => {
    const fromRepo = relative(REPO_ROOT, resolve(cwd, rel)).split("\\").join("/");
    return tracked.has(fromRepo);
  });
}

/** 追跡しているかを 1 本だけ問う（`readdirSync` で集めている検査のため）。 */
export function isTracked(absPath) {
  const fromRepo = relative(REPO_ROOT, resolve(absPath)).split("\\").join("/");
  return trackedFiles().has(fromRepo);
}
