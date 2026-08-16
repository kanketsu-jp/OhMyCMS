/**
 * 検証スクリプトが辞書を読むための共通ローダー。
 *
 * ランタイム（i18n/messages.ts）は静的 import で辞書を組み立てるが、
 * Node の検証スクリプトは TS を読めないのでディスクから組み立てる。
 * **同じものを2通りで組み立てることになるので、両者がズレていないかを
 * assertLoaderInSync() で必ず突き合わせる**（片方だけ更新される事故を防ぐ）。
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..");
export const MESSAGES_DIR = resolve(ROOT, "i18n/messages");
export const LOCALES = ["ja", "en"];

/**
 * そのロケールの**索引に在る**名前空間名（ファイル名から）。
 *
 * 🚨 **`readdirSync`（作業ツリー）から `trackedGlob`（索引）へ変えた**（2026-08-16・toast）。
 *    辞書を読むのはコードと突き合わせる**照合型**の検査なので、
 *    **両側を同じ側から読まないと、赤の向きが裏返るだけ**になる
 *    （`decisions/checks-read-the-index-not-the-worktree.md`）。
 *    作業ツリーのままだと、**他ペインが辞書を書きかけている間、全員のコミットが止まる**。
 * 🚨 **名前を `OnDisk` から変えた**。中身が索引になったのに名前が「ディスク」だと、
 *    次に読む人が**作業ツリーを見ていると思って**使う。
 */
export function namespacesInIndex(locale) {
  return trackedGlob(`i18n/messages/${locale}/*.json`, { cwd: ROOT })
    .map((f) => f.replace(/^.*\//, "").replace(/\.json$/, ""))
    .sort();
}

/**
 * 名前空間ごとの JSON を1つの辞書に組み立てる（**索引から読む**）。
 *
 * 🚨 **手で叩いたときは、staged していない自分の変更が見えない。**
 *    門（lefthook）は staged で走るので commit 時は見えるが、
 *    **`node scripts/check-i18n-*.mjs` を素で叩くと、辞書の編集は `git add` するまで反映されない**。
 *    「直したのに検査が古いことを言う」ときは、**まず `git add` を疑うこと**。
 */
export function loadDictionary(locale) {
  const dict = {};
  for (const ns of namespacesInIndex(locale)) {
    const source = readTracked(resolve(MESSAGES_DIR, locale, `${ns}.json`));
    // 🚨 `trackedGlob` を通っているので null は来ないはず。来たら**黙って空にしない**
    //    （空の辞書は「キーが 1 つも無い」＝**全部が未定義**という嘘になる）。
    if (source === null) {
      throw new Error(
        `${locale}/${ns}.json を索引から読めませんでした。🚨 これは「空の辞書」ではありません`,
      );
    }
    dict[ns] = JSON.parse(source);
  }
  return dict;
}

/** 入れ子 JSON を "a.b.c" のフラットなキー集合にする。 */
export function flatten(value, prefix = "", out = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

/**
 * ディスク上の名前空間と、ランタイムのローダー（i18n/messages.ts）が
 * 取り込んでいる名前空間が一致しているかを検証する。
 *
 * 「JSON を足したのに messages.ts への登録を忘れた」＝画面にキー文字列が出る、
 * を機械的に検出するための守り。
 */
export function assertLoaderInSync() {
  // 🚨 ここも索引から読む（辞書側と同じ側で見ないと、片側だけ新しくなる）。
  const source = readTracked(resolve(ROOT, "i18n/messages.ts"));
  if (source === null) {
    return { ok: false, reason: "i18n/messages.ts を索引から読めません（追跡されていますか）" };
  }

  // NAMESPACES 配列に列挙されている名前
  const block = /export const NAMESPACES = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) {
    return { ok: false, reason: "i18n/messages.ts に NAMESPACES の宣言が見つかりません" };
  }
  const declared = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();

  const problems = [];
  for (const locale of LOCALES) {
    const disk = namespacesInIndex(locale);
    const missingInDeclared = disk.filter((ns) => !declared.includes(ns));
    const missingOnDisk = declared.filter((ns) => !disk.includes(ns));
    if (missingInDeclared.length) {
      problems.push(`${locale}: JSON はあるが NAMESPACES に無い → ${missingInDeclared.join(", ")}`);
    }
    if (missingOnDisk.length) {
      problems.push(`${locale}: NAMESPACES にあるが JSON が無い → ${missingOnDisk.join(", ")}`);
    }
    // import 文と DICTIONARIES への登録もあるか
    for (const ns of disk) {
      if (!source.includes(`/messages/${locale}/${ns}.json`)) {
        problems.push(`${locale}: ${ns}.json が i18n/messages.ts で import されていません`);
      }
    }
  }
  return problems.length === 0
    ? { ok: true, namespaces: declared }
    : { ok: false, reason: problems.join("\n  ") };
}
