/**
 * ショートカットが被っていないかを検査する。
 *
 * 由来（堀池・2026-08-15）:
 * > 「ショートカットのカスタム / **ショートカットは被ってはいけない**」
 *
 * 🚨 **「0 件」だけでは、検査したのか見ていないのかが区別できない。**
 *    そのため、わざと衝突させた対照（RED）も同じ実行の中で確認する。
 *    これが落ちるときは、検査自体が壊れている。
 */
import {
  SHORTCUTS,
  findConflicts,
  findDuplicateIds,
  type Shortcut,
} from "../lib/shortcuts/registry";

let failed = 0;
const fail = (message: string) => {
  console.error(`  ✗ ${message}`);
  failed++;
};

// 1) 本番の定義に衝突が無いこと
const conflicts = findConflicts();
if (conflicts.length > 0) {
  for (const ids of conflicts) fail(`同じキーに複数割り当て: ${ids.join(" / ")}`);
}

// 2) id の重複が無いこと
for (const id of findDuplicateIds()) fail(`id が重複: ${id}`);

// 3) 🚨 対照: わざと衝突させて、検出できることを確かめる
const decoy: Shortcut = { id: "__decoy__", key: "k", modifiers: ["mod"], labelKey: "__decoy__" };
const detected = findConflicts([...SHORTCUTS, decoy]);
if (!detected.some((ids) => ids.includes("__decoy__"))) {
  fail("対照が検出できない＝この検査は壊れている（0 件を信用してはいけない）");
}

if (failed > 0) {
  console.error(`ショートカットの検査: ${failed} 件の問題`);
  process.exit(1);
}
console.log(`ショートカットの検査: 問題なし（${SHORTCUTS.length} 件を検査。対照も検出できています）`);
