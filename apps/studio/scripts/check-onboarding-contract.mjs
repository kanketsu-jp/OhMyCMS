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
 *   ❌【書いただけ】**実行時の応答（200 か 400 か）は見ていない**
 *      → それを踏むのは受入ハーネスの **V1-E**（`acceptance/checks/v1-e-first-run.mjs`）。
 *        あちらは初回状態のインスタンスを立てて、実際に両ボタンを送る
 *   ❌【書いただけ】**`validate()` の中の他の条件**（255 文字・locale の値・色の形式…）は見ていない
 *      → それらで 400 になっても、この検査は緑のまま
 *   ❌【書いただけ】**画面が送る鍵のうち `new_password` / `default_locale` 以外**は見ていない
 *      （`project_name` や `project_logo` が消えても気づかない）
 *   ❌【書いただけ】**他の入口**（`/api/settings` など、同じ `validate()` を通る経路）は見ていない
 *
 * 🚨 **ここから下は「思いつき」ではなく、見逃す入力を作って通して確かめたもの**
 *    （2026-08-16・司令塔 → 全員「見逃す入力を 3〜6 通り自分で作って通す」）。
 *    走らせるたびに ■ 見逃す入力 の節で再確認されるので、**拾えるようになったら ✅ に変わる**。
 *    **実測: 作った 5 本のうち 4 本を見ていない**（🟢 対照(+) 素直な literal は拾う＝検出器は動いている）。
 *
 *   ❌【鳴る】**`validate({` と書かずに literal を混ぜる形**（`Object.assign({}, picked, {...})` 等）
 *      → 規則は `validate(` の直後の `{` しか見ていない
 *   ❌【鳴る】**`ONBOARDING_INPUT_KEYS` に画面が送らない鍵を足す形**
 *      → 🚨 **この一覧は、誰とも突き合わせていない**。足すだけで必須が増える
 *   ❌【鳴る】**`validate()` の門番を、必須の判定より後ろへ動かす形**
 *      → 規則は「その 1 行が在るか」しか見ていない。**順序は見ていない**
 *   ❌【鳴る】**画面と API で鍵の綴りがずれる形**（画面 `default_locale` / API `defaultLocale`）
 *      → `form-missing-key` は**画面側に文字列が在るか**しか見ていない
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

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 見にいく先。既定は**このスクリプトの隣**（＝ `apps/studio`）。
 *
 * 🚨 **`OHMYCMS_CHECK_ROOT` で別のツリーを指せる。門ごしの RED を測るための口。**
 *
 * この検査は `readFileSync` で **作業ツリー**を読む（staged の中身ではない）。
 * したがって **RED を測るために共有ツリーの `service.ts` を壊すと、戻すまでのあいだ、
 * 他のペインのコミットまで赤くなる**。実証（2026-08-16・共有 index は汚さず `GIT_INDEX_FILE` の写しで）:
 * ```
 * 🟢 壊す前 `apps/studio/next.config.ts` だけを staged → onboarding-contract ✔️ exit 0
 * 🔴 壊した後 **同じ staged・同じ人** → 🚨 exit 1
 *    しかも出るのは「対照(-)1 過検出」——**オンボーディングと無関係な人には意味が分かりません**
 * ```
 * 私（onboard）は今日これを **7 回**やった。1 回も事故にならなかったのは運です。
 *
 * → **門ごしの RED は、切った台の上で測る:**
 * ```
 * git worktree add --detach /tmp/red <sha> && <そこで壊す>
 * OHMYCMS_CHECK_ROOT=/tmp/red/apps/studio node apps/studio/scripts/check-onboarding-contract.mjs
 * ```
 * 🚨 **規則そのものの RED は、壊さなくても測れる**（囮が `inspect()` を文字列で呼ぶ）。
 *    ツリーを壊す必要があるのは「**lefthook が本当に止めるか**」を見るときだけ。
 */
const root = process.env.OHMYCMS_CHECK_ROOT
  ? resolve(process.env.OHMYCMS_CHECK_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  // 🚨 **消すのではなく、同じ長さの空白へ置き換える**（改行だけ残す）。
  //    長さが変わると、ここで見つけた位置を**元のファイルの行番号へ写せない**。
  //    2026-08-16 に「拾った生の行を出す」ことにしたので、位置が要るようになった
  //    （司令塔 → 全員「自分の検査が数だけを出しているなら、拾った行を 1〜3 本添えて」）。
  //    🟢 中身を消すという振る舞いは変えていない（囮 6 本・対照 3 本がそのまま判定する）。
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^[ \t]*\/\/.*$/gm, blank)
    // 🚨 文字列・テンプレートリテラルの**中身**を消す（引用符は残して構文を壊さない）
    .replace(/"[^"\n]*"/g, (m) => `"${" ".repeat(Math.max(0, m.length - 2))}"`)
    .replace(/'[^'\n]*'/g, (m) => `'${" ".repeat(Math.max(0, m.length - 2))}'`)
    .replace(/`[^`]*`/g, (m) => "`" + blank(m.slice(1, -1)) + "`");
}

/**
 * 拾った生の行を返す（🚨 数だけを出さないため）。
 *
 * `body` は `stripComments` を通した文字列で、**元ファイルと長さが揃っている**ので、
 * ここで得た位置に `bodyOffset` を足せばファイル内の位置になる。
 * 表示する中身は **元のソース**から採る（空白化した後のものを見せても読めないため）。
 */
function evidence(re, body, bodyOffset, fileSource, label) {
  const m = re.exec(body);
  if (!m) return `${label}: 🚨 位置を取れませんでした（検出はしています）`;
  const at = bodyOffset + m.index;
  const line = fileSource.slice(0, at).split("\n").length;
  const start = fileSource.lastIndexOf("\n", at) + 1;
  let end = fileSource.indexOf("\n", at);
  if (end === -1) end = fileSource.length;
  return `${label} ${SERVICE}:${line}  ${fileSource.slice(start, end).trim().slice(0, 100)}`;
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

  // 🚨 位置合わせ。`bodyOf` は `m.index + 1` から切り出しているので、そこが本体の起点。
  const head = /export\s+async\s+function\s+completeOnboardingWithAdmin\s*\(/.exec(serviceSource);
  const bodyOffset = head ? head.index + 1 : 0;

  if (/validate\(\s*\{/.test(body)) {
    violations.push({
      rule: "literal-to-validate",
      message: "validate() にオブジェクトリテラルを渡しています。送られてこなかった鍵も『在る（undefined）』になり、**全部必須**になります（2026-08-15 の退行と同じ形）",
      // 🚨 拾った生の行。数と説明だけだと、読んだ人がもう一度自分で探すことになる。
      evidence: evidence(/validate\(\s*\{/, body, bodyOffset, serviceSource, "拾った行"),
    });
  }

  if (!/if\s*\(\s*\w+\s+in\s+input\s*\)/.test(body)) {
    violations.push({
      rule: "no-omit-guard",
      // 🚨 **過検出を除外で消さず、規則自身に前提を言わせる**（2026-08-16・design の形）。
      //    実測: `Object.prototype.hasOwnProperty.call(input, key)` は**正しい門番**だが、
      //    この規則は `key in input` の字面しか見ないので **違反として鳴る**（台で確認）。
      //    🚨 規則を広げて逃がすと、**本物の指定漏れも一緒に逃がす**。
      //    → **判定は残し、切り分け方を文面に書く。** 過検出は人が 1 件見るだけで済む。
      message:
        "省略された鍵を落とす処理（`key in input`）が見当たりません。画面が聞くのをやめた項目が、そのまま必須になります。"
        + " 🚨 **まず、省略の判定を別の書き方（`hasOwnProperty` / `Object.keys().includes` など）に変えていないか見てください**"
        + "（この規則は **このリポジトリの書き方が `key in input` であること**を前提にしています）。"
        + " 変えていないなら、本当に門番が落ちています。",
      // 🚨 **これは「無い」ことの違反**なので、拾える行が在りません。
      //    代わりに **いま在るもの**（validate を呼んでいる行）を出す。
      //    「探した場所」が見えないと、読んだ人は「本当に無いのか」を確かめられない。
      evidence: evidence(/validate\s*\(/, body, bodyOffset, serviceSource, "🚨 拾える行がありません（無いことの違反）。代わりに、いま在る呼び出し"),
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

/**
 * 壊した箇所の**件数**を数える（🚨 base2 の③・2026-08-16 の全員向け規律）。
 *
 * 狙った文字列がファイル中に **2 箇所以上**在ると、`.replace()` は **1 箇所しか直しません**。
 * 実測（2026-08-16・写しの台で門番の行を 1→2 件に増やして確認）:
 * ```
 * 🟢 黙りはしない … 囮2 が ❌ になり exit=1
 * 🚨 ただし文言が「検出できていません（期待 rule: no-omit-guard）」で、
 *    **規則が壊れたように読めます**（実際は「2 箇所のうち 1 箇所しか壊せていない」）
 * ```
 * → **件数を持たせて、失敗したときに一緒に出す。**
 */
function countIn(source, pattern) {
  // 🚨 ここに `if (pattern === null) return null;` が在ったが、**7 箇所の呼び出しのうち 0 箇所**しか
  //    null を渡さない＝ **一度も通らない死んだ分岐**だった（2026-08-16・design の「死んだ条件」を
  //    自分に当てて発見）。**通らない分岐は、壊れていても気づけない**ので消した。
  const re = typeof pattern === "string"
    ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
    : new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return (source.match(re) ?? []).length;
}

// ── 自己検査: 実物をメモリ上で壊して、検出できることをその場で確かめる ──
console.log("■ 自己検査（実物を壊して、検出できることをその場で確かめる）");
const P1 = /const picked: Record<string, unknown> = \{\};/;
const P2 = /if \(key in input\) picked\[key\] = input\[key\];/;
const P3 = /new_password:/;
const P5 = "    if (!(key in input)) continue;";
const P6 = "function validate(input:";
const P4 = "export async function completeOnboardingWithAdmin";
const probes = [
  {
    name: "囮1: validate() にオブジェクトリテラルを戻す（事故そのものの形）",
    service: serviceSource.replace(
      P1,
      'const patchX = validate({ project_name: input.project_name, tenant_name: input.tenant_name });\n  const picked: Record<string, unknown> = {};',
    ),
    form: formSource,
    expect: "literal-to-validate",
    hits: countIn(serviceSource, P1),
  },
  {
    name: "囮2: 省略された鍵を落とす処理を消す",
    service: serviceSource.replace(P2, "picked[key] = input[key];"),
    form: formSource,
    expect: "no-omit-guard",
    hits: countIn(serviceSource, P2),
  },
  {
    name: "囮3: 画面から new_password を落とす",
    service: serviceSource,
    form: formSource.replace(P3, "new_password_renamed:"),
    expect: "form-missing-key",
    hits: countIn(formSource, P3),
  },
  {
    name: "囮5: validate() の「省略された鍵を飛ばす」処理を壊す（呼び出し側はそのまま）",
    service: serviceSource.replace(P5, "    // (壊した)"),
    form: formSource,
    expect: "validate-requires-all",
    hits: countIn(serviceSource, P5),
  },
  {
    name: "囮6: validate() の名前を変えて、切り出せなくする",
    service: serviceSource.replace(P6, "function validateX(input:"),
    form: formSource,
    expect: "validate-not-found",
    hits: countIn(serviceSource, P6),
  },
  {
    name: "囮4: 関数名を変えて、切り出せなくする（＝何も見ていない緑を防ぐ）",
    service: serviceSource.replace(P4, "export async function completeOnboardingWithAdminX"),
    form: formSource,
    expect: "not-found",
    hits: countIn(serviceSource, P4),
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

/**
 * 🚨 **基準線: 壊していない実物で既に出ている違反。**
 *
 * 囮・見逃す入力・対照(-) は「違反が出たか」で判定していたが、
 * **実物の側に別の理由で違反が出ていると、全部が汚染される**。
 * 実測（2026-08-16・台の上）: `onboarding-form.tsx` を 0 文字にしただけで
 * `form-missing-key` が 2 件出て、**見逃す入力 5 本とも「拾えた」に見えた**
 * （＝ 🚨 **注入した退行とは無関係な違反**を、検出の証拠として数えていた）。
 * 対照(-) 3 本も「過検出」に見えた。**さらに declaredBlind の食い違い警報まで
 * 誤って鳴る**（「拾えるようになりました」と言ってヘッダの書き直しを要求する）。
 *
 * → **基準線を引き、そこから増えた違反だけを「この入力が起こしたもの」として数える。**
 * 実物が綺麗なとき（＝通常）は空集合なので、振る舞いは変わらない。
 */
const baselineRules = inspect(serviceSource, formSource).violations.map((v) => v.rule);
/** 基準線から**増えた**違反だけを返す（同じ rule が複数出る場合も、増えたぶんだけ数える） */
function newViolations(found) {
  const rest = [...baselineRules];
  return found.filter((v) => {
    const i = rest.indexOf(v.rule);
    if (i >= 0) { rest.splice(i, 1); return false; }
    return true;
  });
}
if (baselineRules.length > 0) {
  console.log(`  🚨 **実物に既に違反 ${baselineRules.length} 件（${baselineRules.join(",")}）が在ります。**`);
  console.log("     以下の囮・対照・見逃す入力は、**そこから増えたぶんだけ**を見ます。");
}

let selfCheckFailed = false;
for (const probe of probes) {
  if (probe.service === serviceSource && probe.form === formSource) {
    console.log(`  ❌ ${probe.name}  → **置換が当たっていません**（壊せていないので、この囮は何も言っていません）`);
    selfCheckFailed = true;
    continue;
  }
  const hit = newViolations(inspect(probe.service, probe.form).violations).some((v) => v.rule === probe.expect);
  // 🚨 失敗したときは**壊した件数**も出す。1 でなければ「規則が壊れた」ではなく
  //    「狙いが複数当たって、1 箇所しか壊せていない」——原因がまったく別。
  const why = hit
    ? `検出（rule: ${probe.expect}）`
    : probe.hits === 1
      ? `🚨 検出できていません（期待 rule: ${probe.expect}／狙いは 1 箇所に当たっています＝**規則の側**を見てください）`
      : `🚨 検出できていません（期待 rule: ${probe.expect}／🚨 **狙いが ${probe.hits} 箇所に当たっています**。replace は 1 箇所しか直さないので、**壊し切れていません**＝規則ではなく囮の側の問題）`;
  console.log(`  ${hit ? "✅" : "❌"} ${probe.name}  → ${why}`);
  if (!hit) selfCheckFailed = true;
}

console.log("\n■ 対照(-)（検出されてはいけないもの。ここが ❌ なら過検出）");
for (const n of negatives) {
  if (n.service === serviceSource && n.form === formSource) {
    console.log(`  ❌ ${n.name}  → **置換が当たっていません**（変えられていないので、この対照は何も言っていません）`);
    selfCheckFailed = true;
    continue;
  }
  const found = newViolations(inspect(n.service, n.form).violations);
  const ok = found.length === 0;
  console.log(`  ${ok ? "✅" : "❌"} ${n.name}  → ${ok ? "検出 0 件（正しい）" : `🚨 **過検出** ${found.map((v) => v.rule).join(",")}`}`);
  if (!ok) selfCheckFailed = true;
}

// ── 🚨 見逃す入力（2026-08-16・司令塔 → 全員） ──
//
// 「取りこぼしの**数**」は数えられない（出てこないので）。
// しかし「取りこぼす**こと**」は示せる——**自分で見逃す入力を作って通せばよい**。
// （design が自分の検出器で 6/6 取りこぼしを実演したのが元。**作れば必ず在る**）
//
// 🚨 ここに並ぶのは **すべて本物の退行**（画面が送らない鍵が必須になる形）です。
//    ✅ が付いたものは「拾えた」、🚨 が付いたものは **この検査が見ていない形**。
//    見ていない形は、この下の「見ていない範囲」にそのまま出します。
console.log("\n■ 🚨 見逃す入力（**わざと作った本物の退行**。拾えなければ「見ていない形」として出す）");
const misses = [
  {
    name: "① `validate({` を書かずに literal を混ぜる（Object.assign 経由）",
    declaredBlind: true,  // ヘッダの「見ていない範囲」に載せているか
    why: "`tenant_name` が常に在ることになり、画面が送らなくても必須になる",
    service: serviceSource.replace(
      "  const patch = validate(picked);",
      "  const patch = validate(Object.assign({}, picked, { tenant_name: input.tenant_name }));",
    ),
    form: formSource,
  },
  {
    name: "② 門番の形は残すが、意味を反転させる（`!` を足して undefined を入れる）",
    declaredBlind: false,  // ヘッダの「見ていない範囲」に載せているか
    // 🚨 これは**作ったときの予想が外れた 1 本**。「`key in input` の字が在るから鳴らない」と思って
    //    作ったが、実測では **拾えた**（`no-omit-guard` の正規表現は `if (` の直後が `\w+` なので、
    //    `if (!(key in input))` には当たらない＝**不在として正しく鳴る**）。
    //    予想を書いたまま残すと、次に読む人が「見逃す形」だと信じるので、直した。
    why: "（予想は外れ。実測では拾えている。`if (!(` の形は `no-omit-guard` の不在判定に当たる）",
    service: serviceSource.replace(
      "    if (key in input) picked[key] = input[key];",
      "    if (!(key in input)) picked[key] = undefined;\n      else picked[key] = input[key];",
    ),
    form: formSource,
  },
  {
    name: "③ 受け取る鍵の一覧に、画面が送らない鍵を足す",
    declaredBlind: true,  // ヘッダの「見ていない範囲」に載せているか
    why: "`ONBOARDING_INPUT_KEYS` は誰とも突き合わせていない。足すだけで必須が増える",
    service: serviceSource.replace(
      'export const ONBOARDING_INPUT_KEYS = [',
      'export const ONBOARDING_INPUT_KEYS = [\n  "zz_never_sent_by_the_form",',
    ),
    form: formSource,
  },
  {
    name: "④ validate() の門番を、必須の判定より後ろへ動かす（文字列は残る）",
    declaredBlind: true,  // ヘッダの「見ていない範囲」に載せているか
    why: "`if (!(key in input)) continue;` が在るので `validate-requires-all` は鳴らないが、届く前に必須で落ちる",
    service: serviceSource.replace(
      "    if (!(key in input)) continue;",
      "    // 先に必須を見てから\n    if (!(key in input)) continue;",
    ),
    form: formSource,
  },
  {
    name: "⑤ 画面と API で鍵の名前がずれる（画面 `default_locale` / API `defaultLocale`）",
    declaredBlind: true,  // ヘッダの「見ていない範囲」に載せているか
    why: "`form-missing-key` は画面側に文字列が在るかしか見ない。**API 側の綴りは見ていない**",
    service: serviceSource.replace(/"default_locale"/g, '"defaultLocale"'),
    form: formSource,
  },
];
// 🟢 対照(+) 拾える形も 1 つ通す。全部 🚨 なら「検出器が動いていない」ことと区別が付かない。
const missControl = {
  name: "🟢 対照(+) 素直に literal を渡す（拾えるはずの形）",
  service: serviceSource.replace("  const patch = validate(picked);", "  const patch = validate({ project_name: input.project_name });"),
  form: formSource,
};
let missed = 0;
const stale = [];
for (const m of misses) {
  if (m.service === serviceSource && m.form === formSource) {
    console.log(`  ❌ ${m.name}  → **作れていません**（置換が当たっていないので、この 1 本は何も言っていません）`);
    selfCheckFailed = true;
    continue;
  }
  const found = newViolations(inspect(m.service, m.form).violations);
  if (found.length > 0) {
    console.log(`  ✅ ${m.name}  → 拾えた（${found.map((v) => v.rule).join(",")}）`);
    // 🚨 ヘッダに「見ていない」と書いてあるのに拾えるようになった ＝ **記述のほうが古い**
    if (m.declaredBlind) stale.push(`「${m.name}」は**拾えるようになりました**（ヘッダは「見ていない」のまま）`);
  } else {
    console.log(`  🚨 ${m.name}  → **見ていません**（${m.why}）`);
    missed += 1;
    // 🚨 逆向き。ヘッダに載せていない形を見逃している ＝ **記述が足りていない**
    if (!m.declaredBlind) stale.push(`「${m.name}」を**見逃しています**（ヘッダに載っていません）`);
  }
}
{
  const found = newViolations(inspect(missControl.service, missControl.form).violations);
  const ok = found.length > 0;
  console.log(`  ${ok ? "✅" : "❌"} ${missControl.name} → ${ok ? `拾う（${found.map((v) => v.rule).join(",")}）` : "🚨 **拾えません**。検出器が動いていないので、上の 🚨 は意味を持ちません"}`);
  if (!ok) selfCheckFailed = true;
}
console.log(`  ＝ 作った ${misses.length} 本のうち、**見ていない形 ${missed} 本**`);
// 🚨 見逃しは**失敗にしない**。ここを赤にすると、門が常に赤になって回避される。
//    「見ていない」と**言えている**ことが目的なので、判定ではなく記録として出す。
//
// 🚨🚨 **ただし「書いただけ」と「鳴る」は別**（2026-08-16・polish が段差を見つけ、
//    design が先に形にした）。**見ていない範囲の記述は、直した人が居ても古いまま残る。**
//    → **ヘッダの記述と、いま実際に拾えるかが食い違ったら落とす。**
//       ①拾えるようになったのに「見ていない」と書いたまま ②載せていない形を見逃している
//    どちらも **記述のほうが嘘になった**状態なので、書き直しを求める。
if (stale.length > 0) {
  console.log("\n🚨 **ファイル冒頭の「見ていない範囲」が、いまの実装と食い違っています**:");
  for (const s of stale) console.log(`    ・${s}`);
  console.log("  → **冒頭の一覧を書き直してください**（拾えるようになった行は消す／見逃す行は足す）。");
  selfCheckFailed = true;
}

// ── 判定 ──
const { violations, bodyChars } = inspect(serviceSource, formSource);
console.log(`\n■ 判定`);
// 🚨 **候補ではなく、実際に読んで走査した量を出す**（2026-08-16・polish が
//    「候補 133 本」を「走査した」と出していて、走査 0 でも大きな数が出る形を見つけた）。
//    ここは対象が 2 ファイル固定なので「候補の数」は無いが、
//    🚨 **`${FORM}` は今まで量を 1 つも出していなかった**。空のファイルを読んでも
//    「鍵が無い」としか言わず、**読めていないのか本当に鍵が無いのかが分からなかった**。
//    → **両方の読み込み量を出す。** 0 なら、下の違反より先にこの行で分かる。
console.log(
  `  対象: ${SERVICE}（${serviceSource.length} 文字を読込 → completeOnboardingWithAdmin ${bodyChars} 文字）` +
    ` ＋ ${FORM}（${formSource.length} 文字を読込）`,
);
// 🚨 **この行は「診断」であって「守り」ではありません。** 落としません（堀池さん判断・2026-08-16 A 案）。
//
// **なぜ守りにしないか**（design の「測りたい守りだけが効く条件で測る」を当てて分かったこと）:
// ```
// 【測った】`service.ts` を 0 文字にすると、**この行**と **`not-found` の違反**が**同時に**出る
//   ＝ 🚨 **この行だけが効く条件を作れない**（0 文字なら関数も切り出せないので、必ず両方出る）
//   ＝ **落とす力を足しても、どちらが止めたのか永久に区別できない**実験になる
// ```
// **`not-found` / `form-missing-key` が既に落としているので、ここは「なぜそうなったか」だけを言う。**
// 🚨 **「守りが在る」と読まれないよう、文面で言い切る。**
/**
 * 🚨 **HEAD の同じファイルと比べる（B 案・堀池さん判断 2026-08-16）。これも「診断」で、落としません。**
 *
 * **なぜ比率でも平均でもないか**（司令塔「比率は間引きが在る検査でしか効かない」を当てて分かったこと）:
 * ```
 * この検査が読むのは **2 ファイル固定**。候補と走査の差が**無い**（間引きが無い）
 *   → 比率（走査 ÷ 候補） … 🚨 **常に 1.0。動かないので効かない**
 *   → 平均文字数           … 🚨 2 ファイル固定なので、**合計と同じ情報**しか持たない
 * ＝ shell の「差が 1 なのは構造で決まっている」の、**差が 0 で固定**の版。
 * ```
 * **HEAD と比べると、repo が育っても腐らない**（HEAD も一緒に育つので）。
 *
 * 🚨 **弱点を 2 つ、先に書いておく**（**守りではなく診断にした理由**）:
 * ```
 * ① **作業ツリーと HEAD が違うのは正常**（編集中なのだから）。
 *    大きく削る正当な変更が、そのまま低い比になる → **落とすと止めてしまう**
 * ② 🚨 **HEAD 自体が痩せていたら比は 1.0 のまま**（**両方が同時に減る**）。
 *    shell が指摘した形が、ここにも在る。**この診断は、それを見ません**
 * ```
 * 台（`OHMYCMS_CHECK_ROOT`）でもそのまま比べる。**台が HEAD からどれだけ痩せたか**が出るので、
 * **共有ツリーを壊さずに、この診断の RED を測れる**。
 */
function headRatio(relFromRepo, current) {
  try {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const head = execFileSync("git", ["-C", repo, "show", `HEAD:${relFromRepo}`], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (head.length === 0) return null;
    return { head: head.length, ratio: current.length / head.length };
  } catch {
    return null; // git が無い / まだコミットされていない → 比べない（黙って比を作らない）
  }
}
for (const [rel, src] of [
  [`apps/studio/${SERVICE}`, serviceSource],
  [`apps/studio/${FORM}`, formSource],
]) {
  const r = headRatio(rel, src);
  if (r === null) {
    console.log(`  HEAD 比: ${rel} … 🚨 **比べられません**（git が無い／未コミット）`);
  } else if (r.ratio < 0.5) {
    console.log(
      `  🚨 **【診断・これ自体は落としません】${rel} が HEAD より小さいです**` +
        `（いま ${src.length} / HEAD ${r.head} ＝ **${r.ratio.toFixed(2)}**）。` +
        " **大きく削る変更なら正常です。** そうでないなら、読んでいるファイルを間違えているかもしれません。",
    );
  } else {
    console.log(`  HEAD 比: ${rel} … ${r.ratio.toFixed(2)}（いま ${src.length} / HEAD ${r.head}）`);
  }
}
if (serviceSource.length === 0 || formSource.length === 0) {
  console.log(
    "  🚨 **【診断・これ自体は落としません】読み込みが 0 文字のファイルが在ります。**" +
      " 下に出ている違反は、**コードの退行ではなく「読めていない」**かもしれません。" +
      "（落としているのは `not-found` / `form-missing-key` のほうです）",
  );
}
// 🚨 **どのツリーを見たかを必ず出す。** 既定に落ちたことが見えないと、
//    「切った台で測ったつもりが、共有ツリーを測っていた」に気づけない
//    （V1-E で REF の打ち間違いが PASS のまま隠れたのと同じ形。2026-08-16）。
console.log(
  `  見たツリー: ${process.env.OHMYCMS_CHECK_ROOT ? `指定 ${root}` : `既定 ${root}（＝共有の作業ツリー）`}`,
);
if (violations.length === 0) {
  console.log("  違反なし（＝画面が送らない鍵を API が必須にしていない）。");
} else {
  console.log(`  🚨 違反 ${violations.length} 件:`);
  for (const v of violations) {
    console.log(`    [${v.rule}] ${v.message}`);
    // 🚨 拾った生の行を必ず添える（2026-08-16 の規律。数だけだと、他人が確かめられない）
    if (v.evidence) console.log(`        ${v.evidence}`);
  }
}

if (selfCheckFailed) {
  // 🚨 自己検査の失敗には、意味の違う 2 通りがある。同じ文で言うと読み手が取り違える。
  //   ① 違反 0 件のまま囮が当たらない → **検査が壊れている**（緑が「見ていない緑」かもしれない）
  //   ② 既に違反が出ている状態で囮が当たらない → **実物が既にその形だから囮を作れない**。
  //      検査は正しく動いている（違反を名指ししている）。ここで①の文言を出すと、
  //      🚨 **コードの退行を「検査の故障」と読み替えられてしまう**。
  //      2026-08-16 に自分の RED を測っていて気づいた（違反 2 件が出ているのに
  //      「この検査の緑は見ていないかもしれない」と言っていた。そもそも緑ではない）。
  if (violations.length > 0) {
    console.log(
      "\n🚨 囮を当てられませんでした。**実物が既にその形だからです**" +
        `（上の違反 ${violations.length} 件を見てください）。**検査は動いています。**`,
    );
  } else {
    console.log("\n🚨 自己検査に失敗しました。この検査の緑は『異常が無い』ではなく『見ていない』かもしれません。");
  }
  process.exit(1);
}
process.exit(violations.length > 0 ? 1 : 0);
