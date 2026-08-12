/**
 * 検証スクリプトが辞書を読むための共通ローダー。
 *
 * ランタイム（i18n/messages.ts）は静的 import で辞書を組み立てるが、
 * Node の検証スクリプトは TS を読めないのでディスクから組み立てる。
 * **同じものを2通りで組み立てることになるので、両者がズレていないかを
 * assertLoaderInSync() で必ず突き合わせる**（片方だけ更新される事故を防ぐ）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..");
export const MESSAGES_DIR = resolve(ROOT, "i18n/messages");
export const LOCALES = ["ja", "en"];

/** そのロケールのディレクトリにある名前空間名（ファイル名から）。 */
export function namespacesOnDisk(locale) {
  return readdirSync(resolve(MESSAGES_DIR, locale))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** 名前空間ごとの JSON を1つの辞書に組み立てる。 */
export function loadDictionary(locale) {
  const dict = {};
  for (const ns of namespacesOnDisk(locale)) {
    dict[ns] = JSON.parse(readFileSync(resolve(MESSAGES_DIR, locale, `${ns}.json`), "utf8"));
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
  const source = readFileSync(resolve(ROOT, "i18n/messages.ts"), "utf8");

  // NAMESPACES 配列に列挙されている名前
  const block = /export const NAMESPACES = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) {
    return { ok: false, reason: "i18n/messages.ts に NAMESPACES の宣言が見つかりません" };
  }
  const declared = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();

  const problems = [];
  for (const locale of LOCALES) {
    const disk = namespacesOnDisk(locale);
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
