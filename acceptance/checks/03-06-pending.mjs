/**
 * 受入基準3（ブラウザ操作）と 4・5・6（CLI / MCP）。
 *
 * 🚨 4・5・6 は **PASS にしない**（F9h §2-2）。
 *   packages/cli と packages/mcp が出来ていない以上、通ったことにはできない。
 *   SKIP が1つでもあれば全体は未達。
 *
 * 3 はブラウザ自動操作を入れない方針（F9h §4）なので MANUAL。
 *   手順書は acceptance/manual-3.md。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "../lib/proc.mjs";
import { result } from "../lib/result.mjs";

/** 実装の有無を「ファイルがあるか」で判定する。憶測で PASS にしないための唯一の根拠。 */
function packageState(dir, binHint) {
  const root = join(REPO_ROOT, dir);
  if (!existsSync(root)) return { exists: false, note: `${dir} がありません` };
  if (!existsSync(join(root, "package.json"))) {
    return { exists: false, note: `${dir}/package.json がありません` };
  }
  const built = existsSync(join(root, "dist"));
  return {
    exists: true,
    built,
    note: built ? `${dir} はビルド済み` : `${dir} はあるが dist がありません（未ビルド）`,
    binHint,
  };
}

export function check3() {
  const manualPath = "acceptance/manual-3.md";
  const exists = existsSync(join(REPO_ROOT, manualPath));
  return result({
    id: 3,
    title: "ブラウザだけで一通り完結する",
    status: "MANUAL",
    reason: exists ? `手順書: ${manualPath}` : `手順書が見つかりません: ${manualPath}`,
    details: [
      "ブラウザの自動操作は入れない方針です（Playwright 等を足すと、MVP の判定より先に",
      "ハーネス自体の面倒を見ることになるため）。",
      `${manualPath} の手順どおりに操作し、各ステップの「合格の見え方」を確認してください。`,
    ],
    repro: [`open ${manualPath}`],
  });
}

export function check4() {
  const state = packageState("packages/cli", "ohmycms");
  return result({
    id: 4,
    title: "CLI で同じことができる",
    status: "SKIP",
    reason: state.exists ? "packages/cli は未ビルド" : "packages/cli 未実装",
    details: [
      state.note,
      "トラック B が F4 で作成中です。出来たら、この SKIP を",
      "「実際に CLI を叩いてコレクション作成・アイテム登録・ユーザー作成・トークン発行を行う」",
      "チェックに差し替えてください。**未実装のまま PASS にしないこと。**",
    ],
  });
}

export function check5() {
  const state = packageState("packages/mcp", "ohmycms-mcp");
  return result({
    id: 5,
    title: "MCP 経由で触れ、権限が同じように効く",
    status: "SKIP",
    reason: state.exists ? "packages/mcp は未ビルド" : "packages/mcp 未実装",
    details: [
      state.note,
      "トラック B が F5 で作成中です。差し替えるときは、受入基準8 と同じ作法で",
      "「権限のあるデータは MCP から見える（肯定形）」を先に確認してから",
      "「権限の無いデータは拒否される（否定形）」を見てください。",
    ],
  });
}

export function check6() {
  const state = packageState("packages/mcp", "ohmycms-mcp");
  return result({
    id: 6,
    title: "管理者トークンなら MCP から設定も編集できる",
    status: "SKIP",
    reason: state.exists ? "packages/mcp は未ビルド" : "packages/mcp 未実装",
    details: [
      state.note,
      "肯定形（管理者トークンでは設定を編集できる）と",
      "否定形（一般トークンでは編集できない）の対で書くこと。",
    ],
  });
}
