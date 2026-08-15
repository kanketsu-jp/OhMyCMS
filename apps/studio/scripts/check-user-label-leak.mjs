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

/**
 * 違反を返す。sources は { ファイル名: 中身 } の写し（壊した版を渡せるようにするため）。
 *
 * 見るのは5つ:
 *   A. `userLabel={...}` に生のメールが直接入っていないか
 *   B. `userLabel={...}` が必ず `displayUserLabel(` を通っているか
 *   C. 見張り役（user-label.ts）が LOCAL_ADMIN_EMAIL と実際に**比較**しているか
 *   D. `displayUserLabel` の本体が `isSamlPlaceholderEmail(` を呼んでいるか
 *      （SAML の合成メール `<uuid>@saml.invalid` を隠せているか）
 *   E. `visibleHuman` の本体が `isSamlPlaceholderEmail(` を呼んで**いない**か
 *      （呼んでいたら「やりすぎ」。SAML の利用者は displayUserLabel だけでなく
 *      displayUserPicture / displayUserAvatarEmoji / displayUserName からも
 *      丸ごと消えてしまう。弾きは displayUserLabel だけに置く設計）
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
// 壊し方は**4通り**。1通りだけだと「たまたま落ちた」が混ざる。

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

  console.log(`  ${detected ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${violations.length} 件`);
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
    name: "対照: displayUserLabel の説明文に isSamlPlaceholderEmail( と書いても検出しない",
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
