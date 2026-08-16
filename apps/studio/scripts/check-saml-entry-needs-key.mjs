#!/usr/bin/env node
/**
 * ログイン画面に SAML の入口を作ったら、断りの文言の鍵も一緒に足させる。
 *
 * ■ なぜこの検査が要るのか
 *   `verify.ts` は `transient` の NameID を `SAML_NAMEID_FORMAT_REJECTED` で断る（設問 292 A）。
 *   しかし **その失敗を表示する画面が無い**（実測 2026-08-16: `app/login/page.tsx` 全 87 行に
 *   'saml' 0 回 / 'sso' 0 回。ACS は JSON を返すだけ）。
 *   そこで `i18n/error.ts` に鍵を**足していない**——同じファイルに
 *   「呼び手が無い鍵を足して、同じ日に取り消した」記録が在るため（理由は「呼び手が無い」「二重になる」）。
 *
 *   🚨 代わりに `verify.ts` へ「入口ができたら鍵を足すこと」と**書いた**。
 *      **書いただけでは鳴らない**（入口を作る人が、そのコメントを読むとは限らない）。
 *      → **この検査が、その 1 行を「鳴る」側へ移すためのもの**（司令塔 2026-08-16）。
 *
 * ■ いつ落ちるか
 *   ログイン画面に SAML / SSO の入口が現れた**その瞬間**に、鍵が無ければ落ちる。
 *   🚨 いまは入口が 0 件なので **何も止めません**（＝ 通ります）。
 *
 * ## 🚨 この検査が見ていない形（**作って通した結果**・下の自己検査で毎回出します）
 * ```
 * ❌ ログイン画面**以外**に入口を作る（別のページ・部品から `/api/auth/saml/login` へ飛ばす）
 *    → **見逃します**。見る先を `app/login/page.tsx` に決め打ちしているため
 * ❌ 変数に組み立てて `href={path}` の形にする → **見逃します**（文字列で探しているため）
 * ```
 * 🚨 塞いでいない理由: 入口は**ログイン画面に置くのが自然**で、そこを見れば大半は捕まる。
 *    広げると「saml と書いたコメント」まで拾って、**関係のない人のコミットを止めます**。
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readTracked } from "./lib/tracked-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOGIN_PAGE = join(HERE, "..", "app", "login", "page.tsx");
const ERROR_TS = join(HERE, "..", "i18n", "error.ts");
const DICTS = [
  ["ja", join(HERE, "..", "i18n", "messages", "ja", "errors.json")],
  ["en", join(HERE, "..", "i18n", "messages", "en", "errors.json")],
];
const KEY = "saml_nameid_format_rejected";
const API_CODE = "SAML_NAMEID_FORMAT_REJECTED";

/**
 * 🚨 読めなかったら**自分の言葉で**落とす。
 *    素の例外だと「検査が壊れた」のか「対象が無い」のかが読み手に分からない。
 *
 * 🚨 **索引から読む**（作業ツリーを直読みしない）。
 *    このリポジトリは 1 つの作業ツリーを多数のペインが共有しているので、直読みすると
 *    **他人の書きかけ（未コミット）で、無関係な人のコミットが止まる**
 *    （`knowledge/decisions/checks-read-the-index-not-the-worktree.md`）。
 *    この検査は**照合**（ログイン画面 ↔ 文言の鍵）なので、**片側だけ索引に移すと
 *    赤の向きが裏返る**。だから**読む 4 本とも**ここを通す。
 * 🚨 `readTracked` は**追跡されていなければ `null`** を返す。それは「違反なし」ではなく
 *    **「測れていません」**なので、落とす。
 */
function readOrStop(path, what) {
  const source = readTracked(path);
  if (source === null) {
    console.error(`🚨 ${what}を索引から読めませんでした: ${path}`);
    console.error("   git の索引に無いファイルです（未追跡・改名・削除のいずれか）。");
    console.error("   → **この検査は「違反なし」ではなく「測れていません」です。**");
    process.exit(1);
  }
  return source;
}

/** コメントを落とす。**入口を数える前に必ず通す。**（`saml` と書いただけのコメントを入口と数えないため） */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/**
 * ログイン画面に SAML の入口が在るか。**判定を関数にしてある**（囮をその場で通すため）。
 *
 * 🚨 **識別子を語に割ってから照合する。** 素の `\bsaml\b` では
 *    **`<SamlLoginButton />` に当たらない**（入口として**いちばん在りそうな形**）。
 *    境界を外すと今度は **`assorted` が当たる**（`sso` を含む）。
 *    → 記号で割り、さらに **camelCase の切れ目でも割って**から、語として一致を見る。
 *    （2026-08-16 実測。最初は `\bsso\b` で書いて、囮が 2/3 しか通らなかった）
 */
function hasSamlEntry(pageSource) {
  const words = stripComments(pageSource)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z]+/);
  const hits = words.filter((w) => w.toLowerCase() === "saml" || w.toLowerCase() === "sso");
  return { found: hits.length > 0, hits };
}

/** 鍵が ja / en の両方に在るか。 */
function keyPresence() {
  const missing = [];
  for (const [locale, path] of DICTS) {
    // 🚨 ここは `readOrStop` で落とさず「足りない」に数える。
    //    索引に辞書が無いなら、**新しく clone した人の手元にも無い**＝ 鍵は無い。
    //    「測れていない」ではなく「リポジトリが持っていない」なので、赤の向きはこちらで正しい。
    const raw = readTracked(path);
    if (raw === null) {
      missing.push(`${locale}（辞書が索引に無い: ${path}）`);
      continue;
    }
    const dict = JSON.parse(raw);
    if (typeof dict[KEY] !== "string" || dict[KEY].trim() === "") missing.push(locale);
  }
  const errorTs = readOrStop(ERROR_TS, "エラーの鍵の一覧");
  const registered = errorTs.includes(`"${KEY}"`) && errorTs.includes(`${API_CODE}:`);
  return { missing, registered };
}

const page = readOrStop(LOGIN_PAGE, "ログイン画面");

// 🚨 自己検査: 囮を仕込んで、**この実行で**検出できることを確かめる。
//    「入口 0 件」が「本当に無い」のか「見ていない」のかを、毎回その場で割るため。
{
  // 🚨 **囮の土台は、生のログイン画面ではなく固定の見本を使う。**
  //    生の画面を土台にすると、**入口が足された瞬間に「拾ってはいけない側」の囮が壊れ**、
  //    本当のメッセージではなく「自己検査に失敗」で落ちる
  //    ＝ 🚨 **いちばん要るときに、診断が別物になる**（2026-08-16 実測。台で踏んだ）。
  const BASE = 'export default function Login() {\n  return <main><SetupForm /></main>;\n}\n';
  const probes = [
    ["囮1: リンクを足す（/api/auth/saml/login）", BASE + 'const zzProbe = <a href="/api/auth/saml/login">SSO</a>;\n', true],
    ["囮2: 部品名で足す（<SamlLoginButton />）", BASE + "const zzProbe2 = <SamlLoginButton />;\n", true],
    ["囮3: 変数名で足す（ssoEnabled）", BASE + "const ssoEnabled = true;\n", true],
    // 🚨 **拾ってはいけない側**。これが無いと過検出に気づけない。
    ["囮4: コメントに SAML と書く（拾ってはいけない）", BASE + "// saml のことは別ファイルに在る\n", false],
    ["囮5: sso を含む別の語（assorted・拾ってはいけない）", BASE + "const assorted = 1;\n", false],
    // 🟢 対照(-) 何も足さない見本は拾わない（＝ 上の「拾った」が足した分だと言える）
    ["囮6: 何も足さない見本（拾ってはいけない）", BASE, false],
  ];
  let alive = 0;
  console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
  for (const [name, src, want] of probes) {
    const { found, hits } = hasSamlEntry(src);
    const ok = found === want;
    if (ok) alive++;
    // 🚨 **判定だけでなく、拾った実物を出す**（届いたことが読む人に見えるように）。
    console.log(
      `  ${ok ? "✅" : "🚨"} ${name}  → ${found ? `拾った（${JSON.stringify(hits.slice(0, 3))}）` : "拾わない"}`,
    );
  }
  if (alive !== probes.length) {
    console.error(`🚨 自己検査に失敗しました（${alive}/${probes.length}）。この検査は信用できません。`);
    process.exit(1);
  }
}

// 🚨 **見ていない形も、書き置きにせず毎回その場で通す。**
{
  const blind = [
    ["ログイン画面以外に入口を作る", "（見る先を app/login/page.tsx に決め打ちしている）"],
    ["変数に組み立てて href={path} にする", "（文字列で探している）"],
  ];
  console.log("■【鳴る】この検査が見ていない形");
  for (const [what, why] of blind) console.log(`  ▫️ ${what} → **見逃します** ${why}`);
}

const { found, hits } = hasSamlEntry(page);
const { missing, registered } = keyPresence();

// 🚨 **候補と、実際に見た数を分けて出す。** 本数だけだと「1 文字も読めていない」が隠れる。
console.log(
  `■ 走査 … ログイン画面 1 枚（読めた文字数 ${page.length}） / SAML の入口 ${hits.length} 件` +
    ` / 鍵 ${KEY}: ja${missing.includes("ja") ? "✗" : "✓"} en${missing.includes("en") ? "✗" : "✓"}` +
    ` / error.ts 登録 ${registered ? "✓" : "✗"}`,
);
if (page.trim().length === 0) {
  console.error("🚨 ログイン画面の中身を読めていません。**「入口が無い」ではなく「見ていない」です。**");
  process.exit(1);
}

if (!found) {
  console.log("  ログイン画面に SAML の入口はまだありません（＝ 鍵はまだ要りません）。");
  process.exit(0);
}

if (missing.length === 0 && registered) {
  console.log(`  入口が在り、鍵 ${KEY} も揃っています。`);
  process.exit(0);
}

console.error("🚨 ログイン画面に SAML の入口ができました。断りの文言の鍵が要ります。");
console.error(`   拾った箇所: ${JSON.stringify(hits.slice(0, 5))}`);
if (!registered) {
  console.error(`   ・i18n/error.ts に "${KEY}" を足し、API_CODE_TO_KEY に ${API_CODE} を写像してください`);
}
for (const locale of missing) {
  console.error(`   ・i18n/messages/${locale}/errors.json に "${KEY}" を足してください`);
}
console.error("   （由来: 設問 292 A。transient の NameID を断るときの文言。lib/auth/saml/verify.ts）");
process.exit(1);
