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
 * 見るもの（4 つ）:
 *   A. `completeOnboardingWithAdmin` が `validate()` に**オブジェクトリテラルを渡していない**こと
 *      🚨 これが事故の正体。`validate()` は `key in input` で省略を判定するので、
 *         リテラルに並べた瞬間、**送られてこなかった鍵も「在る（undefined）」になり全部必須**になる。
 *   B. 呼び出し側に、省略された鍵を落とす処理（`key in input`）が在ること
 *   C. 🚨 **`validate()` 自身が「送られてこなかった鍵を飛ばす」処理を持っていること**
 *      （C を足した理由は `validateBodyOf` の説明を読むこと。**A と B だけだと、
 *        呼び出し側が正しいまま `validate()` が変わって、緑のまま壊れる**）
 *   D. 画面が `new_password` / `default_locale` を送っていること
 *
 *   node scripts/check-onboarding-contract.mjs
 *
 * ## 🚨 この守り手が**見ていない範囲**（司令塔 2026-08-15「守り手の穴も1行添える」）
 *
 * **これは「ソースの形」だけを見る静的な検査で、「初期設定が通ること」は保証しません。**
 *
 *   ❌ **実行時の応答（200 か 400 か）は見ていない**
 *      → それを踏むのは受入ハーネスの **V1-E**（`acceptance/checks/v1-e-first-run.mjs`）。
 *        あちらは初回状態のインスタンスを立てて、実際に両ボタンを送る
 *   ❌ **`validate()` の中の他の条件**（255 文字・locale の値・色の形式…）は見ていない
 *      → それらで 400 になっても、この検査は緑のまま
 *   ❌ **画面が送る鍵のうち `new_password` / `default_locale` 以外**は見ていない
 *      （`project_name` や `project_logo` が消えても気づかない）
 *   ❌ **他の入口**（`/api/settings` など、同じ `validate()` を通る経路）は見ていない
 *
 * ＝ **この検査が緑でも、初期設定が通るとは限りません。** 止められるのは
 * **「画面が送らない鍵を、API が必須にしてしまう」形の退行だけ**です。
 *
 * ## 🚨 規則ごとの「出どころ」（司令塔 2026-08-15「実際に起きたと起きうるを分けて書く」）
 *
 * **次の人が優先度を判断できるように、実際に踏んだものと、先回りで塞いだものを分ける。**
 *
 *   `literal-to-validate`   🔥 **実際に起きた**（2026-08-15 `7b923d9`。約10時間、初期設定が終えられなかった）
 *   `no-omit-guard`         🔥 同上の直しを守るもの
 *   `validate-requires-all` ⚠️ **穴は実測、事象は未発生**——呼び出し側を変えずに `validate()` の
 *                              1 行を壊したら**この検査が緑のままだった**ことを確認して塞いだ。
 *                              **実際にそう壊された事実はまだ無い**
 *   `validate-not-found`    ⚠️ 先回り（上と対）
 *   `not-found`             ⚠️ 先回り（「何も見ていない緑」を防ぐため）
 *   `form-missing-key`      ⚠️ 先回り（送信の本文が空になる形は、まだ起きていない）
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
 * `validate()` の本体を切り出す。
 *
 * 🚨 **なぜ呼び出し側だけでは足りないか（司令塔 2026-08-15「3段目: その守りは副作用で成立していないか」）。**
 * 当初この検査は `completeOnboardingWithAdmin`（呼び出し側）しか見ていなかった。
 * だが「送られてこなかった鍵を飛ばす」という**性質そのものは `validate()` の中に在る**
 * （`if (!(key in input)) continue;`）。
 * **実測**: 呼び出し側を一切変えずに `validate()` のこの行だけを壊したところ、
 * **この検査は exit 0（緑）のまま**だった。＝ **私の守りは validate() の実装に乗っていた。**
 * → **乗っている先も見る。**
 */
function validateBodyOf(source) {
  const m = /function\s+validate\s*\(/.exec(source);
  if (!m) return null;
  const rest = source.slice(m.index + 1);
  // 次のトップレベル宣言まで
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s|\nexport\s+(?:const|type)\s/);
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * コメントと文字列リテラルを落とす。**規則は実コードだけに当てる。**
 *
 * 🚨 コメントを落とす理由: これが無いと**説明文が実コードとして規則を満たす**。
 *    自己検査の囮2 で実際に起きた——`key in input` と書いた解説コメントが、
 *    実装を消したあとも規則を満たし続けていた。
 *
 * 🚨 文字列リテラルも落とす理由（2026-08-16 実測・「まだ出番が来ていない過検出」）:
 *    `const note = "validate({ … }) の形には戻さないこと";` のように
 *    **この規則を文字列で説明した瞬間、その説明自体が違反として拾われた**（実測 exit=1）。
 *    **いま 0 件だから気づいていなかっただけ**で、**誰かが書いた瞬間に赤くなる**形だった。
 *    ＝ **経緯を残せと言いながら、その経緯を罰する**検査になっていた。
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    // 🚨 文字列・テンプレートリテラルの**中身**を消す（引用符は残して構文を壊さない）
    .replace(/"[^"\n]*"/g, '""')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/`[^`]*`/g, "``");
}

/** 判定本体。壊した文字列でも呼べるように、ソースを引数で受ける。 */
function inspect(serviceSource, formSource) {
  const violations = [];
  const rawBody = bodyOf(serviceSource);
  const body = rawBody === null ? null : stripComments(rawBody);

  // 🚨 対象を切り出せないときは「違反 0」ではなく**失敗**にする。
  //    切り出せていないまま緑を返すと「何も見ていない緑」になる。
  if (!body || body.trim().length === 0) {
    violations.push({ rule: "not-found", message: `${SERVICE} の中に `+"`export async function completeOnboardingWithAdmin(`"+` が見つかりませんでした。🚨 **原因は1つに決まりません**——名前が変わった / 関数が消えた / 別ファイルへ移った / この検査の探し方が古い、のどれかです。**まず ${SERVICE} を開いて、関数が在るかを目で見てください**` });
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

  // 🚨 乗っている先（validate）も見る。ここが変わると、呼び出し側が正しくても全部必須になる。
  const rawValidate = validateBodyOf(serviceSource);
  const validateBody = rawValidate === null ? null : stripComments(rawValidate);
  if (!validateBody || validateBody.trim().length === 0) {
    violations.push({ rule: "validate-not-found", message: "同ファイルの中に `function validate(` が見つかりませんでした。🚨 **原因は1つに決まりません**——名前が変わった / 消えた / 別ファイルへ移った / この検査の探し方が古い。**まず該当ファイルを開いて目で見てください**" });
  } else if (!/if\s*\(\s*!\s*\(\s*\w+\s+in\s+input\s*\)\s*\)/.test(validateBody)) {
    violations.push({
      rule: "validate-requires-all",
      message: "validate() が「送られてこなかった鍵を飛ばす」処理を持っていません。呼び出し側が正しくても、**全部の鍵が必須**になります（2026-08-15 の退行と同じ結果）",
    });
  }

  // 画面が必ず送る鍵。これが消えたら、そもそも保存できない。
  for (const key of ["new_password", "default_locale"]) {
    if (!stripComments(formSource).includes(`${key}:`)) {
      violations.push({ rule: "form-missing-key", message: `${FORM} の中に `+"`${key}:`"+` という文字列がありません。🚨 **「送っていない」と断定はできません**——動的に組み立てている / 別ファイルへ移した、でも同じ結果になります。**送信の本文を目で確かめてください**` });
    }
  }

  return { violations, bodyChars: rawBody.length };
}

/**
 * 対象を読む。
 *
 * 🚨 **読めなかったときに `node:fs` の生スタックを出さない。**
 * 2026-08-15、別の検査でまさにこれが起き、**「違反が出た」と読みかけた**（cwd 違いだった）。
 * 「**違反がある**」と「**そもそも読めていない**」は別の話なので、別の文言・別の終了コードにする。
 * 🚨 **cwd を必ず出す**（今日、cwd 違いで 2 人が踏んでいる）。
 */
function readTarget(relative) {
  const full = resolve(root, relative);
  try {
    return readFileSync(full, "utf8");
  } catch (error) {
    console.log(
      `🚨 中止: ${relative} を読めませんでした（${error.code ?? error.message}）。\n` +
        `  **検査が失敗した**のであって、違反が見つかったのではありません。\n` +
        `  探した場所: ${full}\n` +
        `  いまの cwd: ${process.cwd()}\n` +
        `  正しい走らせ方: cd apps/studio && node scripts/check-onboarding-contract.mjs`,
    );
    process.exit(2);
  }
}

const serviceSource = readTarget(SERVICE);
const formSource = readTarget(FORM);

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
    name: "囮5: validate() の「省略された鍵を飛ばす」処理を壊す（呼び出し側はそのまま）",
    service: serviceSource.replace("    if (!(key in input)) continue;", "    // (壊した)"),
    form: formSource,
    expect: "validate-requires-all",
  },
  {
    name: "囮6: validate() の名前を変えて、切り出せなくする",
    service: serviceSource.replace("function validate(input:", "function validateX(input:"),
    form: formSource,
    expect: "validate-not-found",
  },
  {
    name: "囮4: 関数名を変えて、切り出せなくする（＝何も見ていない緑を防ぐ）",
    service: serviceSource.replace("export async function completeOnboardingWithAdmin", "export async function completeOnboardingWithAdminX"),
    form: formSource,
    expect: "not-found",
  },
];

/**
 * 🚨 **「検出されてはいけないもの」** の対照（司令塔 2026-08-16）。
 * これまでの囮 6 つは**全部「検出される側」**だった。
 * **逆方向が無いと、過検出は永久に捕まらない。**
 * ここが ❌ になったら、**正しく書いてあるコードを違反と言っている**ということ。
 */
const negatives = [
  {
    name: "対照(-)1: コメントの中に validate({ と書く（実コードではない）",
    service: serviceSource.replace(
      "  const picked: Record<string, unknown> = {};",
      "  // 以前は validate({ project_name: input.project_name }) と書いていた\n  const picked: Record<string, unknown> = {};",
    ),
    form: formSource,
  },
  {
    name: "対照(-)3: 文字列リテラルの中に validate({ と書く（この規則を文字列で説明した形）",
    service: serviceSource.replace(
      "  const picked: Record<string, unknown> = {};",
      '  const zzNote = "validate({ project_name }) の形には戻さないこと";\n  const picked: Record<string, unknown> = {};',
    ),
    form: formSource,
  },
  {
    name: "対照(-)2: 正しいまま、ループ変数の名前だけ変える（key → field）",
    service: serviceSource
      .replace("for (const key of ONBOARDING_INPUT_KEYS) {", "for (const field of ONBOARDING_INPUT_KEYS) {")
      .replace("if (key in input) picked[key] = input[key];", "if (field in input) picked[field] = input[field];"),
    form: formSource,
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

console.log("\n■ 対照(-)（検出されてはいけないもの。ここが ❌ なら過検出）");
for (const n of negatives) {
  if (n.service === serviceSource && n.form === formSource) {
    console.log(`  ❌ ${n.name}  → **置換が当たっていません**（変えられていないので、この対照は何も言っていません）`);
    selfCheckFailed = true;
    continue;
  }
  const found = inspect(n.service, n.form).violations;
  const ok = found.length === 0;
  console.log(`  ${ok ? "✅" : "❌"} ${n.name}  → ${ok ? "検出 0 件（正しい）" : `🚨 **過検出** ${found.map((v) => v.rule).join(",")}`}`);
  if (!ok) selfCheckFailed = true;
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
