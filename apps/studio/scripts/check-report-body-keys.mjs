/**
 * 不具合報告で**画面からサーバへ送る鍵**が、サーバが読む鍵の範囲に収まっているかを見る。
 *
 * 由来（規律12・2026-08-15）: `bug-report-composer.tsx` のコメントは
 * > 🚨 **自動で集めるものを増やさない。** Cookie・トークン・設定値は送らない。
 * と宣言していたが、**それを守っているコードを名指しできなかった**。
 * 次に触る人が `body` に 1 行足せば、何も言わずに通る状態だった。
 *
 * 🚨 **サーバ側は既に強い**（`lib/reports/service.ts` の `validate()` が
 *    `input.title` / `input.body` / `input.page_path` / `input.expected` /
 *    `input.viewport` / `input.locale` **だけ**を読み、残りは保存されない）。
 *    この検査が足すのは **「線を越えて出ていくもの」の側**の歯止め。
 *    保存されなくても、**送った時点でログ・プロキシ・エラー報告には乗る**。
 *
 * 見ているのは「不具合報告の送信」1 経路だけ。**他のフォームは見ていない。**
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { stripComments } from "./strip-comments.mjs";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const COMPOSER = join(REPO_ROOT, "apps/studio/components/admin/bug-report-composer.tsx");
const SERVICE = join(REPO_ROOT, "apps/studio/lib/reports/service.ts");

// 🚨 **採取した HEAD と作業ツリーの状態を出す**（司令塔 2026-08-15）。
//    共有ツリーでは HEAD が数分で動く（実測: 同じ夜に 9df2aca → cb3a5ba → 3d49196）。
//    出力だけを渡された人が「いつのツリーの話か」を知れるようにする。
// 🚨 見ていない範囲: 数えるのは **この 2 ファイルの未コミット変更だけ**。
{
  const rel = ["apps/studio/components/admin/bug-report-composer.tsx", "apps/studio/lib/reports/service.ts"];
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", ...rel],
    { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter(Boolean).length;
  console.log(`採取: HEAD ${head} / この検査が見る 2 ファイルの未コミット変更 ${dirty} 件`);
  console.log(`  見る範囲: ${rel.join(" / ")}`);
}

function readOrExplain(path, why) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    console.error(`🚨 ${path} を読めませんでした（${why}）。`);
    console.error("   **この検査は現在ブラインドです**——鍵が増えても検出できません。");
    console.error(`   （元のエラー: ${error?.code ?? error?.message ?? error}）`);
    process.exit(1);
  }
}

function balanced(source, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return null;
}

const problems = [];

// ── 画面が送る鍵（JSON.stringify({...}) の最上位） ──────────────────
const composerRaw = readOrExplain(COMPOSER, "報告フォーム");
// 🚨 **コメントを実コードとして読まない。**
//    この検査自身が踏んだ（2026-08-15）: 冒頭の申し送りに `JSON.stringify({…})` と書いた瞬間、
//    そのコメントの中括弧を送信 body と誤認し、**画面が送る鍵 0 件**になって落ちた。
//    ——「コメントが在ることは守られていることではない」の裏で、
//      **コメントが在ることが検査を壊す**こともある。
// 🚨 **コメントの潰し方を、この検査だけ独自に持たない**（2026-08-15）。
//    もとは正規表現 2 本で潰していたが、**文字列の中の `/* */` まで潰す**うえ、
//    同じ仕事の実装が repo に 2 つある状態になる（＝片方だけ直る形）。
//    `strip-comments.mjs` に寄せた。**寄せた後も鍵 6 件が変わらないことを実測済み。**
const composer = stripComments(composerRaw);
const at = composer.indexOf("JSON.stringify({");
if (at < 0) {
  problems.push(
    `解析できません: ${COMPOSER} に JSON.stringify({...}) がありません` +
      "（送り方が変わったなら、この検査も一緒に直してください）",
  );
}
const bodySrc = at >= 0 ? balanced(composer, composer.indexOf("{", at)) : null;
if (at >= 0 && !bodySrc) problems.push("解析できません: JSON.stringify({ の括弧が閉じていません");

/**
 * 送信 body の**最上位の鍵**を取り出す。
 * 🚨 **囮も本番もこの関数を通す。** 囮の中に同じ処理を書き写すと、
 *    本番を壊しても囮は ✅ のままになる（司令塔 2026-08-15）。
 *    切り出す前は、この処理が**その場に直書き**で、囮を書くと写しになる形だった。
 */
function sentKeysOf(bodySrc, sink) {
  const sent = [];
  if (!bodySrc) return sent;

  // 🚨 **鍵と値を取り違えない。** `title: trimmedTitle,` の `trimmedTitle` は値であって鍵ではない。
  //    最初 `name[:,\n]` で拾ったら値まで数え、`trimmedTitle` `undefined` `pathname` が
  //    「送っている鍵」として並んだ（**過大に数えた**）。
  //    鍵は「`{` か `,` の直後にある識別子」だけ。省略記法（`viewport,`）もこれで拾える。
  let depth = 0;
  let afterSeparator = false;
  for (let i = 0; i < bodySrc.length; i += 1) {
    const c = bodySrc[i];
    if (c === "{" || c === "(" || c === "[") { depth += 1; afterSeparator = depth === 1; continue; }
    if (c === "}" || c === ")" || c === "]") { depth -= 1; afterSeparator = false; continue; }
    if (depth !== 1) continue;
    if (c === ",") { afterSeparator = true; continue; }
    // 🚨 **spread は静的に中身を読めない。** 読めないものを黙って 0 件として通すと、
    //    `...{ sessionToken: document.cookie }` と書くだけでこの検査を迂回できる
    //    （2026-08-15 実測: 迂回すると exit 0 のまま通っていた）。
    if (c === "." && bodySrc.slice(i, i + 3) === "...") {
      sink?.push(
        "解析できません: 送信 body に spread（...）があります。" +
          "中身を静的に読めないので、鍵が増えていても検出できません（べた書きにしてください）",
      );
      i += 2; afterSeparator = false; continue;
    }
    if (/\s/.test(c)) continue;
    if (!afterSeparator) continue;
    const m = bodySrc.slice(i).match(/^([A-Za-z_$][\w$]*)\s*[:,}\n]/);
    if (m) { sent.push(m[1]); i += m[1].length - 1; }
    afterSeparator = false;
  }
  return sent;
}

const sent = sentKeysOf(bodySrc, problems);

// ── サーバが読む鍵（validate() の中の input.<key>） ─────────────────
const service = readOrExplain(SERVICE, "報告のドメイン層");
// 🚨 `function validate(input: …): {` の直後の `{` は**戻り値の型注釈**であって本体ではない。
//    そこを掴むと `input.` が 1 つも無く、**サーバ側 0 件**になる（最初にこれで空振りした）。
//    行頭の `}` までを本体として切る。
// 🚨 `function validate(input: …): {` の直後の `{` は**戻り値の型注釈**。そこを掴むと
//    `input.` が 1 つも無く**サーバ側 0 件**になる。しかも型注釈は行頭 `} {` で閉じるので、
//    「行頭の } まで」で切っても**型注釈だけ**を掴む（実際に 2 回とも空振りした）。
//    → 次の関数宣言までを窓にする。
/** validate() の本体を切り出して、`input.<key>` を集める。**囮も本番もここを通る。** */
function acceptedKeysOf(serviceSrc, sink) {
  const vAt = serviceSrc.indexOf("function validate(");
  const nextDecl = vAt >= 0
    ? [serviceSrc.indexOf("\nfunction ", vAt + 1), serviceSrc.indexOf("\nexport ", vAt + 1)]
        .filter((n) => n > 0)
        .sort((a, b) => a - b)[0] ?? serviceSrc.length
    : -1;
  const vBody = vAt >= 0 ? serviceSrc.slice(vAt, nextDecl) : null;
  if (!vBody) {
    sink?.push("解析できません: lib/reports/service.ts の validate() を読めませんでした");
    return new Set();
  }
  return new Set([...vBody.matchAll(/input\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
}

const accepted = acceptedKeysOf(service, problems);

const extra = sent.filter((k) => !accepted.has(k));

// ── 自己検査（囮）。**両方向 + 空振り確認**。本物の関数をそのまま呼ぶ ──────────
{
  const sentDecoy = sentKeysOf('{ zzDecoySent: 1, title: t }', null);
  const acceptedDecoy = acceptedKeysOf(
    "function validate(input) {\n  const a = input.zzDecoyAccepted;\n}\n", null,
  );
  // 🚨 逆方向: **コメントの中**の JSON.stringify。拾ったら、説明文を実装として数えている。
  const withComment = "/* 例:\n *   JSON.stringify({ zzCommentOnly: 1 })\n */\n" + composerRaw;
  const strippedAt = stripComments(withComment).indexOf("JSON.stringify({");
  const strippedBody = strippedAt >= 0
    ? balanced(stripComments(withComment), stripComments(withComment).indexOf("{", strippedAt)) : null;
  const negative = sentKeysOf(strippedBody, null).includes("zzCommentOnly");
  // 🟢 空振り確認: 潰さなければ拾うこと（拾わないなら、この囮は何も試していない）
  const rawAt = withComment.indexOf("JSON.stringify({");
  const rawBody = rawAt >= 0 ? balanced(withComment, withComment.indexOf("{", rawAt)) : null;
  const negativeRaw = sentKeysOf(rawBody, null).includes("zzCommentOnly");

  const okSent = sentDecoy.includes("zzDecoySent");
  const okAccepted = acceptedDecoy.has("zzDecoyAccepted");
  const okNegative = !negative && negativeRaw;
  console.log("■ 自己検査（囮。本物の関数をそのまま呼ぶ）");
  console.log(`  ${okSent ? "✅" : "🚨"} 囮(+/送る側): { zzDecoySent } → ${okSent ? "検出" : "検出できず"}`);
  console.log(`  ${okAccepted ? "✅" : "🚨"} 囮(+/読む側): input.zzDecoyAccepted → ${okAccepted ? "検出" : "検出できず"}`);
  console.log(`  ${okNegative ? "✅" : "🚨"} 囮(-): **コメントの中**の JSON.stringify → ` +
    `${negative ? "🚨 拾ってしまう" : "拾わない"}（🟢 潰さなければ ${negativeRaw ? "拾う＝空振りではない" : "🚨 拾わない＝囮が効いていない"}）`);
  if (!okSent || !okAccepted || !okNegative) {
    console.error("\n🚨 自己検査に失敗しました。**この検査の結果は信用できません**。");
    process.exit(1);
  }
}

console.log("■ 判定（見ているのは不具合報告の送信 1 経路だけ）");
console.log(`  画面が送る鍵      : ${sent.join(", ") || "(なし)"}`);
console.log(`  validate() が読む鍵: ${[...accepted].join(", ") || "(なし)"}`);

// 🟢 対照(+): 「在るものが在ると出る」ことを毎回示す。0 と 0 を比べて緑にしない。
if (sent.length === 0 || accepted.size === 0) {
  problems.push(
    `対照が立ちません（画面 ${sent.length} 件 / サーバ ${accepted.size} 件）。` +
      "どちらかが 0 なら、この検査は何も比べていません",
  );
}

if (problems.length > 0) {
  console.error(`\n🚨 ${problems.length} 件、解析できませんでした（「違反なし」ではありません）:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
if (extra.length > 0) {
  console.error("\n🚨 画面が送っているのに、サーバが読まない鍵があります。");
  console.error("   保存されないので無害に見えますが、**送った時点でログや経路には乗ります**。");
  console.error("   増やすなら validate() 側で受けるところまでを 1 組にしてください。");
  for (const k of extra) console.error(`  - ${k}`);
  process.exit(1);
}
console.log(`\n問題なし（送る ${sent.length} 件はすべて validate() が読む範囲に収まっています）。`);
