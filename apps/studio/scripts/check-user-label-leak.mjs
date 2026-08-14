#!/usr/bin/env node
/**
 * 内部専用の固定ユーザー（`LOCAL_ADMIN_EMAIL` = local-admin@localhost）が
 * 画面のラベルへ届く経路が無いことを、静的に確かめる。
 *
 * 由来: 2026-08-15。左サイドバーのアカウント行に `local-admin@localhost` が出ていた
 * （堀池のスクリーンショット）。`lib/settings/service.ts` は原文で
 * 「**利用者には一切見せない**（画面にもAPIレスポンスにも出さない）」と書いてある。
 *
 * 🚨 **この検査は、自分が本当に検出できることを毎回その場で証明する。**
 *    緑になっただけでは「異常が無い」のか「見ていない」のか区別が付かないため、
 *    実物を2通りに壊して**両方で赤くなること**を確かめてから、本番の判定を出す。
 *    さらに**壊した置換の件数を必ず表示する**。0 件のまま「赤くならなかった」を
 *    見逃すと、検査が効いていないのに合格に見える（BSD sed で実際に起きた事故）。
 *
 * 🚨 **この検査で分からないこと**（緑でも保証していない範囲。書いておかないと過信される）:
 *   - `userLabel={someVariable}` の `someVariable` の中身までは追わない（素通しは呼び出し元で見る）
 *   - `UserMenu` 以外の場所へメールを描く新しい経路は見ていない
 *   - 実行時の値は見ていない。**画面で出ていないことの確認はブラウザで別途行う**
 *
 *   node scripts/check-user-label-leak.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 判定に使う実物。壊すときもこの写しを差し替える。 */
const GUARD_FILE = "lib/admin/user-label.ts";

function read(file) {
  return readFileSync(resolve(root, file), "utf8");
}

/**
 * 違反を返す。sources は { ファイル名: 中身 } の写し（壊した版を渡せるようにするため）。
 *
 * 見るのは3つ:
 *   A. `userLabel={...}` に生のメールが直接入っていないか
 *   B. `userLabel={...}` が必ず `displayUserLabel(` を通っているか
 *   C. 見張り役（user-label.ts）が LOCAL_ADMIN_EMAIL と実際に**比較**しているか
 */
function findViolations(sources) {
  const violations = [];

  for (const [file, source] of Object.entries(sources)) {
    if (file === GUARD_FILE) continue;
    for (const m of source.matchAll(/userLabel=\{([^}]*)\}/g)) {
      const expression = m[1].trim();
      const line = source.slice(0, m.index).split("\n").length;
      if (/\.email\b/.test(expression)) {
        violations.push({ file, line, rule: "A", detail: "生のメールを直接渡している" });
        continue;
      }
      // 🚨 `userLabel={userLabel}` のような**素通し**は、ここでは違反にしない。
      //    値を作っているのは呼び出し元（layout.tsx）で、そこで B を見ている。
      //    素通しまで違反にすると、正しく直した後も永久に赤いままになる
      //    （実際に mobile-nav.tsx:139 がそうなった）。
      const isPassThrough = /^[A-Za-z_$][\w$]*$/.test(expression);
      if (!isPassThrough && !expression.includes("displayUserLabel(")) {
        violations.push({ file, line, rule: "B", detail: "displayUserLabel() を通していない" });
      }
    }
  }

  const guard = sources[GUARD_FILE];
  if (guard === undefined) {
    violations.push({ file: GUARD_FILE, line: 0, rule: "C", detail: "見張り役が無い" });
  } else if (!/===\s*LOCAL_ADMIN_EMAIL/.test(guard)) {
    // 🚨 「LOCAL_ADMIN_EMAIL という語がある」だけでは足りない。import しているだけでも通ってしまう。
    //    **比較している**ことまで見る（部分一致で終わらせない）。
    violations.push({ file: GUARD_FILE, line: 0, rule: "C", detail: "LOCAL_ADMIN_EMAIL と比較していない" });
  }

  return violations;
}

/** 実物を読み込む。 */
function loadSources() {
  const files = globSync("{app,components}/**/*.{ts,tsx}", { cwd: root }).sort();
  const sources = {};
  for (const file of files) sources[file] = read(file);
  sources[GUARD_FILE] = read(GUARD_FILE);
  return sources;
}

// ── 1) 自己検査: わざと壊して、赤くなることを確かめる ──────────────────────
// 壊し方は**2通り**。1通りだけだと「たまたま落ちた」が混ざる。

const selfTests = [
  {
    name: "壊し方1: 呼び出し側を、見張り役を通さない生の式に戻す",
    apply(sources) {
      const file = "app/(admin)/layout.tsx";
      const before = sources[file];
      const needle = "userLabel={displayUserLabel(me.ok ? me.data : null)}";
      const count = countOccurrences(before, needle);
      const after = before.replaceAll(
        needle,
        'userLabel={me.ok && me.data.type === "human" ? me.data.email : null}',
      );
      return { sources: { ...sources, [file]: after }, count };
    },
  },
  {
    name: "壊し方2: 見張り役から LOCAL_ADMIN_EMAIL の比較を取り除く",
    apply(sources) {
      const before = sources[GUARD_FILE];
      const needle = "if (me.email === LOCAL_ADMIN_EMAIL) return null;";
      const count = countOccurrences(before, needle);
      const after = before.replaceAll(needle, "");
      return { sources: { ...sources, [GUARD_FILE]: after }, count };
    },
  },
];

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const original = loadSources();
let selfTestFailed = false;

console.log("■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
for (const test of selfTests) {
  const { sources, count } = test.apply(original);
  const violations = findViolations(sources);
  // 🚨 置換が 0 件なら、壊せていない。「赤くならなかった」ではなく「壊れていない」が正しい。
  const ok = count > 0 && violations.length > 0;
  console.log(
    `  ${ok ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${violations.length} 件`,
  );
  if (count === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、赤くならないのは当然。検査の書き方が古い。");
  }
  if (!ok) selfTestFailed = true;
}

// ── 2) 本番の判定 ─────────────────────────────────────────────────────
const violations = findViolations(original);

console.log(`\n■ 判定`);
console.log(`  対象: ${Object.keys(original).length} ファイル（app/**, components/** ＋ ${GUARD_FILE}）`);
console.log(`  違反: ${violations.length} 件`);

if (violations.length > 0) {
  console.error("\n■ 内部識別子が画面のラベルへ届く経路");
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line}  ${v.detail}`);
  }
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

process.exit(violations.length === 0 && !selfTestFailed ? 0 : 1);
