#!/usr/bin/env node
/**
 * オンボーディングの「画面が送る鍵」と「API が必須にする鍵」がずれていないかを静的に検査する。
 *
 * 🚨 なぜ要るか（2026-08-15 の実事故）:
 * `7b923d9` が**フォームからだけ** `tenant_name` を外し、API 側の検証はそのまま残った。
 * 結果、**「はじめる」も「あとで」も 400** になり、**新規インストールで初期設定を一度も終えられなかった**。
 * 🚨 **一日誰も気づかなかった。** `:3101` / `:3102` / `:3103` はどれも
 * `onboarding_completed_at` が入っていて `/onboarding` が 307 になるため、
 * **共有環境では誰もこの画面に到達できない**（Storybook の story は API に届かない）。
 * ＝ **「見ていない 0」の環境版。** 人が踏めない経路なので、機械で見るしかない。
 *
 * 見るもの（2 つ）:
 *   A. `completeOnboardingWithAdmin` が `validate()` に**オブジェクトリテラルを渡していない**こと
 *      🚨 これが事故の正体。`validate()` は `key in input` で省略を判定するので、
 *         リテラルに並べた瞬間、**送られてこなかった鍵も「在る（undefined）」になり全部必須**になる。
 *   B. 省略された鍵を落とす処理（`key in input`）が在ること
 *
 *   node scripts/check-onboarding-contract.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "lib/settings/service.ts";
const FORM = "components/admin/onboarding-form.tsx";

/**
 * `completeOnboardingWithAdmin` の本体だけを切り出す（次の `export ` まで）。
 *
 * 🚨 名前の**直後が `(`** であることまで見る。`indexOf("…WithAdmin")` の部分一致だと、
 *    `…WithAdminX` へリネームされた壊し方を見逃す（自己検査の囮4 で実際に見逃した）。
 */
function bodyOf(source) {
  const m = /export\s+async\s+function\s+completeOnboardingWithAdmin\s*\(/.exec(source);
  if (!m) return null;
  const rest = source.slice(m.index + 1);
  const next = rest.indexOf("\nexport ");
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * コメントを落とす。
 * 🚨 これが無いと、**説明文が実コードとして規則を満たしてしまう**。
 *    自己検査の囮2 で実際に起きた——`key in input` と書いた解説コメントが、
 *    実装を消したあとも規則を満たし続けていた。
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** 判定本体。壊した文字列でも呼べるように、ソースを引数で受ける。 */
function inspect(serviceSource, formSource) {
  const violations = [];
  const rawBody = bodyOf(serviceSource);
  const body = rawBody === null ? null : stripComments(rawBody);

  // 🚨 対象を切り出せないときは「違反 0」ではなく**失敗**にする。
  //    切り出せていないまま緑を返すと「何も見ていない緑」になる。
  if (!body || body.trim().length === 0) {
    violations.push({ rule: "not-found", message: `${SERVICE} の completeOnboardingWithAdmin を切り出せませんでした（関数名が変わった可能性）` });
    return { violations, bodyChars: 0 };
  }

  if (/validate\(\s*\{/.test(body)) {
    violations.push({
      rule: "literal-to-validate",
      message: "validate() にオブジェクトリテラルを渡しています。送られてこなかった鍵も『在る（undefined）』になり、**全部必須**になります（2026-08-15 の退行と同じ形）",
    });
  }

  if (!/if\s*\(\s*\w+\s+in\s+input\s*\)/.test(body)) {
    violations.push({
      rule: "no-omit-guard",
      message: "省略された鍵を落とす処理（`key in input`）が見当たりません。画面が聞くのをやめた項目が、そのまま必須になります",
    });
  }

  // 画面が必ず送る鍵。これが消えたら、そもそも保存できない。
  for (const key of ["new_password", "default_locale"]) {
    if (!stripComments(formSource).includes(`${key}:`)) {
      violations.push({ rule: "form-missing-key", message: `${FORM} が ${key} を送っていません` });
    }
  }

  return { violations, bodyChars: rawBody.length };
}

const serviceSource = readFileSync(resolve(root, SERVICE), "utf8");
const formSource = readFileSync(resolve(root, FORM), "utf8");

// ── 自己検査: 実物をメモリ上で壊して、検出できることをその場で確かめる ──
console.log("■ 自己検査（実物を壊して、検出できることをその場で確かめる）");
const probes = [
  {
    name: "囮1: validate() にオブジェクトリテラルを戻す（事故そのものの形）",
    service: serviceSource.replace(
      /const picked: Record<string, unknown> = \{\};/,
      'const patchX = validate({ project_name: input.project_name, tenant_name: input.tenant_name });\n  const picked: Record<string, unknown> = {};',
    ),
    form: formSource,
    expect: "literal-to-validate",
  },
  {
    name: "囮2: 省略された鍵を落とす処理を消す",
    service: serviceSource.replace(/if \(key in input\) picked\[key\] = input\[key\];/, "picked[key] = input[key];"),
    form: formSource,
    expect: "no-omit-guard",
  },
  {
    name: "囮3: 画面から new_password を落とす",
    service: serviceSource,
    form: formSource.replace(/new_password:/, "new_password_renamed:"),
    expect: "form-missing-key",
  },
  {
    name: "囮4: 関数名を変えて、切り出せなくする（＝何も見ていない緑を防ぐ）",
    service: serviceSource.replace("export async function completeOnboardingWithAdmin", "export async function completeOnboardingWithAdminX"),
    form: formSource,
    expect: "not-found",
  },
];

let selfCheckFailed = false;
for (const probe of probes) {
  if (probe.service === serviceSource && probe.form === formSource) {
    console.log(`  ❌ ${probe.name}  → **置換が当たっていません**（壊せていないので、この囮は何も言っていません）`);
    selfCheckFailed = true;
    continue;
  }
  const hit = inspect(probe.service, probe.form).violations.some((v) => v.rule === probe.expect);
  console.log(`  ${hit ? "✅" : "❌"} ${probe.name}  → ${hit ? `検出（rule: ${probe.expect}）` : `🚨 検出できていません（期待 rule: ${probe.expect}）`}`);
  if (!hit) selfCheckFailed = true;
}

// ── 判定 ──
const { violations, bodyChars } = inspect(serviceSource, formSource);
console.log(`\n■ 判定`);
console.log(`  対象: ${SERVICE}（completeOnboardingWithAdmin ${bodyChars} 文字）＋ ${FORM}`);
if (violations.length === 0) {
  console.log("  違反なし（＝画面が送らない鍵を API が必須にしていない）。");
} else {
  console.log(`  🚨 違反 ${violations.length} 件:`);
  for (const v of violations) console.log(`    [${v.rule}] ${v.message}`);
}

if (selfCheckFailed) {
  console.log("\n🚨 自己検査に失敗しました。この検査の緑は『異常が無い』ではなく『見ていない』かもしれません。");
  process.exit(1);
}
process.exit(violations.length > 0 ? 1 : 0);
