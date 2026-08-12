/**
 * 受入基準7: UI が日本語（英語にも切り替わる）。ハードコードされた文言が無い。
 *
 * トラック C が既に3本のスクリプトを書いているので、**呼び出すだけ**にする（F9h §2）。
 * ここへコピーすると、C 側が直したときにハーネスが腐る。
 *
 * 肯定形 / 否定形の対:
 *   肯定形 … ja / en の両方に辞書が存在し、コードが呼ぶキーが実際に引ける
 *   否定形 … app/** components/** にハードコードされた文言が「無い」
 * ハードコード検出（否定形）だけでは、辞書が空でも通ってしまう。
 * だから「辞書が引ける」ことを先に確かめる。
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { run, REPO_ROOT } from "../lib/proc.mjs";
import { STATUS, assertion, result, statusFromAssertions } from "../lib/result.mjs";

const STUDIO = join(REPO_ROOT, "apps/studio");

const SCRIPTS = [
  {
    file: "scripts/check-i18n-keys.mjs",
    kind: "positive",
    label: "ja.json と en.json のキー集合が一致する",
  },
  {
    file: "scripts/check-i18n-usage.mjs",
    kind: "positive",
    label: "コードが呼ぶ辞書キーがすべて辞書に存在する",
  },
  {
    file: "scripts/check-i18n-hardcoded.mjs",
    kind: "negative",
    label: "app/** components/** にハードコードされた文言が無い",
  },
];

export async function check() {
  const started = Date.now();
  const assertions = [];
  const details = [];
  const repro = [];

  // ── 肯定形の土台: 辞書そのものが空でないこと ──
  // これを見ずにハードコード検出だけ通すと、「辞書が空だから何も引いていない」状態で
  // 緑になってしまう（否定形が自明に成立するパターン）。
  // 🚨 辞書のファイル構成はトラック C の都合で変わる（実際に ja.json 1枚から
  //    messages/<locale>/<namespace>.json へ再編された）。ファイル名を決め打ちすると
  //    ハーネスが黙って 0 件を数えて誤判定するので、必ず走査して数える。
  let jaCount = 0;
  let enCount = 0;
  try {
    jaCount = await countLocale(join(STUDIO, "i18n/messages"), "ja");
    enCount = await countLocale(join(STUDIO, "i18n/messages"), "en");
  } catch (error) {
    details.push(`辞書を読めませんでした: ${error?.message ?? error}`);
  }

  assertions.push(
    assertion("positive", "ja.json に文言がある", jaCount > 0, `${jaCount} 件`, "1 件以上"),
  );
  assertions.push(
    assertion("positive", "en.json に文言がある", enCount > 0, `${enCount} 件`, "1 件以上"),
  );

  // ── トラック C のスクリプトをそのまま呼ぶ ──
  for (const script of SCRIPTS) {
    const proc = await run("node", [script.file], { cwd: STUDIO, timeoutMs: 120_000 });
    const ok = proc.code === 0;
    assertions.push(
      assertion(script.kind, script.label, ok, `exit ${proc.code}`, "exit 0"),
    );
    if (!ok) {
      details.push(`${script.file} が exit ${proc.code} で落ちました:`);
      for (const line of (proc.stdout + proc.stderr).trim().split("\n").slice(-12)) {
        details.push(`    ${line}`);
      }
      repro.push(`(cd apps/studio && node ${script.file})`);
    }
  }

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 7,
    title: "UI が日本語・英語に切り替わる / ハードコード無し",
    status: verdict.status,
    positive: `ja ${jaCount} / en ${enCount} 件`,
    negative: assertions.find((a) => a.kind === "negative")?.ok ? "ハードコード 0" : "検出あり",
    details: [...details, ...verdict.details],
    repro,
    assertions,
    ms: Date.now() - started,
  });
}

/**
 * あるロケールの文言数を数える。ファイル構成に依らないよう、
 *   messages/<locale>.json           （1枚構成）
 *   messages/<locale>/*.json         （名前空間ごとの構成）
 * のどちらでも数えられるようにしてある。_fragments 等の作業用ディレクトリは除く。
 */
async function countLocale(messagesDir, locale) {
  const entries = await readdir(messagesDir, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    if (entry.isFile() && entry.name === `${locale}.json`) {
      total += countLeaves(JSON.parse(await readFile(join(messagesDir, entry.name), "utf8")));
    }
    if (entry.isDirectory() && entry.name === locale) {
      const files = await readdir(join(messagesDir, locale));
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        total += countLeaves(
          JSON.parse(await readFile(join(messagesDir, locale, file), "utf8")),
        );
      }
    }
  }
  return total;
}

/** ネストした辞書の葉（実際の文言）を数える。 */
function countLeaves(node) {
  if (typeof node === "string") return 1;
  if (node && typeof node === "object") {
    return Object.values(node).reduce((sum, v) => sum + countLeaves(v), 0);
  }
  return 0;
}

export const meta = { id: 7, needsServer: false };
export { STATUS };
