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
 * 使い方: node scripts/check-raw-row-exports.mjs
 * 終了コード: 違反があれば 1。
 */
import { readFileSync } from "node:fs";

const TARGETS = [
  { file: "lib/files/service.ts", raw: "FileRow", pub: "PublicFileRow" },
  { file: "lib/labels/service.ts", raw: "LabelRow", pub: "PublicLabel" },
];

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
    const brace = source.indexOf("{", i);
    const between = source.slice(i + 1, brace);
    const colon = between.indexOf(":");
    out.push({
      name: m[1],
      line: source.slice(0, m.index).split("\n").length,
      returns: colon === -1 ? null : between.slice(colon + 1).trim(),
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
  const source = rawSource
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
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
      bad.push({ ...fn, why: "返り値の型を書いていない（推論だと生の行が漏れても気づけない）" });
      continue;
    }
    // 語として一致させる。`PublicFileRow` の中の `FileRow` を拾わないよう境界を見る。
    if (new RegExp(`(^|[^A-Za-z])${raw}([^A-Za-z]|$)`).test(fn.returns)) {
      bad.push({ ...fn, why: `外向きの返り値に生の行の型 ${raw} を使っている` });
    }
  }
  return bad;
}

// ── 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）──────────
console.log("■ 自己検査（実物をメモリ上で壊して、検出できることをその場で確かめる）");
{
  const src = readFileSync("lib/files/service.ts", "utf8");
  const base = violationsIn(src, "FileRow").length;
  console.log(`  ✅ ケース0: 実物 → 違反 ${base} 件`);

  const cases = [
    ["③ Promise<FileRow> と名乗る", 'export async function zzSelfTest(id: string): Promise<FileRow> {\n  return null as never;\n}\n\n'],
    ["④ 返り値の型を書かない", 'export async function zzSelfTest2(id: string) {\n  return null as never;\n}\n\n'],
  ];
  let ok = true;
  for (const [label, probe] of cases) {
    const broken = src.replace("export async function getFile(", probe + "export async function getFile(");
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
  if (!ok) {
    console.log("\n🚨 自己検査が通らなかった。この検査の結果は信用できない。");
    process.exit(2);
  }
}

// ── 判定 ────────────────────────────────────────────────────────────────
console.log("\n■ 判定");
let total = 0;
for (const t of TARGETS) {
  const src = readFileSync(t.file, "utf8");
  const bad = violationsIn(src, t.raw);
  const a = assertionsIn(src, t.pub);
  console.log(`  ${t.file}  外向き ${exportsOf(src).length} 本 / 違反 ${bad.length} 件`);
  console.log(`    型表明: as ${a.as.length} 箇所（行 ${a.as.join(", ") || "なし"}）/ 山括弧 ${a.angle.length} 箇所（行 ${a.angle.join(", ") || "なし"}）`);
  // 🚨 `as` は変換の関数の中の 1 箇所だけが正しい。山括弧は 0 が正しい。
  if (a.as.length > 1) {
    console.log(`    🚨 as ${t.pub} が ${a.as.length} 箇所ある。正しいのは変換の関数の中の 1 箇所だけ`);
    total += a.as.length - 1;
  }
  if (a.angle.length > 0) {
    console.log(`    🚨 山括弧の型表明 <${t.pub}> がある。印を素通りできてしまう`);
    total += a.angle.length;
  }
  for (const b of bad) {
    console.log(`    🚨 ${t.file}:${b.line}  ${b.name}()  ${b.why}`);
    console.log(`       → ${t.pub} を返し、変換の関数を通すこと`);
  }
  total += bad.length;
}
if (total > 0) {
  console.log(`\n🚨 違反 ${total} 件`);
  process.exit(1);
}
console.log("\n違反なし。");
