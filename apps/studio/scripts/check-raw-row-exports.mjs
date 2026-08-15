#!/usr/bin/env node
/**
 * **生の行の型（`FileRow` / `LabelRow`）を、外向きの関数から返していないか**を見る。
 *
 * 🚨 なぜ要るか（2026-08-15 実測）:
 * `PublicFileRow` / `PublicLabel` には印（brand）を付けてあり、
 * **`toPublicFile` / `toPublic` を通らないと作れない**。だが印が止めるのは
 * 「`Promise<PublicFileRow>` と名乗って生の行を返す」形**だけ**だった。
 * 実際に4通り試したところ、次の3つは**素通り**した:
 * ```
 * ① as unknown as PublicFileRow      素通り（ただし grep で見つかる）
 * ② <PublicFileRow>(row as unknown)  素通り（🚨 `as PublicFileRow` では見つからない）
 * ③ Promise<FileRow> と名乗る         素通り（印が関係しない）
 * ④ 返り値の型を書かない（推論）        素通り（同上）
 * ```
 * この検査は ②③④ を止める。①（`as`）は**意図して書く形**なので、
 * 数が増えていないかを一緒に数える（`toPublicFile` / `toPublic` の中の 1 箇所ずつが正しい）。
 *
 * 🚨 ② を探すとき `<PublicFileRow>` で grep しないこと。**`Promise<PublicFileRow>` まで拾う**。
 *    直前が英字でない `<` だけを見る（`[^A-Za-z]<PublicFileRow>`）。実測で確認済み。
 *
 * 🚨 **対象を2ファイルに絞っている。** 広げると他の担当のコミットを落とすため。
 *    増やすときは、増やした人が RED を測ってから増やすこと。
 *
 * ── もう1つ見るもの: **ルートがサービスを迂回していないか** ──
 * 上の守り（`toPublicFile` / `toPublic`）は **サービスの出口**にしか無い。
 * `app/api/**` が `directus_files` を直接読んで返せば、`compressed_key` はそのまま出る。
 * 🚨 2026-08-15 時点でそういう経路は **0 件**（コメントを除いて実測。
 *    🟢 対照(+) 同じ探し方で `lib` 側は 25 件拾える＝探し方は効いている）。
 *    **0 件のいまのうちに固定する。** 後から 1 件ずつ増えると、もう戻せない。
 * 逃げ道（＝承認リスト）: 同じ行に次の形で書く。**4 つ全部が要る**。
 * ```
 * // 直接読む理由: <なぜ> / 記録 2026-08-15 / 決める人: <誰> / 未決
 * ```
 * 🚨 **「承認」は多くの場合「いま在ることを記録した」だけで、「これでよい」ではない。**
 *    **でも緑が続くと、全員がそれを「解決済み」として扱い始める**（司令塔・2026-08-15 規律13）。
 *    だから **未決のものは毎回出す**。黙って緑にしない。
 *
 * 使い方: node scripts/check-raw-row-exports.mjs
 * 終了コード: 違反があれば 1。
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TARGETS = [
  { file: "lib/files/service.ts", raw: "FileRow", pub: "PublicFileRow" },
  { file: "lib/labels/service.ts", raw: "LabelRow", pub: "PublicLabel" },
];

// 🚨 囮より前に置く（囮から呼ぶので、後ろだと初期化前になる）
const GUARDED_TABLES = ["directus_files", "ohmycms_labels", "ohmycms_label_assignments"];

function withoutComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/**
 * 外向きの関数の宣言を拾い、返り値の型を取り出す。
 * 返り値の型を**書いていない**場合は null を返す（それ自体が違反）。
 */
function exportsOf(source) {
  const out = [];
  const re = /^export\s+(?:async\s+)?function\s+(\w+)\s*\(/gm;
  let m;
  while ((m = re.exec(source))) {
    // 宣言の丸括弧を数えて、閉じた直後から `{` までを返り値の型とみなす
    let i = re.lastIndex - 1;
    let depth = 0;
    for (; i < source.length; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    // 🚨 **最初の `{` を本体の始まりだと決めつけない**（2026-08-16 実測で見つけた穴）。
    //    以前は `source.indexOf("{", i)` で切っていたので、
    //      `): Promise<{ row: FileRow }> {`
    //    のように**返り値の型の中に `{` がある**と、そこで切れて `Promise<` になり、
    //    🚨 **中に書かれた生の行の型を 1 件も拾えなかった**（囮で実測。🟢 対照 `Promise<FileRow>` は拾えた）。
    //    見つけ方: **この穴は「拾った例」を出力に足した瞬間に見えた**
    //    （`compressImage → Promise<` と表示された）。**数だけ出していた間は見えなかった。**
    const after = source.slice(i + 1);
    const colonHead = /^\s*:/.exec(after);
    let returns = null;
    if (colonHead) {
      let angle = 0, brace = 0, paren = 0, bracket = 0, prev = ":";
      let j = colonHead[0].length;
      for (; j < after.length; j++) {
        const ch = after[j];
        if (ch === "<") angle++;
        else if (ch === ">") angle = Math.max(0, angle - 1);
        else if (ch === "(") paren++;
        else if (ch === ")") paren--;
        else if (ch === "[") bracket++;
        else if (ch === "]") bracket--;
        else if (ch === "}") brace--;
        else if (ch === "{") {
          // 本体の `{` は「型が閉じきった直後」に来る。型を開く `{` は `:` `|` `&` `<` `,` の後に来る。
          if (angle === 0 && brace === 0 && paren === 0 && bracket === 0 && /[>\]) }\w]/.test(prev)) break;
          brace++;
        }
        if (!/\s/.test(ch)) prev = ch;
      }
      returns = after.slice(colonHead[0].length, j).trim();
    }
    out.push({
      name: m[1],
      line: source.slice(0, m.index).split("\n").length,
      returns,
    });
  }
  return out;
}

/**
 * 型表明での抜け道。
 * - `as PublicFileRow` … 意図した 1 箇所だけが正しい（変換の関数の中）
 * - `<PublicFileRow>x`  … 🚨 **`Promise<PublicFileRow>` と紛れる**ので、直前が英字でない `<` に限る
 */
function assertionsIn(rawSource, pub) {
  // 🚨 **コメントを先に外す。** 外さないと、この検査の由来を説明した文
  //    （`as PublicFileRow` と書け、という説明）自体を違反として数える。
  //    実際に一度そうなった（2026-08-15）。**行数は変えないよう空白で潰す。**
  // 🚨 **写しを書かない。** 同じ処理を2箇所に書くと、片方を壊しても囮が落ちない
  //    （2026-08-16 実測: withoutComments を殺しても 1 本も ❌ にならなかった）。
  const source = withoutComments(rawSource);
  const as = [...source.matchAll(new RegExp(`as\\s+${pub}\\b`, "g"))].map((m) => m.index);
  const angle = [...source.matchAll(new RegExp(`[^A-Za-z]<${pub}>`, "g"))].map((m) => m.index);
  const at = (i) => source.slice(0, i).split("\n").length;
  return { as: as.map(at), angle: angle.map(at) };
}

/** 生の行の型を、外向きの返り値として使っているか。 */
function violationsIn(source, raw) {
  const bad = [];
  for (const fn of exportsOf(source)) {
    if (fn.returns === null) {
      bad.push({ ...fn, rule: "R1", why: "返り値の型を書いていない（推論だと生の行が漏れても気づけない）" });
      continue;
    }
    // 語として一致させる。`PublicFileRow` の中の `FileRow` を拾わないよう境界を見る。
    if (new RegExp(`(^|[^A-Za-z])${raw}([^A-Za-z]|$)`).test(fn.returns)) {
      bad.push({ ...fn, rule: "R2", why: `外向きの返り値に生の行の型 ${raw} を使っている` });
    }
  }
  return bad;
}

// ── 🚨 走る場所の確認（cwd が違うと、生のスタックが出て読み違える）──────────
//    2026-08-15、私自身がリポジトリ直下から走らせて `node:fs` のスタックを見て、
//    **「違反が出た」と読みかけた**。**何が起きたかを言葉にする。**
for (const t of TARGETS) {
  if (!existsSync(t.file)) {
    console.error(`🚨 [R7] ${t.file} が見つかりません。`);
    console.error(`   この検査は **apps/studio を cwd にして**走らせてください。`);
    console.error(`   いまの cwd: ${process.cwd()}`);
    console.error(`   例: cd apps/studio && node scripts/check-raw-row-exports.mjs`);
    process.exit(2);
  }
}

// ── 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）──────────
// 🚨 **出どころは人に書かせず、計器に出させる**（司令塔・2026-08-15）。
//    貼り付ける人が毎回書く形にすると、忙しいときに落ちる。
{
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", ...TARGETS.map((t) => t.file), "app"],
    { encoding: "utf8" }).split("\n").filter(Boolean).length;
  console.log(
    `採取: HEAD ${head} / cwd ${process.cwd()} / ` +
      `この検査が見る範囲の未コミット変更 ${dirty} 件`,
  );
  console.log(`  見る範囲: ${TARGETS.map((t) => t.file).join(", ")} と app/ 配下（git ls-files）`);
}

/**
 * 壊す置換の**当たった件数**を数える。
 *
 * 🚨 **「変わったかどうか」では足りない**（司令臺経由・base2 の実測・2026-08-16）。
 *    base2 は `<LeftSidebar` を狙って **3 件**（import / Provider / JSX）当て、
 *    **壊したつもりで別の場所を壊し、「検出できた」と読みかけた**。
 *    `String.replace(文字列, …)` は **最初の 1 件しか置き換えない**ので、
 *    目印が 2 箇所に在ると**意図と違う場所へ差し込む**（例: コメントの中に差し込むと
 *    `withoutComments` に消され、**壊れていないのに壊したつもり**になる）。
 * 🚨 **なお、この検査は共有ツリーへ 1 バイトも書きません**（壊すのはメモリ上の文字列だけ）。
 *    「切った台の中で壊す」の、いちばん軽い形。
 */
function 目印の件数(source, anchor) {
  return source.split(anchor).length - 1;
}

console.log("■ 自己検査（実物をメモリ上で壊して、検出できることをその場で確かめる）");
{
  const src = readFileSync("lib/files/service.ts", "utf8");
  const base = violationsIn(src, "FileRow").length;
  console.log(`  ✅ ケース0: 実物 → 違反 ${base} 件`);

  const cases = [
    ["③ Promise<FileRow> と名乗る", 'export async function zzSelfTest(id: string): Promise<FileRow> {\n  return null as never;\n}\n\n'],
    ["④ 返り値の型を書かない", 'export async function zzSelfTest2(id: string) {\n  return null as never;\n}\n\n'],
    // 🚨 **⑤ は、この検査が 2026-08-16 まで見逃していた形**（実測で確認した穴）。
    //    返り値の型の中に `{` があると、以前は**そこで型を切っていた**ので `Promise<` になり、
    //    中の `FileRow` を 1 件も拾えなかった。**囮に残す**——直したことを忘れて戻さないため。
    //    🚨 見つけたきっかけは「拾った例」を出力に足したこと（`compressImage → Promise<` が見えた）。
    ["⑤ 🚨 返り値の型の中に { がある（Promise<{ row: FileRow }>）",
      'export async function zzSelfTest4(id: string): Promise<{ row: FileRow }> {\n  return null as never;\n}\n\n'],
  ];
  let ok = true;
  const ANCHOR = "export async function getFile(";
  // 🚨 **目印が 1 箇所であることを、囮を回す前に確かめる。**
  //    2 箇所以上あると、`replace` は最初の 1 件へ差し込むので、
  //    **どこを壊したのかが分からないまま「検出できた」と読む**ことになる。
  {
    const n = 目印の件数(src, ANCHOR);
    console.log(`  ${n === 1 ? "✅" : "❌"} 目印「${ANCHOR}」の件数: ${n}（1 でないと、どこを壊したか分からない）`);
    if (n !== 1) ok = false;
  }
  for (const [label, probe] of cases) {
    const broken = src.replace(ANCHOR, probe + ANCHOR);
    if (broken === src) { console.log(`  ❌ ${label}: 差し込めなかった（この自己検査は無効）`); ok = false; continue; }
    const n = violationsIn(broken, "FileRow").length;
    console.log(`  ${n > base ? "✅" : "❌"} ケース: ${label} → 違反 ${n} 件（実物は ${base} 件）`);
    if (n <= base) ok = false;
  }
  // 🚨 誤検知も見る。正しい形を足して、増えないこと。
  const good = src.replace(
    "export async function getFile(",
    'export async function zzSelfTest3(id: string): Promise<PublicFileRow> {\n  return null as never;\n}\n\n' + "export async function getFile(",
  );
  const n3 = violationsIn(good, "FileRow").length;
  console.log(`  ${n3 === base ? "✅" : "❌"} ケース: 正しい形（Promise<PublicFileRow>）→ 違反 ${n3} 件（増えないのが正しい）`);
  if (n3 !== base) ok = false;

  // 🚨 **囮は規則ごとに要る。** ここまでは R1/R2（`violationsIn`）しか見ていなかった。
  //    「検査単位で落ちるか」では、**写しの囮・見ていない囮**を見つけられない
  //    （司令塔・2026-08-16。他の担当が実測: 別の囮が落としてくれるので気づけない）。
  //    🚨 **どれも本物の関数を呼ぶ**（写しを書かない）。
  {
    const src = readFileSync("lib/files/service.ts", "utf8");
    const base = assertionsIn(src, "PublicFileRow");
    const cases = [
      ["R3: as を1つ増やす", src.replace("export async function getFile(",
        "const zz = {} as unknown as PublicFileRow;\n\nexport async function getFile("),
       (a) => a.as.length > base.as.length],
      ["R4: 山括弧の表明を足す", src.replace("export async function getFile(",
        "const zz = <PublicFileRow>({} as unknown);\n\nexport async function getFile("),
       (a) => a.angle.length > base.angle.length],
      // 🚨 **期待を「base と同じ」にしない。** base も同じ関数を通るので、
      //    コメント除去が壊れると **base も一緒に狂い、差が出ない**（2026-08-16 実測）。
      //    **絶対値**（コメントだけの入力なら 0 件）で見る。
      ["🚨 誤検知しないこと: コメントに as を書く（絶対値で見る）",
        "// 説明: as PublicFileRow と書くと [R3] で数える\nconst zz = 1;",
       (a) => a.as.length === 0],
    ];
    for (const [label, broken, want] of cases) {
      if (broken === src) { console.log(`  ❌ ${label}: 差し込めなかった（この囮は無効）`); ok = false; continue; }
      const got = want(assertionsIn(broken, "PublicFileRow"));
      console.log(`  ${got ? "✅" : "❌"} ${label}`);
      if (!got) ok = false;
    }
  }


  // 🚨 R5 / R6 の囮。**本物の `directTableUsesIn` を呼ぶ**（写しを書かない）。
  {
    const cases = [
      ["R5: ルートが直接読む",
        'const zz = db("directus_files");',
        (u) => u.length === 1 && !u[0].allowed && !u[0].malformed],
      ["R6: 承認の形が足りない",
        'const zz = db("directus_files"); // 直接読む理由: 件数を数えるため',
        (u) => u.length === 1 && u[0].malformed === true],
      ["🟢 4項目そろえば通る",
        'const zz = db("directus_files"); // 直接読む理由: 件数 / 記録 2026-08-16 / 決める人: 司令塔 / 未決',
        (u) => u.length === 1 && u[0].allowed === true && u[0].state === "未決"],
      ["🚨 誤検知しないこと: コメントで名前に触れるだけ",
        '// directus_files はサービス経由で扱う',
        (u) => u.length === 0],
    ];
    for (const [label, src, want] of cases) {
      const got = want(directTableUsesIn(src));
      console.log(`  ${got ? "✅" : "❌"} ${label}`);
      if (!got) ok = false;
    }
  }

  if (!ok) {
    console.log("\n🚨 自己検査が通らなかった。この検査の結果は信用できない。");
    process.exit(2);
  }
}

// ── 判定 ────────────────────────────────────────────────────────────────
console.log("\n■ 判定");
// 🚨 **内訳と合計を突き合わせる。** 数だけ増えて説明が出ない違反があると、
//    読む人は「1 件の説明」を見て「2 件」と書かれた合計を信じることになる
//    （2026-08-15 実測: R3 が 3 箇所で合計 +2、説明は 1 行だった）。
let emitted = 0;
const violation = (...lines) => {
  emitted += 1;
  for (const l of lines) console.log(l);
};
let total = 0;
for (const t of TARGETS) {
  const src = readFileSync(t.file, "utf8");
  const bad = violationsIn(src, t.raw);
  const a = assertionsIn(src, t.pub);
  const exportCount = exportsOf(src).length;
  console.log(`  ${t.file}  外向き ${exportCount} 本 / 違反 ${bad.length} 件`);
  // 🚨 **数だけを出さない。拾った行の実物を添える**（司令塔・2026-08-16）。
  //    由来: `error.message` の数え違い。**`?.` が入った書き方**を見落としたのに、
  //    数（12 と 10）が偶然そろってしまい、3 回ひっくり返した。
  //    🚨 **行を見れば `?.` は目に入る。数を見ていても入らない。**
  //    ここは「拾えている」の証拠なので、違反が 0 件でも必ず出す。
  for (const e of exportsOf(src).slice(0, 3)) {
    console.log(`      拾った例 ${t.file}:${e.line} ${e.name} → ${e.returns ?? "(返り値の型を書いていない)"}`);
  }
  // 🚨 **規則 G: 対象を1件も拾えていないのに緑、を防ぐ。**
  //    解析が壊れて 0 本になったとき、この検査は「違反 0 件」と言って通ってしまう。
  //    **見ていない 0 と、異常が無い 0 は別**（司令塔・2026-08-15）。
  if (exportCount === 0) {
    violation(`    🚨 [R0] 外向きの関数を 1 本も拾えていない。解析が壊れている疑い`);
    total += 1;
  }
  console.log(`    型表明: as ${a.as.length} 箇所（行 ${a.as.join(", ") || "なし"}）/ 山括弧 ${a.angle.length} 箇所（行 ${a.angle.join(", ") || "なし"}）`);
  // 🚨 `as` は変換の関数の中の 1 箇所だけが正しい。山括弧は 0 が正しい。
  if (a.as.length > 1) {
    // 🚨 **1 件につき 1 行。** 合計だけ増やして説明を 1 行にすると、内訳が合わない。
    for (const line of a.as.slice(1)) {
      violation(`    🚨 [R3] ${t.file}:${line} 余分な as ${t.pub}。正しいのは変換の関数の中の 1 箇所だけ`);
      total += 1;
    }
  }
  if (a.angle.length > 0) {
    for (const line of a.angle) {
      violation(`    🚨 [R4] ${t.file}:${line} 山括弧の型表明 <${t.pub}>。印を素通りできてしまう`);
      total += 1;
    }
  }
  for (const b of bad) {
    violation(`    🚨 [${b.rule}] ${t.file}:${b.line}  ${b.name}()  ${b.why}`,
              `       → ${t.pub} を返し、変換の関数を通すこと`);
  }
  total += bad.length;
}
// ── ルートがサービスを迂回していないか ────────────────────────────────

/** コメントを外す（行数は保つ）。この検査自身の説明文を違反として数えないため。 */

/**
 * 🚨 **中身を受け取る形にしてある（パスを受け取らない）。**
 *    パスを取ってディスクを読む形だと、**囮が判定を書き写すしかなくなる**——
 *    写しは、本物が壊れても動くので、囮として役に立たない
 *    （司令塔・2026-08-16。他の担当が実測で踏んだ形）。
 *    🚨 **囮が写しになったら、本物の形を直す合図**。
 */
function directTableUsesIn(raw) {
  const lines = raw.split("\n");
  const clean = withoutComments(raw).split("\n");
  const found = [];
  clean.forEach((line, i) => {
    for (const t of GUARDED_TABLES) {
      if (!line.includes(`"${t}"`) && !line.includes(`'${t}'`)) continue;
      // 逃げ道: 同じ行に承認が書いてあれば通す（**文字列は元の行から探す**。コメントを外した側には無い）
      const raw = lines[i];
      const m = /直接読む理由:\s*([^/]+?)\s*\/\s*記録\s*(\d{4}-\d{2}-\d{2})\s*\/\s*決める人:\s*([^/]+?)\s*\/\s*(未決|決定済み)/.exec(raw);
      if (m) {
        found.push({ line: i + 1, table: t, allowed: true, why: m[1], at: m[2], who: m[3], state: m[4] });
      } else if (/直接読む理由:/.test(raw)) {
        // 🚨 **形の足りない承認は通さない。** 理由だけ書いて黙らせられると、
        //    「誰が・いつ・何を決めるのか」が失われる（規律13）。
        found.push({ line: i + 1, table: t, allowed: false, malformed: true });
      } else {
        found.push({ line: i + 1, table: t, allowed: false });
      }
    }
  });
  return found;
}

{
  const routes = execFileSync("git", ["ls-files", "app"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  let bad = 0;
  let allowed = 0;
  let undecided = 0;
  for (const f of routes) {
    for (const u of directTableUsesIn(readFileSync(f, "utf8"))) {
      if (u.allowed) {
        allowed++;
        // 🚨 **未決のものは毎回出す。** 黙って緑が続くと、決める人が居ることを誰も思い出さない。
        const mark = u.state === "未決" ? "🟡 未決" : "✅ 決定済み";
        console.log(`    ${mark} ${f}:${u.line} ${u.table}`);
        console.log(`       理由: ${u.why} ／ 記録 ${u.at} ／ 決める人: ${u.who}`);
        if (u.state === "未決") undecided++;
      } else if (u.malformed) {
        bad++;
        violation(`    🚨 [R6] ${f}:${u.line} 承認の形が足りない`,
                  `       → 「直接読む理由: <なぜ> / 記録 YYYY-MM-DD / 決める人: <誰> / 未決」の 4 つを書く`);
      } else {
        bad++;
        violation(`    🚨 [R5] ${f}:${u.line} ${u.table} をルートが直接読んでいる`,
                  `       → lib のサービス経由にすること（compressed_key / system_key が素通りする）`,
                  `       → どうしても要るなら同じ行に「直接読む理由: …」と書く`);
      }
    }
  }
  console.log(`  app/ 配下 ${routes.length} ファイル / 直接読み ${bad} 件（承認 ${allowed} 件・うち🟡未決 ${undecided} 件）`);
  // 🚨 **「直接読み 0 件」の顔を割る**（司令塔・2026-08-16）。
  //    0 には ①無い 0 ②見ていない 0 ③落ちた 0 の 3 つがあり、見た目が同じ。
  //    そこで「**この検査が実際に読んだ生の行**」を 1〜3 本出す。
  //    🚨 見張っている表そのものではなく、**同じ探し方に当たった `db(` の行**を出す
  //    ——**表が 0 件でも、探し方が動いていれば必ず何か出る**。何も出ないなら計器が壊れている。
  const 走査例 = [];
  for (const f of routes) {
    for (const [i, line] of withoutComments(readFileSync(f, "utf8")).split("\n").entries()) {
      const m = /\b(?:db|trx|knex)\(\s*["'`]([^"'`]+)/.exec(line);
      if (m) 走査例.push(`      読んだ例 ${f}:${i + 1} 表 "${m[1]}"`);
      if (走査例.length >= 3) break;
    }
    if (走査例.length >= 3) break;
  }
  for (const l of 走査例) console.log(l);
  if (走査例.length === 0) {
    console.log("      🚨 表を触っている行を 1 本も読めていません（見張り対象が 0 件なのではなく、探し方が当たっていない疑い）");
  }
  // 🚨 規則 G（上と同じ）。`git ls-files` が空を返したら「違反なし」ではなく「見ていない」。
  if (routes.length === 0) {
    violation(`    🚨 [R0] app/ 配下のファイルを 1 件も拾えていない。走っていないのと同じ`);
    total += 1;
  }
  total += bad;
}

// 🚨 **説明の数と合計が合わなければ落とす。** 合わないときは、
//    **数えたのに説明していない違反**か、**説明したのに数えていない違反**がある。
//    どちらも「読む人が内訳を信じられない」形。
if (emitted !== total) {
  console.log(`\n🚨 [R8] 内訳が合いません: 説明した違反 ${emitted} 件 / 数えた違反 ${total} 件`);
  console.log(`   この検査自身の不具合です。数だけ増えて説明が出ていないか、その逆です。`);
  process.exit(2);
}
if (total > 0) {
  console.log(`\n🚨 違反 ${total} 件（説明 ${emitted} 件と一致）`);
  process.exit(1);
}
console.log("\n違反なし。");
