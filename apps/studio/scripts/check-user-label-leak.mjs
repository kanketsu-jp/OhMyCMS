#!/usr/bin/env node
/**
 * 内部専用の固定ユーザー（`LOCAL_ADMIN_EMAIL` = local-admin@localhost）と、
 * SAML の合成メール（`<uuid>@saml.invalid`。メールを送らない IdP のための埋め草）が
 * 画面のラベルへ届く経路が無いことを、静的に確かめる。
 *
 * 由来: 2026-08-15。左サイドバーのアカウント行に `local-admin@localhost` が出ていた
 * （堀池のスクリーンショット）。`lib/settings/service.ts` は原文で
 * 「**利用者には一切見せない**（画面にもAPIレスポンスにも出さない）」と書いてある。
 * 同日、SAML の合成メールも同じサイドバーへ出ることが分かり、この検査へ規則D と E を足した
 * （`lib/auth/saml/placeholder-email.ts` の `isSamlPlaceholderEmail`）。
 *
 * 追記（同日・2回目）: 規則 A/B は `userLabel=\{...\}` の形しか見ておらず、
 * `{...{ userLabel: X }}` のような**spread**には `userLabel=` の形が無いので、
 * 1件も写らなかった（実測3通り。うち1つは exit 0 で完全に素通り）。
 * → 規則 F（object literal の `userLabel:`）/ G（UserMenu 呼び出し側から見えるか）/
 *   H（素通し識別子の同ファイル内解決）を足した。
 *
 * 🚨 **この検査は違反 0 件が正常値。** 壊れたときも「0 件・問題なし」と同じ顔になるため、
 *    読めた量（走査本数・文字数・平均）を必ず併記する。**0 件だけを見ないこと。**
 *
 * 🚨 **この検査は、自分が本当に検出できることを毎回その場で証明する。**
 *    緑になっただけでは「異常が無い」のか「見ていない」のか区別が付かないため、
 *    実物を複数通りに壊して**両方で赤くなること**を確かめてから、本番の判定を出す。
 *    さらに**壊した置換の件数を必ず表示する**。0 件のまま「赤くならなかった」を
 *    見逃すと、検査が効いていないのに合格に見える（BSD sed で実際に起きた事故）。
 *
 * 🚨 **この検査で分からないこと**（緑でも保証していない範囲。書いておかないと過信される）。
 *    各項目に **【鳴る】/【書いただけ】** を付ける（司令塔 2026-08-16）。
 *    **【鳴る】＝走るたびに実測して出力に出る**（古くなったら表示が変わる）。
 *    **【書いただけ】＝この散文が唯一の根拠**。道具では確かめていない。
 *
 *   - 【鳴る】素通しの識別子をどこまで追うか（同じファイルの通常代入・フラットな分割代入は追う。
 *     別ファイル・関数引数由来は追わない）
 *     → 🚨 **ここに書かず、出力の「■ 見ていない範囲の診断 / 見逃す入力の実演」を見ること。**
 *       同じことを 2 箇所に書くと片方が必ず腐る（実際に腐った。2026-08-16 に分割代入を
 *       追えるようにしたのに、この散文は「追わない」のままだった）。
 *   - 【書いただけ】分割代入は**フラット（1階層）だけ**。デフォルト値付き（`{ email = "x" }`）や
 *     入れ子（`{ data: { email } }`）は追わない（やりすぎない）。
 *   - 【書いただけ】`UserMenu` 以外の場所へメールを描く**新しい経路**は見ていない。
 *     🚨 **鳴る形にできない理由**: 「まだ存在しない部品」は作って通せない（作った時点で
 *     それは実在する部品になり、規則Gが拾う）。**在るものの死角と違い、無いものは測れない。**
 *   - 【書いただけ】object literal の入れ子（`{...{ userLabel: { nested: X } }}`）は追わない
 *   - 【書いただけ】実行時の値は見ていない。**画面で出ていないことの確認はブラウザで別途行う**
 *     🚨 **鳴る形にできない理由**: この検査は静的にソースを読むだけで、ブラウザを起動しない。
 *     鳴らせるようにするには別の検査（`headless-browser.mjs` を使う受入）になる。
 *
 *   node scripts/check-user-label-leak.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";
// 🚨 **中身も索引から読む**（一覧を `trackedGlob` にしただけでは足りない・2026-08-16）。
//    一覧だけ索引にすると「未追跡ファイル」の扉は閉まるが、
//    🚨 **追跡済みファイルの「まだ add していない編集」はそのまま読む**ので、
//    **他ペインの書きかけで、触っていない人のコミットが止まる**（toast が実測して見つけた）。
//    未追跡は `null` → 空にせず**飛ばす**か、呼ぶ側で 0 の顔を書くこと。
/** 索引から読む。未追跡は空（一覧は `trackedGlob` で絞ってあるので、通常は起きない）。 */
const readIndexed = (f, _enc) => readTracked(f) ?? "";


const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 判定に使う実物。壊すときもこの写しを差し替える。 */
const GUARD_FILE = "lib/admin/user-label.ts";

/**
 * 自己検査・対照検査・見ていない範囲の実演が壊す対象として名指しで参照する実物。
 * 列挙（glob）でこれらが1本も拾えていないと、各テストの `apply()` が
 * `sources[file]`（undefined）を `countOccurrences` に渡してしまい、
 * 「壊せなかった」ではなく素の TypeError で落ちる（原因が読み取れない）。
 * `loadSources()` 直後にこの一覧の存在を確認し、無ければ診断を出して打ち切る。
 */
const REQUIRED_FILES = [GUARD_FILE, "app/(admin)/layout.tsx", "components/admin/left-sidebar.tsx"];

/**
 * 走査数（GUARD_FILE を除いた本数）の基準線。**実測値と実測日を書く**。
 * 🚨 由来: 2026-08-16。「0 件しか見ていない0ガード」は 214 本 → 1 本に減っても
 * 通ってしまう（実測済み。台で列挙を2本に置換し、既存の「走査0なら落とす」門・
 * 必須ファイル確認の両方をすり抜けて exit 0 になった）。「見ていない0」は塞げても、
 * 「**ほとんど見ていない**」は塞げていなかった。
 *
 * `node scripts/check-user-label-leak.mjs` を実行し、「■ 判定」の「走査 N 本」を
 * 読んで更新すること（このファイルの実測でも 214 本を確認済み・下の SELF-CHECK 参照）。
 */
const SCANNED_BASELINE = { at: "2026-08-16", count: 214 };

/**
 * 走査数がこれを下回ったら、基準線からの減少として落とす（既存の「走査0なら落とす」門とは別物。
 * こちらは「0 ではないが、ほとんど見ていない」を狙う）。
 * 🚨 しきい値は**基準線の 70%**: `Math.floor(214 * 0.7)` = 149。
 * 214→149 は 65 本の減少で、単一ファイルの追加・削除・リネームでは起こらない大きさ。
 * 一方でリファクタで数本〜十数本が増減しても 70% は割らないので、通常の開発では鳴らない
 * （鳴らしすぎると煙感知器が信用されなくなる。取りこぼす側に倒す一般原則とは逆に、
 * ここは「毎回鳴る運用ノイズ」を避ける側に倒した。理由はコメントに残す）。
 */
const SCANNED_MIN_THRESHOLD = Math.floor(SCANNED_BASELINE.count * 0.7); // 149

/**
 * 走査数がこれを上回ったら「基準線が古い可能性がある」と**落とさずに** 1 行だけ出す
 * （`check-raw-api-message.mjs` が「件数が減ったら基準線を削れ」と言っているのと同じ考え方。
 * 基準線を更新し忘れると、次に本当に減ったときの検出力が下がるため）。
 * 🚨 しきい値は**基準線の 130%**（減少側 70% と対称に取った）: `Math.ceil(214 * 1.3)` = 279。
 */
const SCANNED_STALE_THRESHOLD = Math.ceil(SCANNED_BASELINE.count * 1.3); // 279

/**
 * 「読めた文字数」の**1 ファイルあたりの平均**の基準線。**実測値と実測日を書く**。
 *
 * 🚨 由来: 2026-08-16。「読めた文字数が 0 でなければ良い」という既存の門（下の
 * `totalChars === 0` チェック）は、**合計** 753816 文字が 1000 文字に痩せても通ってしまう
 * （走査 214 本・違反 0 件のまま。0 は塞げても「ほとんど読めていない」は塞げない）。
 *
 * 🚨 **合計文字数ではなく平均で持つ**: 合計は repo が育つと増え続けるので、絶対値の下限は
 * 毎年腐って鳴らなくなる／逆に痩せた合計でも大きい repo では下限を超えたままになりうる
 * （polish の指摘「絶対値は育つ。比率は育たない」を、この検査の文字数版に当てた）。
 * **平均（読めた文字数 ÷ 走査本数）は、ファイルの増減があっても 1 ファイルあたりの
 * 中身の濃さは大きく変わらない**ので、repo が育っても目減りしない。
 *
 * `node scripts/check-user-label-leak.mjs` を実行し、「■ 判定」の「平均」を
 * 読んで更新すること（このファイルの実測で 753816 / 214 = 3522.50…→ 3522 を確認済み）。
 */
const AVG_CHARS_BASELINE = { at: "2026-08-16", avg: 3522 };

/**
 * 平均文字数（読めた文字数 ÷ 走査本数）がこれを下回ったら、基準線からの減少として落とす
 * （既存の「読めた文字数が0なら落とす」門とは別物。こちらは「0 ではないが、
 * ほとんど読めていない」を狙う）。
 * 🚨 しきい値は**基準線の 50%**: `Math.floor(3522 * 0.5)` = 1761。
 * しきい値が緩いのは、ファイルの入れ替わり（大きいファイルの削除・小さいファイルの追加等）
 * だけで平均は普通に上下するから。ここが鳴るのは「読み込みが実質壊れている」ような、
 * 通常のリファクタでは起こらない大きな落ち込みに限る。
 */
const AVG_CHARS_MIN_THRESHOLD = Math.floor(AVG_CHARS_BASELINE.avg * 0.5); // 1761

function read(file) {
  return readIndexed(resolve(root, file), "utf8");
}

/**
 * 函数の本体だけを切り出す（**函数自身の閉じ括弧で終える**。次の函数の
 * JSDoc コメントまで巻き込まない）。
 *
 * 完全なパーサーではないが、この検査対象ファイルはトップレベルの関数定義が
 * `export function` または（`visibleHuman` のように）非公開の `function` で始まり、
 * 本体が必ず1段インデント（スペース2つ）されている形に統一されている。
 * したがって**函数開始位置以降で最初に現れる、行頭（列0）の `}`** を函数自身の
 * 閉じ括弧とみなせば足りる（ネストしたブロックの `}` は必ずインデントされるため、
 * 列0には来ない）。
 *
 * 切り出したあと `//` 行コメントと `/* … *\/` ブロックコメントを取り除く。
 * 本体の中にコメントとして語が書かれているだけで判定が誤発火しないようにするため
 * （呼び出し規則の判定は正規表現で語の有無を見ているだけなので、コメントも拾ってしまう）。
 *
 * 🚨 「ファイル全体にその語があるか」ではなく、**その函数の本体だけ**を見るために使う
 *    （import 文に語があるだけで「呼んでいる」と誤判定しないため）。
 * 🚨 `visibleHuman` には `export` が付かない。`export function ${name}(` だけを探すと
 *    永久に `null` が返り、それを呼ぶ規則が発火しなくなる。**`export` 有無の両方**を試す。
 * 🚨 行頭 `}` が見つからなければ `null` を返し、呼び出し側で安全側（違反）として扱わせる。
 * 🚨 文字列リテラルの中の `}` まで厳密に扱う必要はない（この検査対象ファイルの実際の
 *    書き方に対して正しく動けばよい。やりすぎない）。
 */
function extractFunctionBody(source, functionName) {
  const markers = [`export function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const candidate of markers) {
    const idx = source.indexOf(candidate);
    if (idx !== -1) {
      start = idx;
      break;
    }
  }
  if (start === -1) return null;

  const rest = source.slice(start);
  const closeOffset = rest.search(/^\}/m);
  if (closeOffset === -1) return null;

  const body = source.slice(start, start + closeOffset + 1);
  return stripComments(body);
}

/** `//` 行コメントと `/* … *\/` ブロックコメントを取り除く。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** 正規表現の中に安全に埋め込めるよう、識別子中の特殊文字をエスケープする。 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `const/let/var { email } = 式;` や `const/let/var { email: 別名 } = 式;` のような
 * **分割代入**の中から、識別子 `identifier` が束縛されているものを探し、
 * その実体を `式.プロパティ名` の形へ合成して返す（式は静的な文字列として組み立てるだけで、
 * 実際には評価しない。TS として正しいかどうかも問わない）。
 *
 * 🚨 2026-08-16 追加。**それまではフラットな `const 識別子 = 式;` しか追っておらず、
 *    `const { email: x } = me.data; … userLabel={x}` の形が1件も写らなかった**
 *    （実測。同じファイル内で生のメールを取り出しているので、呼び出し元が別ファイルにある
 *    正当な素通しとは違う。塞ぐべき穴だった）。
 * 🚨 対応するのは**フラットな分割代入（1階層）だけ**。デフォルト値付き（`{ email = "x" }`）や
 *    入れ子（`{ data: { email } }`）までは追わない（やりすぎない。実際の書き方に対して
 *    正しく動けばよい）。
 *
 * 見つからなければ null を返す。呼び出し側はそれを「同じファイルに定義が見つからない」
 * ＝別ファイル由来などの正当な素通し、として扱う（通常代入の declMatch と同じ扱い）。
 */
function findDestructuredRhs(source, identifier) {
  const pattern = /\b(?:const|let|var)\s*\{\s*([^{}]*?)\s*\}\s*=\s*([^;]+);/g;
  let m;
  while ((m = pattern.exec(source)) !== null) {
    const propsText = m[1];
    const exprSrc = m[2].trim();
    for (const rawProp of propsText.split(",")) {
      const prop = rawProp.trim();
      if (!prop) continue;
      // `email: alias`（リネーム）か `email`（ショートハンド）のどちらか。
      // それ以外（デフォルト値・入れ子・rest 等）は対象外として飛ばす。
      const aliasMatch = /^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/.exec(prop);
      const shorthandMatch = /^([A-Za-z_$][\w$]*)$/.exec(prop);
      let key = null;
      let boundName = null;
      if (aliasMatch) {
        key = aliasMatch[1];
        boundName = aliasMatch[2];
      } else if (shorthandMatch) {
        key = shorthandMatch[1];
        boundName = shorthandMatch[1];
      } else {
        continue;
      }
      if (boundName === identifier) {
        return `${exprSrc}.${key}`;
      }
    }
  }
  return null;
}

/**
 * `userLabel` に渡された式1つを判定する。呼び出し元は3通り:
 *   - A/B: `userLabel={式}`（JSX 属性として直接）
 *   - F  : `userLabel: 式`（object literal。spread や変数化で隠れている）
 * どちらも判定のロジックは同じなので共通化する。ここで付ける rule ラベルだけが違う。
 *
 *   1. 式に生のメール（`.email`）が直接入っていたら違反（emailRule）
 *   2. 式が識別子1つだけ（素通し）なら、**同じファイル**に
 *      `const/let/var <識別子> = …;`（通常の代入）、または
 *      `const/let/var { email } = …;` / `const/let/var { email: <識別子> } = …;`
 *      （分割代入）があるか探す。
 *        - 見つかれば、右辺（分割代入は `式.email` に合成した右辺）に生のメールが
 *          直接入っていないかを見る（1 と同じ判定）。
 *        - 🚨 **`displayUserLabel(` を通しているか（missingRule）は、通常の代入
 *          （`viaDestructuring === false`）のときだけ見る。** 分割代入は「どの鍵から
 *          取り出したか」が式に出るので、鍵が `email` なら↑で拾える。鍵が `email` でない
 *          （`const { userLabel } = props;` のような、親から受けた prop の分割代入）なら、
 *          値を作ったのは別の場所（引数の分割代入 `function X({ userLabel }) {...}` と
 *          意味が同じ）で、そこを規則 A/B/F が見ている。ここで missingRule を出すと、
 *          関数引数の分割代入（既存の免除）と、本体内の分割代入（同じ意味）とで
 *          **書き方の違いだけで判定が割れる**（2026-08-16 実測: 台の worktree で
 *          `const { userLabel } = props;` → `<UserMenu userLabel={userLabel} .../>` が
 *          誤検出された。regular assignment の免除と揃えた）。
 *        - 見つからなければ、呼び出し元が別ファイル（関数引数など）にある正当な
 *          素通しとして扱い、違反にしない（既存の isPassThrough 設計を踏襲）。
 *   3. それ以外（式が複合的）で `displayUserLabel(` を通っていなければ違反（missingRule）
 */
function checkLabelExpression(violations, file, source, expression, line, rules) {
  const { emailRule, missingRule, passThroughRule } = rules;

  if (/\.email\b/.test(expression)) {
    violations.push({ file, line, rule: emailRule, detail: "生のメールを直接渡している" });
    return;
  }

  const isPassThrough = /^[A-Za-z_$][\w$]*$/.test(expression);
  if (isPassThrough) {
    const declPattern = new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(expression)}\\s*=\\s*([^;]+);`);
    const declMatch = declPattern.exec(source);

    let rhs = null;
    let viaDestructuring = false;
    if (declMatch) {
      rhs = declMatch[1].trim();
    } else {
      // 🚨 通常の `const 識別子 = 式;` に見つからなければ、**分割代入**も同じファイル内で探す
      //    （2026-08-16 追加。findDestructuredRhs のコメント参照）。
      const destructured = findDestructuredRhs(source, expression);
      if (destructured !== null) {
        rhs = destructured;
        viaDestructuring = true;
      }
    }

    // 🚨 同じファイルに定義（通常の代入 or 分割代入）が見つかったときだけ規則Hを当てる。
    //    見つからなければ、呼び出し元が別ファイル（例: 関数の引数として渡ってくる）にある正当な
    //    素通しとして扱う（そう扱っていることが分かるよう、ここにコメントを残す。値を作っているのは
    //    呼び出し元で、そこで A/B/F のいずれかが見ている）。
    if (rhs !== null) {
      const originNote = viaDestructuring ? "（分割代入）" : "";
      if (/\.email\b/.test(rhs)) {
        violations.push({
          file,
          line,
          rule: passThroughRule,
          detail: `素通しの識別子 '${expression}' の定義${originNote}に生のメールが直接入っている（${rhs}）`,
        });
      } else if (!viaDestructuring && !rhs.includes("displayUserLabel(")) {
        // 🚨 分割代入（viaDestructuring === true）はここに来ない。理由は上のJSDoc参照:
        //    分割代入は鍵（プロパティ名）が式に出るので、鍵が email なら↑の /\.email\b/ で
        //    拾える。鍵が email でなければ値を作ったのは別の場所で、そこを A/B/F が見ている。
        //    通常の代入（`const 識別子 = 式;`）だけ、ここで displayUserLabel() 通過を要求する。
        violations.push({
          file,
          line,
          rule: passThroughRule,
          detail: `素通しの識別子 '${expression}' の定義${originNote}が displayUserLabel() を通していない（${rhs}）`,
        });
      }
    }
    return;
  }

  if (!expression.includes("displayUserLabel(")) {
    violations.push({ file, line, rule: missingRule, detail: "displayUserLabel() を通していない" });
  }
}

/**
 * object literal の中から `userLabel: 式` を1件だけ拾う。
 * `[^,]+?` を遅延一致にしたうえで `(?:,|$)` で区切るので、
 * カンマが無い（単独プロパティで終わる）場合は末尾まで拾える。
 */
function extractUserLabelFromObjectBody(body, matchIndex, source, out) {
  const m = /\buserLabel\s*:\s*([^,]+?)\s*(?:,|$)/.exec(body);
  if (!m) return;
  const expression = m[1].trim();
  if (!expression) return;
  const line = source.slice(0, matchIndex).split("\n").length;
  out.push({ expression, line });
}

/**
 * 規則 F が見る2つの書き方から `userLabel: 式` を集める:
 *   - スプレッド: `{...{ userLabel: X, ... }}`
 *   - 変数化    : `const/let/var 識別子 = { userLabel: X, ... }`
 *
 * 🚨 どちらも `[^{}]*?`（`{`/`}` を跨がない）で書いているので、ネストした object
 *    literal までは追わない（やりすぎない。実際の書き方に対して正しく動けば足りる）。
 * 🚨 `type Props = { userLabel: string | null; ... }` のような TS の型定義は、
 *    `const`/`let`/`var` の宣言ではない（`type` はこの正規表現に一致しない）ので、
 *    自然に対象外になる。スプレッド側は値の spread（`{...{ ... }}`）にしか一致しないので、
 *    型定義を誤って拾うことはない。
 */
function findObjectLiteralUserLabelExpressions(source) {
  const expressions = [];

  for (const m of source.matchAll(/\{\s*\.\.\.\{\s*([^{}]*?)\s*\}\s*\}/g)) {
    extractUserLabelFromObjectBody(m[1], m.index, source, expressions);
  }

  for (const m of source.matchAll(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\{\s*([^{}]*?)\s*\}/g)) {
    extractUserLabelFromObjectBody(m[1], m.index, source, expressions);
  }

  return expressions;
}

/**
 * `<TagName ...>` または `<TagName ... />` のタグ全体（属性込み）を切り出す。
 * 属性値の式（`{ ... }`）の中に `>` が出ても誤って区切らないよう、`{`/`}` の深さを
 * 数えながら進み、**深さ0での最初の `>`** をタグの終わりとみなす。
 *
 * 完全なパーサーではない（文字列リテラルの中の `{`/`}`/`>` までは扱わない）。
 * この検査対象（`<UserMenu ...>` の呼び出し箇所）に対して正しく動けばよい。
 */
function extractJsxTags(source, tagName) {
  const tags = [];
  let searchFrom = 0;
  for (;;) {
    const start = source.indexOf(`<${tagName}`, searchFrom);
    if (start === -1) break;
    const afterName = start + 1 + tagName.length;
    const boundaryChar = source[afterName];
    // `<UserMenuFoo` のような別のタグを拾わない（タグ名の直後が英数字/アンダースコアでないこと）。
    if (boundaryChar !== undefined && /[A-Za-z0-9_]/.test(boundaryChar)) {
      searchFrom = start + 1;
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let i = afterName; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) {
      // 閉じが見つからない（壊れている）。ここで打ち切り、無限ループを避ける。
      searchFrom = start + 1;
      continue;
    }
    const line = source.slice(0, start).split("\n").length;
    tags.push({ text: source.slice(start, end + 1), line });
    searchFrom = end + 1;
  }
  return tags;
}

/**
 * 規則 G: `<UserMenu ...>` の使用箇所ごとに、userLabel の出どころがこの検査から
 * 見える形（`userLabel=` または `userLabel:`）で渡っているかを確かめる。
 * 見えなければ（`{...何か}` だけで渡している等）、**「検査できない」を「異常が無い」に
 * すり替えず**、検査できない形として違反にする。
 *
 * 🚨 使用箇所が1件も見つからなければ、それ自体を違反にする（対象を1件も拾えていないのに
 *    緑になる、を防ぐ。いま `left-sidebar.tsx` と `mobile-nav.tsx` の計2件があるはず。
 *    件数はこの関数の戻り値では出さず、呼び出し側の判定ログで実測して確認すること）。
 */
function checkUserMenuVisibility(sources) {
  const violations = [];
  let total = 0;

  for (const [file, source] of Object.entries(sources)) {
    if (file === GUARD_FILE) continue;
    for (const tag of extractJsxTags(source, "UserMenu")) {
      total += 1;
      if (!/\buserLabel\s*[=:]/.test(tag.text)) {
        violations.push({
          file,
          line: tag.line,
          rule: "G",
          detail:
            "UserMenu に userLabel が spread で渡っており、この検査からは中身が見えない。" +
            "userLabel={displayUserLabel(...)} の形で明示的に渡すこと",
        });
      }
    }
  }

  if (total === 0) {
    violations.push({
      file: "(app|components)/**",
      line: 0,
      rule: "G",
      detail: "UserMenu の使用箇所が1件も見つからない（対象を拾えていない可能性があるため、安全側で違反として扱う）",
    });
  }

  return violations;
}

/**
 * 違反を返す。sources は { ファイル名: 中身 } の写し（壊した版を渡せるようにするため）。
 *
 * 見るのは8つ:
 *   A. `userLabel={...}` に生のメールが直接入っていないか
 *   B. `userLabel={...}` が必ず `displayUserLabel(` を通っているか
 *   C. 見張り役（user-label.ts）が LOCAL_ADMIN_EMAIL と実際に**比較**しているか
 *   D. `displayUserLabel` の本体が `isSamlPlaceholderEmail(` を呼んでいるか
 *      （SAML の合成メール `<uuid>@saml.invalid` を隠せているか）
 *   E. `visibleHuman` の本体が `isSamlPlaceholderEmail(` を呼んで**いない**か
 *      （呼んでいたら「やりすぎ」。SAML の利用者は displayUserLabel だけでなく
 *      displayUserPicture / displayUserAvatarEmoji / displayUserName からも
 *      丸ごと消えてしまう。弾きは displayUserLabel だけに置く設計）
 *   F. object literal の `userLabel: ...`（spread `{...{ userLabel: X }}` や
 *      `const p = { userLabel: X }`）にも、A/B と同じ判定を当てているか
 *   G. `<UserMenu ...>` の呼び出し側で、userLabel の出どころがこの検査から
 *      見える形（`userLabel=` / `userLabel:`）で渡っているか
 *   H. `userLabel={識別子}` の素通しを、同じファイルに `const 識別子 = …`（通常の代入）、
 *      または `const { email } = …` / `const { email: 識別子 } = …`（分割代入）が
 *      あればその右辺まで追っているか（無ければこれまでどおり、呼び出し元が別ファイルに
 *      ある正当な素通しとして扱う）
 *
 * 戻り値は `{ violations, scannedFiles, judgedExpressionsByFile }`。
 * `scannedFiles` は GUARD_FILE を除いて実際に規則 A/B/F を当てた本数
 * （「候補」＝ Object.keys(sources).length とは別物）。
 * `judgedExpressionsByFile` は `{ ファイル名: checkLabelExpression() に渡した式そのものの配列 }`
 * （規則 A/B の JSX 属性・規則 F の object literal の両方を合算。配列の長さが「判定した回数」）。
 * 🚨 由来: 2026-08-16 司令塔指摘（1回目）。「置換 N 件」は差し込んだ文字列がソースに入ったことしか
 * 示さず、findViolations がその式まで**判定した**かは別。ここで実際に判定した式の**実物**を
 * ファイル別に集めて返し、呼び出し側（「見逃す入力の実演」）が「届いた」ことを実測できるようにする。
 * 🚨 由来: 2026-08-16 司令塔指摘（2回目）。件数だけだと、**同じファイルの他の式が N 件在れば
 * N ≥ 1 になり、囮そのものが判定されていなくても「届いた」ように見える**。件数でなく実物
 * （式の文字列そのもの）を持たせ、呼び出し側で「差し込んだ式そのものが在るか」を照合できるようにした。
 */
function findViolations(sources) {
  const violations = [];
  // 🚨 「候補」ではなく「実際に規則 A/B/F を当てた本数」。GUARD_FILE はここで continue
  //    するので数えない。呼び出し側で `候補 - 1` のように計算しない（この関数の中に
  //    ふるいが増えた日に、外側の計算が嘘になるのを防ぐため。ここで実測する）。
  let scannedFiles = 0;
  const judgedExpressionsByFile = {};

  for (const [file, source] of Object.entries(sources)) {
    if (file === GUARD_FILE) continue;
    scannedFiles += 1;
    // 🚨 数ではなく実物（判定した式の文字列そのもの）を集める。理由は上のJSDoc参照。
    const judgedForFile = [];

    // A/B: `userLabel={...}`（JSX 属性として直接渡している式）
    for (const m of source.matchAll(/userLabel=\{([^}]*)\}/g)) {
      const expression = m[1].trim();
      const line = source.slice(0, m.index).split("\n").length;
      checkLabelExpression(violations, file, source, expression, line, {
        emailRule: "A",
        missingRule: "B",
        passThroughRule: "H",
      });
      judgedForFile.push(expression);
    }

    // F: object literal の `userLabel:`（spread や変数化で隠れている式）
    for (const { expression, line } of findObjectLiteralUserLabelExpressions(source)) {
      checkLabelExpression(violations, file, source, expression, line, {
        emailRule: "F",
        missingRule: "F",
        passThroughRule: "H",
      });
      judgedForFile.push(expression);
    }

    judgedExpressionsByFile[file] = judgedForFile;
  }

  const guard = sources[GUARD_FILE];
  if (guard === undefined) {
    violations.push({ file: GUARD_FILE, line: 0, rule: "C", detail: "見張り役が無い" });
  } else {
    if (!/===\s*LOCAL_ADMIN_EMAIL/.test(guard)) {
      // 🚨 「LOCAL_ADMIN_EMAIL という語がある」だけでは足りない。import しているだけでも通ってしまう。
      //    **比較している**ことまで見る（部分一致で終わらせない）。
      violations.push({ file: GUARD_FILE, line: 0, rule: "C", detail: "LOCAL_ADMIN_EMAIL と比較していない" });
    }

    // 🚨 「isSamlPlaceholderEmail という語がファイルのどこかにある」だけでは足りない。
    //    import 文にも語が出るので、**displayUserLabel の本体で呼ばれていること**まで見る。
    const displayUserLabelBody = extractFunctionBody(guard, "displayUserLabel");
    if (!displayUserLabelBody || !/isSamlPlaceholderEmail\(/.test(displayUserLabelBody)) {
      violations.push({
        file: GUARD_FILE,
        line: 0,
        rule: "D",
        detail: "displayUserLabel が isSamlPlaceholderEmail() を呼んでいない（SAML の合成メールを隠せていない）",
      });
    }

    // 🚨 E: `visibleHuman` が isSamlPlaceholderEmail() を呼んでいたら「やりすぎ」。
    //    切り出しが本当に visibleHuman の本体を取れているかを、判定の前に確かめる
    //    （null なら extractFunctionBody が壊れている＝この規則が永久に発火しない状態。
    //    「見ていない」ではなく**違反として落とす**。中身に LOCAL_ADMIN_EMAIL が
    //    含まれることまで見て、別の函数を誤って切り出していないことも確認する）。
    //    🚨 「切り出せなかった（null）」と「切り出せたが LOCAL_ADMIN_EMAIL を含まない」は
    //    別の不具合なので、文言を分ける（同じ文言だと、後者が起きても
    //    extractFunctionBody を疑う調査になり、実際の原因（壊し方2 のような
    //    LOCAL_ADMIN_EMAIL 比較の消失）に辿り着けない）。
    const visibleHumanBody = extractFunctionBody(guard, "visibleHuman");
    if (!visibleHumanBody) {
      violations.push({
        file: GUARD_FILE,
        line: 0,
        rule: "E",
        detail:
          "visibleHuman の本体を切り出せなかった（extractFunctionBody が空振りしている。安全側で違反として扱う）",
      });
    } else if (!visibleHumanBody.includes("LOCAL_ADMIN_EMAIL")) {
      violations.push({
        file: GUARD_FILE,
        line: 0,
        rule: "E",
        detail:
          "visibleHuman の本体を切り出せたが LOCAL_ADMIN_EMAIL が含まれていない（比較そのものが消えたか、別の函数を誤って切り出した可能性があるため、安全側で違反として扱う）",
      });
    } else if (/isSamlPlaceholderEmail\(/.test(visibleHumanBody)) {
      violations.push({
        file: GUARD_FILE,
        line: 0,
        rule: "E",
        detail:
          "visibleHuman が isSamlPlaceholderEmail() を呼んでいる（やりすぎ。SAML の利用者は名前・画像・絵文字まで消える。弾きは displayUserLabel だけに置く）",
      });
    }

    // 🚨 I: **利用者 id での比較**が visibleHuman に在るか（2026-08-17 追加）。
    //    規則 E（メールでの比較）だけだと、**メールを変えられた瞬間に隠せなくなる**
    //    （`knowledge/decisions/guards-keyed-by-name-break-silently.md`）。
    //    実際に「管理者が自分のメールを変えるとログインできない」形で表に出た。
    // 🚨 **E を I に置き換えない。両方要る。**
    //    ・id …… メールを変えられても隠せる
    //    ・メール … `ohmycms_settings.local_admin_user_id` が空の環境でも隠せる
    //    片方だけにすると、もう片方の環境で漏れる。
    // 🚨 「`localAdminUserId` という語が在る」だけでは足りない（引数名にも出る）。
    //    **`me.userId === localAdminUserId` という比較そのもの**まで見る。
    if (visibleHumanBody && !/me\.userId\s*===\s*localAdminUserId/.test(visibleHumanBody)) {
      violations.push({
        file: GUARD_FILE,
        line: 0,
        rule: "I",
        detail:
          "visibleHuman が利用者 id で比較していない（メールだけで隠している。メールは人も IdP も変える値なので、変えられた瞬間に隠せなくなる）",
      });
    }
  }

  // G: UserMenu の呼び出し側から見える形で渡っているか
  violations.push(...checkUserMenuVisibility(sources));

  return { violations, scannedFiles, judgedExpressionsByFile };
}

/**
 * 実物を読み込む。glob が何本拾ったか（`globFileCount`）と、読み込んだ全ソースの
 * 合計文字数（`totalChars`）を呼び出し側へ返す。
 *
 * 🚨 由来: 2026-08-16。列挙（glob）が生きていても、`read()` 自体が壊れて常に空文字列を
 * 返す形では、`globFileCount` は正の値のまま・`REQUIRED_FILES` の存在チェックも
 * （`sources[file]` が `""` で `undefined` ではないので）素通りする。
 * 「列挙できたが 1 文字も読めていない」を「違反が無い」と区別するために、
 * ここで実際に読めた文字数を数えて返す（0 なら呼び出し側が診断して打ち切る）。
 */
function loadSources() {
  const globPattern = "{app,components}/**/*.{ts,tsx}";
  const files = trackedGlob(globPattern, { cwd: root }).sort();
  const sources = {};
  let totalChars = 0;
  for (const file of files) {
    const content = read(file);
    sources[file] = content;
    totalChars += content.length;
  }
  const guardContent = read(GUARD_FILE);
  sources[GUARD_FILE] = guardContent;
  totalChars += guardContent.length;
  return { sources, globPattern, globFileCount: files.length, totalChars };
}

/**
 * 対照3（GREEN）と壊し方8（RED）が共有する、メモリ上だけのプローブファイル。
 * **ディスクには絶対に書かない**（`BLIND_SPOT_PROBE_SOURCE` と同じやり方）。
 *
 * 由来: 2026-08-16。規則Hに findDestructuredRhs（同じファイルの分割代入も追う）を
 * 足した直後、台（git worktree --detach）で次の形が過検出になった:
 *   export function ZzProbe(props) {
 *     const { userLabel } = props;               ← 本体で分割代入
 *     return <UserMenu userName="x" userLabel={userLabel} ... />;
 *   }
 * これは `left-sidebar.tsx` の `function LeftSidebar({ userLabel, ... })`
 * （**引数の分割代入**）と意味が同じで、既存の免除対象のはず。書き方が違う
 * （本体内の分割代入）だけで判定が割れていた。checkLabelExpression の
 * viaDestructuring 分岐（上のJSDoc・コード参照）で直した。
 *
 * `leak: true` を渡すと、`userLabel={userLabel}` を `userLabel={me.data.email}` に
 * 変える。プローブファイルが実際に検査対象（sources の名簿）に載っていることを
 * 確かめるための対照で、これが検出されなければ「対照3の検出0件」は
 * 「見ていない0」（対象に入っていないだけ）かもしれない、という疑いを消せない。
 */
const ZZ_PROBE_FILE = "components/admin/zz-probe.tsx";
function buildZzProbeSource({ leak }) {
  const userLabelExpr = leak ? "me.data.email" : "userLabel";
  return (
    "// 診断専用のメモリ上の写し。ディスクには書かない（check-user-label-leak.mjs 対照3 / 壊し方8）。\n" +
    "export function ZzProbe(props) {\n" +
    "  const { userLabel } = props;\n" +
    "  return (\n" +
    `    <UserMenu userName="x" userLabel={${userLabelExpr}} userPicture={null} userAvatarEmoji={null} />\n` +
    "  );\n" +
    "}\n"
  );
}

// ── 1) 自己検査: わざと壊して、赤くなることを確かめる ──────────────────────
// 壊し方は**8通り**。1通りだけだと「たまたま落ちた」が混ざる。
//
// 🚨 この節（壊し方1〜8）・対照検査（対照1〜3）・見ていない範囲の実演（①〜⑤）は、
//    いずれも読み込み済みの `original` を差し替えてから findViolations(sources) を
//    呼ぶだけで、**ファイルの列挙（glob）そのものはこの囮を通っていない**。
//    列挙が死んでいる（0 本しか拾えていない）状態は、これらの囮では検出できない。
//    その代わり `loadSources()` の直後（この節より前）で列挙本数と、
//    自己検査・実演が使う実物（REQUIRED_FILES）の存在を確認しており、0 本または欠落なら
//    診断を出して exit 1 で打ち切っている（司令塔 2026-08-16 の①への回答）。
//    **したがって「列挙の門が死んだまま緑」にはならない。**

const selfTests = [
  {
    name: "壊し方1: 呼び出し側を、見張り役を通さない生の式に戻す",
    apply(sources) {
      const file = "app/(admin)/layout.tsx";
      const before = sources[file];
      const needle = "userLabel={displayUserLabel(me.ok ? me.data : null, localAdminId)}";
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
  {
    // 🚨 規則 I の的（2026-08-17 追加）。**メールの比較は残したまま、id の比較だけ**を取り除く。
    //    壊し方2（メールを取り除く）と対になっている:
    //      壊し方2 … メールだけ消す → 規則 C/E が鳴る
    //      壊し方9 … id だけ消す  → 🚨 **規則 I だけが鳴る**
    //    🚨 **片方ずつ消して、それぞれ別の規則が鳴ることを毎回確かめる。**
    //    両方まとめて消すと「どちらが効いたか」が分からず、
    //    **id の守りが消えても C/E が鳴るので気づけない**（＝ 規則を足した意味が消える）。
    name: "壊し方9: 見張り役から 利用者 id の比較だけを取り除く（メールの比較は残す）",
    apply(sources) {
      const before = sources[GUARD_FILE];
      const needle =
        "  if (localAdminUserId !== null && me.userId === localAdminUserId) return null;\n";
      const count = countOccurrences(before, needle);
      const after = before.replace(needle, "");
      return { sources: { ...sources, [GUARD_FILE]: after }, count };
    },
  },
  {
    name: "壊し方3: user-label.ts から isSamlPlaceholderEmail の呼び出しを消す",
    apply(sources) {
      const before = sources[GUARD_FILE];
      const needle = "return human && !isSamlPlaceholderEmail(human.email) ? human.email : null;";
      const count = countOccurrences(before, needle);
      const after = before.replaceAll(needle, "return human ? human.email : null;");
      return { sources: { ...sources, [GUARD_FILE]: after }, count };
    },
  },
  {
    // 🚨 これが本当の「やりすぎ」の形。displayUserLabel の呼び出し（弾き）は**残したまま**、
    //    visibleHuman の中に isSamlPlaceholderEmail の判定を**足す**。
    //    displayUserLabel だけを見る規則Dは、呼び出しが消えていないので拾えない
    //    （壊し方3 と同じものを測ってしまう）。この形を検出できるのは規則E だけ。
    //    SAML の利用者は displayUserLabel だけでなく displayUserPicture /
    //    displayUserAvatarEmoji / displayUserName からも消える（名前ごと丸ごと消える）。
    name: '壊し方4: displayUserLabel の呼び出しは残したまま、visibleHuman にも isSamlPlaceholderEmail を足す（"やりすぎ"の形）',
    apply(sources) {
      const before = sources[GUARD_FILE];
      const needle = "if (me.email === LOCAL_ADMIN_EMAIL) return null;\n  return me;";
      const replacement =
        "if (me.email === LOCAL_ADMIN_EMAIL) return null;\n" +
        "  if (isSamlPlaceholderEmail(me.email)) return null;\n" +
        "  return me;";

      const count = countOccurrences(before, needle);
      const after = before.replaceAll(needle, replacement);

      return { sources: { ...sources, [GUARD_FILE]: after }, count };
    },
  },
  {
    // 🚨 規則F の的。layout.tsx の `userLabel={displayUserLabel(...)}` を**1箇所だけ**
    //    spread（`{...{ userLabel: ... }}`）に置き換える。全部置き換えると
    //    他の自己検査の的（needle）が消えて、「別の理由で赤くなった」のか
    //    「これを検出した」のか区別できなくなるので、`.replace`（先頭1件だけ）を使う。
    name: "壊し方5: userLabel={displayUserLabel(...)} を1箇所だけ spread（object literal）に変える",
    apply(sources) {
      const file = "app/(admin)/layout.tsx";
      const before = sources[file];
      const needle = "userLabel={displayUserLabel(me.ok ? me.data : null, localAdminId)}";
      const replacement =
        '{...{ userLabel: me.ok && me.data.type === "human" ? me.data.email : null }}';
      const count = countOccurrences(before, needle) > 0 ? 1 : 0;
      const after = before.replace(needle, replacement);
      return { sources: { ...sources, [file]: after }, count };
    },
  },
  {
    // 🚨 規則H の的。変数に入れてから渡す形。`const leaked = …email;` を関数の中に足し、
    //    `userLabel={displayUserLabel(...)}`（1箇所だけ）を `userLabel={leaked}` に変える。
    name: "壊し方6: 変数に入れてから渡す（const leaked = …email; userLabel={leaked}）",
    apply(sources) {
      const file = "app/(admin)/layout.tsx";
      const before = sources[file];
      const declAnchor = 'const leftSidebarDefaultOpen = sidebarCookie !== "false";';
      const needle = "userLabel={displayUserLabel(me.ok ? me.data : null, localAdminId)}";
      const anchorCount = countOccurrences(before, declAnchor);
      const needleCount = countOccurrences(before, needle);
      if (anchorCount === 0 || needleCount === 0) {
        // アンカーか的が見つからない = 壊せていない。count 0 のまま返し、
        // 下の「置換 0 件」検出に任せる（壊れていないのに赤いのを「検出できた」と誤読しないため）。
        return { sources, count: 0 };
      }
      let after = before.replace(
        declAnchor,
        `${declAnchor}\n  const leaked = me.ok && me.data.type === "human" ? me.data.email : null;`,
      );
      after = after.replace(needle, "userLabel={leaked}");
      return { sources: { ...sources, [file]: after }, count: 1 };
    },
  },
  {
    // 🚨 規則G の的。`<UserMenu ...>` の使用箇所を丸ごと `{...userMenuProps}` だけの
    //    呼び出しに変える。`userLabel` の文字が1つも残らない（= A/B/F のどの正規表現にも
    //    引っかからない）ので、この形を検出できるのは規則G だけ。
    name: "壊し方7: UserMenu へ {...userMenuProps} だけで渡す（userLabel の文字が無い）",
    apply(sources) {
      const file = "components/admin/left-sidebar.tsx";
      const before = sources[file];
      const needle =
        "<UserMenu\n            userName={userName}\n            userId={userId}\n" +
        "            userLabel={userLabel}\n            userPicture={userPicture}\n" +
        "            userAvatarEmoji={userAvatarEmoji}\n          />";
      const count = countOccurrences(before, needle);
      const after = before.replace(needle, "<UserMenu {...userMenuProps} />");
      return { sources: { ...sources, [file]: after }, count };
    },
  },
  {
    // 🚨 対照3（GREEN）が「見ていない0」ではないことの確認。対照3で使うプローブと同じファイルを
    //    足し、`userLabel={userLabel}`（免除されるべき素通し）を `userLabel={me.data.email}`
    //    （生のメール）に変える。これが検出されないなら、対照3の検出0件は「対象に入っていない
    //    だけ」の疑いが晴れない。**追加**であって置換ではないので、置換件数は「追加したファイル数」
    //    として1で扱う（実際にやったことに合わせる。他の壊し方と違う操作である旨は actionLabel で示す）。
    name: "壊し方8: 対照3のプローブ（zz-probe.tsx・メモリ上のみ）で userLabel={userLabel} を userLabel={me.data.email} に変える",
    actionLabel: "追加",
    apply(sources) {
      return {
        sources: { ...sources, [ZZ_PROBE_FILE]: buildZzProbeSource({ leak: true }) },
        count: 1,
      };
    },
  },
];

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const { sources: original, globPattern, globFileCount, totalChars } = loadSources();

// 🚨 ここではまだ何も「違反」を判定しない。判定できる状態にあるかどうかだけを見る。
//    列挙（glob）が 0 本、または自己検査・実演が使う実物（REQUIRED_FILES）が読み込めて
//    いないなら、以降の判定は「違反が無い」ではなく「見ていない」なので、
//    スタックトレースではなく日本語の診断を出して打ち切る
//    （司令塔 2026-08-16②への回答: 以前は countOccurrences の中で undefined.split が
//    TypeError になり、原因（列挙が0本）に辿り着けなかった）。
if (globFileCount === 0) {
  console.error("■ 列挙の診断");
  console.error("  この検査は 1 本も走査していません。「違反が無い」ではなく「見ていない」です。");
  console.error(`  glob パターン: ${globPattern}`);
  console.error(`  root: ${root}`);
  process.exit(1);
}

const missingRequiredFiles = REQUIRED_FILES.filter((file) => original[file] === undefined);
if (missingRequiredFiles.length > 0) {
  console.error("■ 列挙の診断");
  console.error(
    "  自己検査・実演が使う実物が見つかりませんでした。「違反が無い」ではなく「見ていない」です。",
  );
  console.error(`  見つからなかったファイル: ${missingRequiredFiles.join(", ")}`);
  console.error(`  glob パターン: ${globPattern}`);
  console.error(`  root: ${root}`);
  process.exit(1);
}

// 🚨 列挙（glob）は生きていて、REQUIRED_FILES も見つかっているのに、`read()` 自体が
//    壊れて常に空文字列を返す形は上の2つの門をすり抜ける（`sources[file]` が `""` で
//    `undefined` ではないため）。「列挙 0 本」とは原因が違うので、文面を使い回さず
//    別の診断として出す（司令塔 2026-08-16①への回答）。
if (totalChars === 0) {
  console.error("■ 読み込みの診断");
  console.error(
    "  ファイルの列挙はできていますが、1 文字も読み込めていません。「違反が無い」ではなく「見ていない」です。",
  );
  console.error(`  走査対象 ${globFileCount} 本 / 読めた文字数 0`);
  console.error(`  glob パターン: ${globPattern}`);
  console.error(`  root: ${root}`);
  process.exit(1);
}

let selfTestFailed = false;

console.log("■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
for (const test of selfTests) {
  const { sources, count } = test.apply(original);
  const { violations } = findViolations(sources);
  // 🚨 置換が 0 件なら、壊せていない。「赤くならなかった」ではなく「壊れていない」が正しい。
  const detected = count > 0 && violations.length > 0;

  const detectedRules = [...new Set(violations.map((v) => v.rule))].join(",") || "-";
  const actionLabel = test.actionLabel || "置換";
  console.log(
    `  ${detected ? "✅" : "❌"} ${test.name}  ${actionLabel} ${count} 件 → 検出 ${violations.length} 件（rule: ${detectedRules}）`,
  );
  if (count === 0) {
    console.error(`     ↑ ${actionLabel}が 0 件。壊せていないので、赤くならないのは当然。検査の書き方が古い。`);
  }

  if (!detected) selfTestFailed = true;
}

// ── 1b) 対照検査: 壊していない変更で誤検出しないことを確かめる（GREENの確認） ──
// 🚨 これは RED ではなく GREEN の確認なので、判定が**逆**になる: 検出 0 件なら ✅ / 1件以上なら ❌。
//    置換 0 件のときは（1)と同じ理由で「確かめられていない」ので、これも失敗として扱う。
//    RED（自己検査）と混ざらないよう節を分けて出す。

const greenTests = [
  {
    // 実際の事故の再現: displayUserLabel の**説明文（JSDoc）**に、
    // isSamlPlaceholderEmail( という語を含む行を1行足しただけ。コード行は1文字も変えていない。
    // visibleHuman の本体を、そのすぐ後ろにある displayUserLabel の JSDoc まで
    // 巻き込んで切り出していた旧実装では、これが規則Eの誤検出を引き起こしていた。
    name: "対照1: displayUserLabel の説明文に isSamlPlaceholderEmail( と書いても検出しない",
    apply(sources) {
      const before = sources[GUARD_FILE];
      const needle = " */\nexport function displayUserLabel(";
      const count = countOccurrences(before, needle);
      const after = before.replaceAll(
        needle,
        " * 具体的には `isSamlPlaceholderEmail(human.email)` が真なら出さない。\n */\nexport function displayUserLabel(",
      );
      return { sources: { ...sources, [GUARD_FILE]: after }, count };
    },
  },
  {
    // 🚨 規則Gが「spread があれば全部違反」になっていないことの確認。
    //    userLabel が明示（`userLabel={userLabel}`）されていれば、他の無関係な spread
    //    （`{...{ "data-zz": 1 }}`）が同じタグに同居していても通るのが正しい。
    name: "対照2: UserMenu に無関係な spread を足しても誤検出しない",
    apply(sources) {
      const file = "components/admin/left-sidebar.tsx";
      const before = sources[file];
      const needle =
        "<UserMenu\n            userName={userName}\n            userId={userId}\n" +
        "            userLabel={userLabel}\n            userPicture={userPicture}\n" +
        "            userAvatarEmoji={userAvatarEmoji}\n          />";
      const replacement =
        "<UserMenu\n            userName={userName}\n            userId={userId}\n" +
        "            userLabel={userLabel}\n            userPicture={userPicture}\n" +
        "            userAvatarEmoji={userAvatarEmoji}\n" +
        '            {...{ "data-zz": 1 }}\n          />';
      const count = countOccurrences(before, needle);
      const after = before.replace(needle, replacement);
      return { sources: { ...sources, [file]: after }, count };
    },
  },
  {
    // 🚨 2026-08-16 追加。規則Hが同じファイルの分割代入も追うようになった直後、
    //    `const { userLabel } = props;` → `<UserMenu ... userLabel={userLabel} .../>`
    //    （本体内の分割代入で親から受けた prop を素通しにする形）が過検出になった実測を再現する。
    //    これは left-sidebar.tsx の「引数の分割代入」（`function LeftSidebar({ userLabel, ... })`）と
    //    意味が同じで、既存の免除対象のはず。**ファイルを1件追加する**変更なので「置換」ではない
    //    （実際にやったことに合わせて actionLabel で「追加」と出す）。
    //    このプローブが本当に検査対象の名簿（sources）に載っていることは、
    //    上の自己検査（RED）「壊し方8」が同じファイルを leak: true で足して検出できることで確認する
    //    （対照3が検出0件でも、そもそも対象に入っていない「見ていない0」ではないことの裏付け）。
    name: "対照3: 本体内の分割代入で親から受けた prop を素通しにしても誤検出しない（const { userLabel } = props;）",
    actionLabel: "追加",
    apply(sources) {
      return {
        sources: { ...sources, [ZZ_PROBE_FILE]: buildZzProbeSource({ leak: false }) },
        count: 1,
      };
    },
  },
];

let greenTestFailed = false;

console.log("\n■ 対照検査（壊していない変更で誤検出しないことを確かめる）");
for (const test of greenTests) {
  const { sources, count } = test.apply(original);
  const { violations } = findViolations(sources);
  const clean = count > 0 && violations.length === 0;
  const actionLabel = test.actionLabel || "置換";

  console.log(`  ${clean ? "✅" : "❌"} ${test.name}  ${actionLabel} ${count} 件 → 検出 ${violations.length} 件`);
  if (count === 0) {
    console.error(`     ↑ ${actionLabel}が 0 件。変更が当たっていないので、検出 0 件は何も確かめていない。`);
  }
  if (!clean && violations.length > 0) {
    for (const v of violations) {
      console.error(`     誤検出 [${v.rule}] ${v.file}:${v.line}  ${v.detail}`);
    }
  }

  if (!clean) greenTestFailed = true;
}

// ── 1c) 見ていない範囲の診断 / 見逃す入力の実演: 毎回その場で作って通す ─────────
// 🚨 ファイル冒頭のJSDocに書いた「この検査で分からないこと」は、書いた時点の実装を
//    写しただけで、今もそのとおりかは保証しない。毎回ここで各パターンをメモリ上に作り、
//    findViolations に通して実測する（ディスクは書き換えない）。
//
// 🚨 **自分の検出器が見逃す入力を、自分で作って通す**（司令塔の規律・2026-08-16）。
//    在るかどうか分からないものを探すのではなく、**作れば必ず在る**。
//    各行は「拾う／見逃す」の実測結果と、見逃す場合は理由（免除か・未対応か）を出す。
//
//   ① 別ファイルの関数を経由（zzLeakyLabel が生のメールを返す）
//      規則Bは呼び出し元がどのファイルかを見ておらず、式が `displayUserLabel(` を
//      含むかしか見ていないので、拾える。**いま拾えているので、緑であることを保証する対象**
//      （拾えなくなったら selfTestFailed にして落とす＝退行）。
//   ② 別ファイルの const を素の識別子で渡す（zzLeakedLabel）
//      規則Hは**同じファイル内**の const/let/var 宣言しか追わない設計なので、拾えない。
//      これは left-sidebar.tsx が親から受けた prop を素の識別子で渡している、
//      正当な免除と同じ形。塞ぐのではなく、毎回「見ていない」と言わせるのがここの役目
//      （急に「拾える」に変わったら、その免除が効かなくなった可能性があるので出力に出す。
//      ただし left-sidebar.tsx 側の正当な素通しを壊す変更かもしれないので、これは失敗にしない）。
//   ③ テンプレートリテラルで直接埋め込む（`${me.data.email}`）
//      式のテキストに `.email` がそのまま出るので、規則A/Fの最初の判定（`/\.email\b/`）で
//      拾える（識別子1つの素通しではないので規則Hは通らない）。
//   ④ 同じファイルで分割代入してから渡す（`const { email: x } = me.data; … userLabel={x}`）
//      🚨 これが今回塞いだ穴そのもの。findDestructuredRhs を足す前は1件も写らなかった
//      （実測。堀池の報告どおり）。修正後は**拾う**side に入っていること自体が退行検知になる。
//   ⑤ 角括弧で読む（`me.data["email"]`）
//      規則Fの `.email` 判定は文字どおり `.email` を探すので、`["email"]` はそこに一致しない。
//      ただしこの式は識別子1つの素通しでもないので、「displayUserLabel( を通していない」規則Bで
//      別ルートから拾える。**期待値を決め打ちせず、実測した結果をそのまま出す**（observe）。
//   🟢 対照(+) 素で渡す（displayUserLabel を通さず直接 `.email` を渡す）
//      これが拾えなければ検出器そのものが壊れている。**必ず拾う**側で、拾えなければ失敗にする。

const BLIND_SPOT_LAYOUT_FILE = "app/(admin)/layout.tsx";
const BLIND_SPOT_PROBE_FILE = "lib/admin/zz-leak-probe.ts";
const BLIND_SPOT_NEEDLE = "userLabel={displayUserLabel(me.ok ? me.data : null, localAdminId)}";
const BLIND_SPOT_DECL_ANCHOR = 'const leftSidebarDefaultOpen = sidebarCookie !== "false";';
const BLIND_SPOT_PROBE_SOURCE =
  "// 診断専用のメモリ上の写し。ディスクには書かない（check-user-label-leak.mjs の自己診断）。\n" +
  "export function zzLeakyLabel(user) {\n" +
  '  return user && user.type === "human" ? user.email : null;\n' +
  "}\n\n" +
  'export const zzLeakedLabel = "leaked@example.com";\n';

/**
 * 免除・実演プローブ共通のビルダー。layout.tsx の `userLabel={displayUserLabel(...)}` を
 * **先頭1件だけ**（壊し方5/6 と同じ理由。全部置き換えると他の的と区別が付かなくなる）置き換える。
 *
 * `extraDecl` を渡すと、`leftSidebarDefaultOpen` の宣言の直後に1行足してから置き換える
 * （④の「同じファイルで分割代入」のように、使う手前に宣言が要るプローブ用）。
 * `withProbeFile` を渡すと、①②が参照する `zz-leak-probe.ts` の写しも sources に足す。
 */
function buildBlindSpotSources({ replacement, extraDecl, withProbeFile }) {
  const before = original[BLIND_SPOT_LAYOUT_FILE];
  const needleFound = countOccurrences(before, BLIND_SPOT_NEEDLE) > 0;

  let anchorFound = true;
  let afterLayout = before;
  if (extraDecl) {
    anchorFound = countOccurrences(before, BLIND_SPOT_DECL_ANCHOR) > 0;
    afterLayout = afterLayout.replace(BLIND_SPOT_DECL_ANCHOR, `${BLIND_SPOT_DECL_ANCHOR}\n  ${extraDecl}`);
  }
  afterLayout = afterLayout.replace(BLIND_SPOT_NEEDLE, replacement);

  const count = needleFound && anchorFound ? 1 : 0;

  const sources = { ...original, [BLIND_SPOT_LAYOUT_FILE]: afterLayout };
  if (withProbeFile) sources[BLIND_SPOT_PROBE_FILE] = BLIND_SPOT_PROBE_SOURCE;
  return { sources, count };
}

/**
 * 実演プローブが `replacement` に書いた `userLabel={式}` から、式そのものを取り出す。
 * findViolations の A/B 抽出（`/userLabel=\{([^}]*)\}/`）と**同じ正規表現**を使うことで、
 * 「この囮が実際に判定される形では何と読まれるはずか」を、判定側の実装と揃える
 * （別の正規表現で手書きすると、抽出のクセ〔例: テンプレートリテラルの `${...}` の内側で
 * 最初の `}` に止まる〕がずれて、一致しないのに「一致するはず」と誤解する）。
 * 一致しなければ null（＝この照合の仕組み自体が使えないプローブ。呼び出し側で扱う）。
 */
function extractProbeExpression(replacement) {
  const m = /userLabel=\{([^}]*)\}/.exec(replacement);
  return m ? m[1].trim() : null;
}

const blindSpotProbes = [
  {
    label: "① 別ファイルの関数を経由（zzLeakyLabel が生のメールを返す）",
    mode: "true",
    withProbeFile: true,
    replacement: "userLabel={zzLeakyLabel(me.ok ? me.data : null)}",
  },
  {
    label: "② 別ファイルの const を素の識別子で渡す（zzLeakedLabel。left-sidebar.tsx の正当な素通しと同じ形の免除）",
    mode: "false",
    withProbeFile: true,
    replacement: "userLabel={zzLeakedLabel}",
  },
  {
    label: "③ テンプレートリテラルで直接埋め込む（`${me.data.email}`）",
    mode: "true",
    replacement: "userLabel={`${me.data.email}`}",
  },
  {
    label:
      "④ 同じファイルで分割代入してから渡す（const { email: leaked } = me.data; … userLabel={leaked}）",
    mode: "true",
    extraDecl: "const { email: leakedByDestructure } = me.ok ? me.data : { email: null };",
    replacement: "userLabel={leakedByDestructure}",
  },
  {
    label: '⑤ 角括弧で読む（me.data["email"]）',
    mode: "observe",
    replacement: 'userLabel={me.ok ? me.data["email"] : null}',
  },
  {
    label: "🟢 対照(+) 素で渡す（displayUserLabel を通さず直接 .email を渡す）",
    mode: "true",
    replacement: "userLabel={me.ok ? me.data.email : null}",
  },
];

console.log("\n■ 見ていない範囲の診断 / 見逃す入力の実演（毎回その場で測る。静的な文言ではない）");
let blindSpotRegression = false;
for (const probe of blindSpotProbes) {
  const { sources, count } = buildBlindSpotSources(probe);
  if (count === 0) {
    console.error(`  ❌ ${probe.label}  置換 0 件（壊せていない。判定できない）`);
    blindSpotRegression = true;
    continue;
  }

  const { violations: probeViolations, judgedExpressionsByFile } = findViolations(sources);
  // 🚨 「届いたか」は「置換 N 件」（差し込んだ文字列がソースに入ったか）とは別物。
  //    findViolations が実際にこのファイルの userLabel 式を何件判定したかだけでなく、
  //    **この囮が差し込んだ式そのもの**が判定された一覧（実物）に在るかまで照合する
  //    （司令塔 2026-08-16 再指摘: 「N 件を判定」は**同じファイルの他の式が N 件在れば**
  //    N ≥ 1 になり、この行の囮そのものが判定されていなくても「届いた」ように見える。
  //    「届いて通した」と「届かずに undefined」が同じ表示になっていた）。
  const judgedExprs = judgedExpressionsByFile[BLIND_SPOT_LAYOUT_FILE] ?? [];
  const judgedCount = judgedExprs.length;
  const expectedExpr = extractProbeExpression(probe.replacement);
  const probeReached = expectedExpr !== null && judgedExprs.includes(expectedExpr);
  const reachedCountSuffix =
    judgedCount > 0
      ? `／🟢 判定に届いた: layout.tsx の userLabel 式 ${judgedCount} 件を判定`
      : "／🚨 判定に届いていません（layout.tsx の userLabel 式 0 件）。「見逃した」ではなく「測れていない」です";

  const detected = probeViolations.length > 0;
  const detectedRules = [...new Set(probeViolations.map((v) => v.rule))].join(",") || "-";

  if (judgedCount === 0 || !probeReached) {
    // 🚨 これは「拾える」側の行にも当てる（届かずにたまたま0件、を防ぐ）。
    //    判定は「実物が一覧に在るか」で落とす（数では落とさない）。同じファイルの
    //    他の式が判定されているだけ（judgedCount > 0 だが probeReached === false）でも、
    //    この行の囮そのものは測れていないので、ここで打ち切る。
    //    判定に届いていない以上、detected の true/false に意味が無いので、
    //    以降の分岐（observe / true / false）へ進めずここで無条件に失敗として扱う。
    const sample =
      judgedExprs
        .slice(0, 2)
        .map((e) => `userLabel={${e}}`)
        .join(" / ") || "（判定された式は 0 件）";
    console.error(
      `  🚨 ${probe.label}  置換 ${count} 件 → 検出 ${probeViolations.length} 件（rule: ${detectedRules}）${reachedCountSuffix}`,
    );
    console.error(
      `        この行の式は判定されていません。「見逃した」ではなく「測れていない」です。` +
        `／🟢 判定した実物（先頭2件）: ${sample}`,
    );
    blindSpotRegression = true;
    continue;
  }

  const reachedSuffix = `${reachedCountSuffix}／🟢 判定した実物: userLabel={${expectedExpr}}`;

  if (probe.mode === "observe") {
    // 🚨 期待値を決め打ちしない。実測した結果をそのまま「拾う／見逃す」で出す
    //    （どちらでも失敗にはしない。判断材料として出すだけ）。
    const mark = detected ? "✅ 拾う" : "⚠️ 見逃す（未対応。免除としては決めていない。実測しただけ）";
    console.log(
      `  ${mark}  ${probe.label}  置換 ${count} 件 → 検出 ${probeViolations.length} 件（rule: ${detectedRules}）${reachedSuffix}`,
    );
    continue;
  }

  const expectDetected = probe.mode === "true";

  if (detected === expectDetected) {
    // 🚨 「毎回出るのに誰も決めない」を作らない（司令塔の規律・2026-08-16）。
    //    exit 0 のまま出し続けるものには、**いつ決めたか / 未決か / 決めた人 / 何を決めたか**を添える。
    //    添えないと、次に読む人は「まだ誰かが決める途中」と読み、毎日出続けて風景になる。
    const mark = detected
      ? "✅ 拾える"
      : "⚠️ 拾えない（決定 2026-08-16 / **塞がない**——"
        + "`left-sidebar.tsx` が親から受けた prop を素の識別子で渡すのは正当で、"
        + "塞ぐとその形まで違反になるため。**未決ではありません**）";
    console.log(
      `  ${mark}  ${probe.label}  置換 ${count} 件 → 検出 ${probeViolations.length} 件（rule: ${detectedRules}）${reachedSuffix}`,
    );
    continue;
  }

  if (expectDetected && !detected) {
    // 拾えている前提のプローブ（①③④🟢）が拾えなくなった。緑であることを保証する対象なので退行。
    console.error(`  🚨 退行  ${probe.label}  置換 ${count} 件 → 検出 0 件${reachedSuffix}`);
    console.error("     ↑ これまで拾えていた経路が拾えなくなった（findViolations の変更を疑う）。");
    blindSpotRegression = true;
  } else {
    // ②が急に「拾える」に変わった。免除が効かなくなった＝left-sidebar.tsx の正当な
    // 素通し（規則H）まで違反にし始めた可能性がある。黙って変わらせず、必ず出力に出す。
    console.log(
      `  ℹ️ 免除が効かなくなった  ${probe.label}  置換 ${count} 件 → 検出 ${probeViolations.length} 件（rule: ${detectedRules}）${reachedSuffix}`,
    );
    console.log("     ↑ left-sidebar.tsx の正当な素通し（規則H）まで違反にし始めていないか確認すること。");
  }
}

if (blindSpotRegression) {
  // 🚨 既存の自己検査(RED)と同じ扱いにする。①が拾えなくなるのは退行であり、
  //    この検査の結果が信用できない状態なので、既存のゲート変数に載せて exit 1 にする。
  selfTestFailed = true;
}

// ── 2) 本番の判定 ─────────────────────────────────────────────────────
const { violations, scannedFiles } = findViolations(original);

console.log(`\n■ 判定`);
// candidateFiles: glob が列挙し `original` に載った本数（＝候補。まだ何も読んだ／当てたことにはならない）
const candidateFiles = Object.keys(original).length;
// scannedFiles: 上記のうち GUARD_FILE を除いて実際に規則 A/B/F を当てた本数（findViolations の実測値）
// totalChars: 上記の候補ファイル（GUARD_FILE 込み）から実際に読めた文字数の合計（loadSources の実測値）
// avgChars: totalChars ÷ scannedFiles（1 ファイルあたりの平均。AVG_CHARS_BASELINE のJSDoc参照）。
//   scannedFiles は上の globFileCount/REQUIRED_FILES/totalChars の各門を通過済みなので、
//   ここに来た時点で 0 になることは無い（念のため 0 除算だけ避ける）。
const avgChars = scannedFiles > 0 ? Math.floor(totalChars / scannedFiles) : 0;
console.log(
  `  対象: 候補 ${candidateFiles} 本（app/**, components/** ＋ ${GUARD_FILE}）/ 走査 ${scannedFiles} 本（読めた文字数 ${totalChars}・平均 ${avgChars} / 下限 ${AVG_CHARS_MIN_THRESHOLD}）`,
);
console.log(`        （${GUARD_FILE} は規則 A/B/F/G の対象外。規則 C/D/E/I で別に見る）`);
console.log(`  違反: ${violations.length} 件`);

// 🚨 走査数の基準線チェック（既存の「走査0なら落とす」門とは別物。0ではないが、
//    ほとんど見ていない場合を狙う。SCANNED_BASELINE のJSDoc参照）。
let scannedBaselineFailed = false;
if (scannedFiles < SCANNED_MIN_THRESHOLD) {
  scannedBaselineFailed = true;
  console.error(
    `\n🚨 走査が基準線から大きく減っています（基準線 ${SCANNED_BASELINE.count} 本・${SCANNED_BASELINE.at} 実測 / いま ${scannedFiles} 本）。`,
  );
  console.error("   次のどちらかです:");
  console.error("     ① ファイルを実際に減らした → SCANNED_BASELINE.count を更新してください");
  console.error("     ② 列挙（glob）が壊れた     → 直すまでこの検査の「違反 0 件」は意味を持ちません");
} else if (scannedFiles > SCANNED_STALE_THRESHOLD) {
  console.log(
    `\nℹ️ 走査が基準線から大きく増えています（基準線 ${SCANNED_BASELINE.count} 本・${SCANNED_BASELINE.at} 実測 / いま ${scannedFiles} 本）。SCANNED_BASELINE の更新を検討してください（落としてはいません）。`,
  );
}

// 🚨 平均文字数の基準線チェック（既存の「読めた文字数が0なら落とす」門とは別物。0ではないが、
//    ほとんど読めていない場合を狙う。AVG_CHARS_BASELINE のJSDoc参照）。
let avgCharsFailed = false;
if (avgChars < AVG_CHARS_MIN_THRESHOLD) {
  avgCharsFailed = true;
  console.error(
    `\n🚨 読めた量が基準線から大きく減っています（平均 ${avgChars} 文字 / 下限 ${AVG_CHARS_MIN_THRESHOLD}・${AVG_CHARS_BASELINE.at} 実測 ${AVG_CHARS_BASELINE.avg}）。`,
  );
  console.error("   🚨 「違反 0 件」より先に、読み込みか走査の範囲が壊れていることを疑ってください。");
  console.error("     ① ファイルの中身が実際に小さくなった → AVG_CHARS_BASELINE を更新してください");
  console.error("     ② 読み込みが壊れた（一部しか読めていない）→ 直すまでこの検査の結果は意味を持ちません");
}

if (violations.length > 0 && (selfTestFailed || greenTestFailed)) {
  // 🚨 自己検査・対照検査が失敗しているなら、これから並べる違反は「検査自身が壊れている結果」
  //    かもしれない。違反の一覧は消さない（本物の違反が同時に在ったときに見えなくなるため）が、
  //    その手前に必ずこの警告を出す（司令塔 2026-08-16②への回答）。
  console.error(
    "\n🚨 自己検査が失敗しています。下に並ぶ違反は、**検査自身が壊れている結果**かもしれません。",
  );
  console.error("   先に自己検査の失敗（置換 0 件・読み込み・列挙）を直してください。");
  console.error("   直すまで、この一覧の件数は意味を持ちません。");
}

if (violations.length > 0) {
  console.error("\n■ 内部識別子が画面のラベルへ届く経路");
  // 🚨 **拾った行の実物を添える**（司令塔の規律・2026-08-16）。
  //    説明だけだと、数え方の違いを読む人が確かめられない。
  //    実例: `error.message` と `error?.message` の差は、**行を見れば目に入るが、
  //    件数を見ていても入らない**。今日その差で数が 3 回ひっくり返った。
  //    🚨 行が取れないとき（ファイルが読めない・行番号 0）は、取れないと書く。**黙って空にしない。**
  const sourceOf = (file, line) => {
    if (!line || line < 1) return "（行番号なし。ファイル全体に対する指摘）";
    try {
      const text = readIndexed(resolve(root, file), "utf8").split("\n")[line - 1];
      return text === undefined ? "🚨 その行が読めなかった" : text.trim();
    } catch {
      return "🚨 ファイルが読めなかった";
    }
  };
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line}  ${v.detail}`);
    console.error(`        ${sourceOf(v.file, v.line)}`);
  }
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査（RED）に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}
if (greenTestFailed) {
  console.error("\n🚨 対照検査（GREEN）に失敗した。壊していない変更で誤検出している（過検出）。");
}
if (scannedBaselineFailed) {
  console.error("\n🚨 走査数が基準線を大きく下回った。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}
if (avgCharsFailed) {
  console.error("\n🚨 平均文字数が基準線を大きく下回った。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

process.exit(
  violations.length === 0 &&
    !selfTestFailed &&
    !greenTestFailed &&
    !scannedBaselineFailed &&
    !avgCharsFailed
    ? 0
    : 1,
);
