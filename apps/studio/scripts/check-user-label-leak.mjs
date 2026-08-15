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
 * 🚨 **この検査は、自分が本当に検出できることを毎回その場で証明する。**
 *    緑になっただけでは「異常が無い」のか「見ていない」のか区別が付かないため、
 *    実物を複数通りに壊して**両方で赤くなること**を確かめてから、本番の判定を出す。
 *    さらに**壊した置換の件数を必ず表示する**。0 件のまま「赤くならなかった」を
 *    見逃すと、検査が効いていないのに合格に見える（BSD sed で実際に起きた事故）。
 *
 * 🚨 **この検査で分からないこと**（緑でも保証していない範囲。書いておかないと過信される）:
 *   - `userLabel={someVariable}` の `someVariable` は、**同じファイルに**
 *     `const/let/var someVariable = ...` があれば規則Hで右辺まで追う。無ければ
 *     （別ファイル・関数引数由来など）これまでどおり追わない。
 *   - `UserMenu` 以外の場所へメールを描く新しい経路は見ていない
 *   - object literal の入れ子（`{...{ userLabel: { nested: X } }}` のような二重の `{`）までは追わない
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
 * `userLabel` に渡された式1つを判定する。呼び出し元は3通り:
 *   - A/B: `userLabel={式}`（JSX 属性として直接）
 *   - F  : `userLabel: 式`（object literal。spread や変数化で隠れている）
 * どちらも判定のロジックは同じなので共通化する。ここで付ける rule ラベルだけが違う。
 *
 *   1. 式に生のメール（`.email`）が直接入っていたら違反（emailRule）
 *   2. 式が識別子1つだけ（素通し）なら、**同じファイル**に
 *      `const/let/var <識別子> = …;` があるか探す。
 *        - 見つかれば、その右辺へ同じ判定（1・3）を当てる（passThroughRule = H）。
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
    // 🚨 同じファイルに定義が見つかったときだけ規則Hを当てる。見つからなければ、
    //    呼び出し元が別ファイル（例: 関数の引数として渡ってくる）にある正当な素通しとして扱う
    //    （そう扱っていることが分かるよう、ここにコメントを残す。値を作っているのは呼び出し元で、
    //    そこで A/B/F のいずれかが見ている）。
    if (declMatch) {
      const rhs = declMatch[1].trim();
      if (/\.email\b/.test(rhs)) {
        violations.push({
          file,
          line,
          rule: passThroughRule,
          detail: `素通しの識別子 '${expression}' の定義に生のメールが直接入っている`,
        });
      } else if (!rhs.includes("displayUserLabel(")) {
        violations.push({
          file,
          line,
          rule: passThroughRule,
          detail: `素通しの識別子 '${expression}' の定義が displayUserLabel() を通していない`,
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
 *   H. `userLabel={識別子}` の素通しを、同じファイルに `const 識別子 = …` があれば
 *      その右辺まで追っているか（無ければこれまでどおり素通しとして扱う）
 */
function findViolations(sources) {
  const violations = [];

  for (const [file, source] of Object.entries(sources)) {
    if (file === GUARD_FILE) continue;

    // A/B: `userLabel={...}`（JSX 属性として直接渡している式）
    for (const m of source.matchAll(/userLabel=\{([^}]*)\}/g)) {
      const expression = m[1].trim();
      const line = source.slice(0, m.index).split("\n").length;
      checkLabelExpression(violations, file, source, expression, line, {
        emailRule: "A",
        missingRule: "B",
        passThroughRule: "H",
      });
    }

    // F: object literal の `userLabel:`（spread や変数化で隠れている式）
    for (const { expression, line } of findObjectLiteralUserLabelExpressions(source)) {
      checkLabelExpression(violations, file, source, expression, line, {
        emailRule: "F",
        missingRule: "F",
        passThroughRule: "H",
      });
    }
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
  }

  // G: UserMenu の呼び出し側から見える形で渡っているか
  violations.push(...checkUserMenuVisibility(sources));

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
// 壊し方は**7通り**。1通りだけだと「たまたま落ちた」が混ざる。

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
      const needle = "userLabel={displayUserLabel(me.ok ? me.data : null)}";
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
      const needle = "userLabel={displayUserLabel(me.ok ? me.data : null)}";
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
        "<UserMenu\n            userName={userName}\n            userLabel={userLabel}\n" +
        "            userPicture={userPicture}\n            userAvatarEmoji={userAvatarEmoji}\n          />";
      const count = countOccurrences(before, needle);
      const after = before.replace(needle, "<UserMenu {...userMenuProps} />");
      return { sources: { ...sources, [file]: after }, count };
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
  const detected = count > 0 && violations.length > 0;

  const detectedRules = [...new Set(violations.map((v) => v.rule))].join(",") || "-";
  console.log(
    `  ${detected ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${violations.length} 件（rule: ${detectedRules}）`,
  );
  if (count === 0) {
    console.error("     ↑ 置換が 0 件。壊せていないので、赤くならないのは当然。検査の書き方が古い。");
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
        "<UserMenu\n            userName={userName}\n            userLabel={userLabel}\n" +
        "            userPicture={userPicture}\n            userAvatarEmoji={userAvatarEmoji}\n          />";
      const replacement =
        "<UserMenu\n            userName={userName}\n            userLabel={userLabel}\n" +
        "            userPicture={userPicture}\n            userAvatarEmoji={userAvatarEmoji}\n" +
        '            {...{ "data-zz": 1 }}\n          />';
      const count = countOccurrences(before, needle);
      const after = before.replace(needle, replacement);
      return { sources: { ...sources, [file]: after }, count };
    },
  },
];

let greenTestFailed = false;

console.log("\n■ 対照検査（壊していない変更で誤検出しないことを確かめる）");
for (const test of greenTests) {
  const { sources, count } = test.apply(original);
  const violations = findViolations(sources);
  const clean = count > 0 && violations.length === 0;

  console.log(`  ${clean ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${violations.length} 件`);
  if (count === 0) {
    console.error("     ↑ 置換が 0 件。変更が当たっていないので、検出 0 件は何も確かめていない。");
  }
  if (!clean && violations.length > 0) {
    for (const v of violations) {
      console.error(`     誤検出 [${v.rule}] ${v.file}:${v.line}  ${v.detail}`);
    }
  }

  if (!clean) greenTestFailed = true;
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
  console.error("\n🚨 自己検査（RED）に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}
if (greenTestFailed) {
  console.error("\n🚨 対照検査（GREEN）に失敗した。壊していない変更で誤検出している（過検出）。");
}

process.exit(violations.length === 0 && !selfTestFailed && !greenTestFailed ? 0 : 1);
