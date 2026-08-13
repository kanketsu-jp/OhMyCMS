/**
 * 受入基準3（ブラウザ操作）と 4（CLI）。
 *
 * 🚨 4 は **実装を確かめずに PASS にしない**（F9h §2-2）。
 * 受入基準5・6（MCP）は 05-06-mcp.mjs に本実装がある。
 *
 * 3 はブラウザ自動操作を入れない方針（F9h §4）なので MANUAL。
 *   手順書は acceptance/manual-3.md。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "../lib/proc.mjs";
import { result } from "../lib/result.mjs";

/**
 * 実装の有無を判定する。憶測で PASS にしないための唯一の根拠。
 *
 * 🚨 **`dist/` の有無で「実装されているか」を判定しない。**
 *    dist はビルド成果物で `.gitignore` に入っており、clone 直後や CI では必ず無い。
 *    dist を根拠にすると「実装済みなのに永久に SKIP」という嘘をつく。
 *    実装の有無は **committed な package.json** で見て、
 *    ビルドが要るかどうかは別の情報として持つ（04-cli.mjs は必要ならビルドする）。
 */
function packageState(dir) {
  const root = join(REPO_ROOT, dir);
  if (!existsSync(root)) return { exists: false, built: false, note: `${dir} がありません` };
  if (!existsSync(join(root, "package.json"))) {
    return { exists: false, built: false, note: `${dir}/package.json がありません` };
  }
  const built = existsSync(join(root, "dist"));
  return {
    exists: true,
    built,
    note: built
      ? `${dir} は実装済み（ビルド成果物あり）`
      : `${dir} は実装済み（dist は未ビルド。dist は .gitignore なので通常は無い）`,
  };
}

/** SKIP の理由文。**exists と built を取り違えない**（以前ここが逆で、dist があっても「未ビルド」と出ていた）。 */
function skipReason(dir, state) {
  if (!state.exists) return `${dir} 未実装`;
  return state.built ? `${dir} は実装済みだがチェック未実装` : `${dir} は実装済み（dist 未ビルド）`;
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

// 受入基準4（CLI）は本物のチェックへ差し替え済み。checks/04-cli.mjs を参照。

// 受入基準5・6 は acceptance/checks/05-06-mcp.mjs へ移した（雛形を残すと SoT が2つになるため）
