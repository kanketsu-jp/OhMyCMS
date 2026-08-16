#!/usr/bin/env node
/**
 * 検査が「違反を集めたのに、誰も読んでいない」形になっていないかを見る。
 *
 * ■ 由来（2026-08-16・実際に起きた）
 *   `check-surface-nesting.mjs` は違反を `hits` へ集めていたが、**`hits` を読む場所が
 *   どこにも無かった**（`push` の 1 箇所だけ）。
 *   ＝ **面の中にもう 1 枚面を描いても、その検査は落ちなかった。緑だったが、守っていなかった。**
 *   そこへ辿り着くのに囮を 5 通り試して外し、分かれ目になったのは
 *   「**いま許容されている実在の行から、許容規則を外す**」という**囮でない実験**だった。
 *   ＝ 🚨 **同じ種類の実験を繰り返しても分けられない。種類を変える。**
 *
 * ■ 何のために門へ載せるか（toast / saml / base2 / shell の 4 人が載せる側）
 *   **いまの 0 件を守るためではない。次に検査を足す人の手元で落とすため。**
 *   実際、`check-surface-nesting` は**報告経路を持たないまま入り、ずっと緑**だった。
 *   🚨 **止める物が無いうちに載せるのがいちばん安い**（違反が出てから載せると、
 *   載せる作業と直す作業が同時に来る）。前例: `check-saml-entry-needs-key`（入口ができた瞬間に落ちる）。
 *
 * ■ 🚨 この検査が **見ていない範囲**（toast の指摘。`checks-must-declare-blind-spots` の形）
 *   ・**配列以外の形は見ない**（数えて print するだけ / Map に溜める / 個数だけ比べる）
 *   ・🚨 **`process.exit(1)` が在るかどうかでは見ていない**。
 *     `check-surface-nesting` は**比率と床で `exit(1)` を持っていた**——
 *     ＝ **「exit(1) が在る」は「違反を報告する」の証拠にならない**
 *   ・**報告経路が在っても、条件が偽のまま**なら同じこと（例: `if (hits.length > 99)`）
 *   ・関数から `return` している配列は**読み手が在る**と数える（呼び出し側は追わない）
 *   ＝ **見ているのは「集めた配列に読み手が 1 つも無い」という、いちばん弱い形だけ。**
 *
 * ■ なぜ静的な「exit まで繋がるか」を諦めたか（2026-08-16 実測）
 *   「集めて console に出すだけで終了コードに繋がらない配列」を静的に探したら **22 件**挙がり、
 *   確かめた 2 件とも**関数から return しているローカル配列**だった（`conflicts` / `tags`）。
 *   ＝ 同一ファイル内の `.length` 条件では**関数境界を越えられない**。
 *   憲章 §1「**正解を違反と言う検査は使われなくなり、検査そのものが死ぬ**」に当たるので入れていない。
 *   → 「exit まで繋がるか」は、いまのところ**実物を起動して壊す**でしか確かめられていない。
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";
import { stripComments } from "./strip-comments.mjs";

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(SCRIPTS, "..", "..", "..");

/**
 * 集めた配列のうち、**読み手が 1 つも無い**ものを返す。
 *
 * 🚨 **コメントを先に落とす。** 落とさないと、**説明文に変数名を書いただけで見逃す**。
 *   実測（2026-08-16）: `check-surface-nesting` の報告のかたまりを丸ごと消しても **0 件**だった。
 *   原因は、私がその直しの経緯として書いた JSDoc に `hits` と**3 回書いていた**こと。
 *   ＝ 🚨 **経緯を丁寧に書いた検査ほど、この道具から見えなくなる**という向きだった。
 */
function findUnread(rawSrc, label) {
  // 🚨 `stripComments` だけでは足りない（**実測 2026-08-16**）。
  //
  //    【訂正】最初「**コメントの中のバッククォート**でそこから先が落ちない」と書いたが、**誤り**。
  //    toast が「stripComments は壊れていない」と測って報せてくれ、私が測り直した:
  //      🟢 見本 … `// \`hits\` と書いた` … **潰れる**（バッククォートは関係なかった）
  //      🚨 真因 … **正規表現リテラルの中に引用符が 1 つ在ると、そこから先を落とさなくなる**
  //        `const re = /[^"]*/;` の次の行のコメント … **残る**
  //        `const re = /[^\bfoo]*/;`（引用符なし）の次の行 … 潰れる
  //      ＝ 引用符を意識する走査が、**正規表現の中の引用符を「文字列の開始」と読む**
  //    実際 `check-surface-nesting` は 36 行目付近の `SURFACE_PATTERNS`（`[^"']*` を含む正規表現）
  //    以降、**コメントが 1 行も落ちていなかった**（潰れなくなる最初の行 = 52）。
  //    そのため経緯コメントの `hits` が数に入り、**報告のかたまりを丸ごと消しても 0 件**だった。
  //    ＝ 🚨 **経緯を丁寧に書いた検査ほど、この道具から見えなくなる**（向きは同じ。原因が違った）。
  //    → 行頭が `//` `*` `/*` の行も落とす（**変数名の言及をコメントから外す**）。
  //    🚨 この弱さは `stripComments` を使う**他の検査にも在る**（5 本が import している）。
  //       ここでは自分の足元だけ塞いだ。**直すなら strip-comments.mjs の側**。
  const src = stripComments(rawSrc)
    .split("\n")
    .map((line) => (/^\s*(?:\/\/|\*|\/\*)/.test(line) ? "" : line))
    .join("\n");
  const out = [];
  for (const m of src.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\];/gm)) {
    const name = m[1];
    const uses = [...src.matchAll(new RegExp(`\\b${name}\\b`, "g"))].length;
    const pushes = [...src.matchAll(new RegExp(`\\b${name}\\.push\\(`, "g"))].length;
    // 宣言 1 + push N。それ以外に一度も出てこなければ「誰も読んでいない」
    if (pushes > 0 && uses === 1 + pushes) out.push({ label, name, pushes });
  }
  return out;
}

// ── ① 自己検査（**固定の見本で**。いまのリポジトリの状態を土台にしない） ────────
// 🚨 saml の実測: 囮の土台に生の画面を使っていたら、**入口が足された瞬間に囮が壊れ**、
//    本当のメッセージではなく「自己検査に失敗」で落ちた（＝ **いちばん要るときに診断が別物になる**）。
//    → ここは**文字列の見本**を使う。リポジトリが変わっても囮は変わらない。
{
  const positive = findUnread('const zzHits = [];\nzzHits.push(1);\n', "(見本)");
  const negative = findUnread('const zzOk = [];\nzzOk.push(1);\nconsole.log(zzOk.length);\n', "(見本)");
  console.log(
    `🟢 対照（見本）: 読み手が無い配列を見つける ${positive.length === 1 ? "✅" : "🚨 ❌"}` +
      ` ／ 読み手が在る配列を誤検出しない ${negative.length === 0 ? "✅" : "🚨 ❌"}`,
  );
  if (positive.length !== 1 || negative.length !== 0) {
    console.error("🚨 この検査が動いていません。下の結果は信用できません");
    process.exit(1);
  }
}

// ── ② 🚨 実際に起きた 1 件で対照を取る（base2 の条件） ───────────────────────
// **植えた囮で見つかる**より強い。**実在の事故**を捕まえられることを毎回示す。
// 🚨 浅い clone では過去のコミットが無いことが在る。**そのときは「取れなかった」と書く**
//    （黙って飛ばすと、この行が在ることが「確かめた」の顔をする）。
{
  const HISTORIC = "bd62c51^:apps/studio/scripts/check-surface-nesting.mjs";
  let src = null;
  try {
    src = execFileSync("git", ["-C", REPO_ROOT, "show", HISTORIC], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    src = null;
  }
  if (src === null) {
    console.log(`⚠️ 対照（実在の事故）: ${HISTORIC} を取れませんでした（浅い clone 等）。**この対照は取れていません**`);
  } else {
    const hit = findUnread(src, HISTORIC);
    const ok = hit.length === 1 && hit[0].name === "hits";
    console.log(
      `🟢 対照（実在の事故 2026-08-16）: 直す前の check-surface-nesting から \`hits\` を見つける ${ok ? "✅" : "🚨 ❌"}`,
    );
    if (!ok) {
      console.error(
        `🚨 実際に起きた 1 件を捕まえられません（見つけた: ${JSON.stringify(hit)}）。` +
          "**この検査の 0 件は「見ていない 0」です**",
      );
      process.exit(1);
    }
  }
}

// ── ③ 走査 ──────────────────────────────────────────────────────────
// 🚨 **索引から採る**（今日決めた形。`checks-read-the-index-not-the-worktree`）。
//    作業ツリーを直に読むと、**他のペインが書いている途中の検査**まで見えて、
//    その人に触っていない人のコミットが止まる。**`git add` した瞬間に本人の手元で落ちる**のが正しい。
const files = trackedGlob("scripts/*.mjs", { cwd: resolve(SCRIPTS, "..") }).map((p) => p.replace(/^scripts\//, ""));
// 🚨 **走査 0 本で緑を作らない**（shell の条件）。本数を必ず出し、0 なら落とす。
if (files.length === 0) {
  console.error(`🚨 走査対象が 0 本でした（${SCRIPTS}）。**この 0 件は「見ていない 0」です**`);
  process.exit(1);
}
const found = [];
for (const f of files) found.push(...findUnread(readTracked(resolve(SCRIPTS, f)) ?? "", f));

console.log(`\n走査: ${files.length} 本`);
if (found.length === 0) {
  console.log("集めたが誰も読まない配列: 0 件（＝ 異常が無い 0。上の 2 つの対照で計器は動いています）");
} else {
  console.error(`\n🚨 集めたが誰も読まない配列: ${found.length} 件`);
  for (const x of found) console.error(`   ${x.label}  ${x.name}（push ${x.pushes} 箇所・読み手 0）`);
  console.error(
    "\n   その検査は、違反を集めていますが**どこからも読んでいません**。" +
      "\n   ＝ 違反を書いても落ちません（**緑だが、守っていない**）。" +
      "\n   直し方: 集めたものを報告して `process.exit(1)` へ繋ぐ。" +
      "\n   🚨 集める必要が無いなら、その配列ごと消してください。",
  );
  process.exit(1);
}
