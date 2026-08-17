#!/usr/bin/env node
/**
 * 面の監査が「実在するのに巡回していないページ」を持っていないかを見る。
 *
 * 🚨 由来: 2026-08-15。`audit-surface-depth.mjs` の `DEFAULT_PATHS` は**手で書いた一覧**で、
 *    実在 29 ページに対して **20 ページしか巡回していなかった**。
 *    差の 9 本のうち **4 本は静的で、HTTP 200 で誰でも開ける**のに、**一度も測っていなかった**:
 *      /admin/labels /admin/profile /admin/reports/manage /admin/settings/storage
 *    測ったら `/admin/profile` に**違反 4 件**（レイアウトが潰れている・入力が 736px ほか）。
 *
 * 🚨 `checks-must-declare-blind-spots.md` に「**対象の一覧はコマンドで作る**」と
 *    design 自身が書いておきながら、**手書きの側を正としたまま**だった。
 *    「[param] を実データで拾う」ことに気を取られ、
 *    **静的なページが増えたら勝手に入る仕組みを作らなかった。**
 *
 * ## なぜ「全部自動で拾う」にしないか（司令塔と design で合意した (c)）
 *
 * 自動で全部巡回すると、**転送されるページや権限で開けないページを巻き込む**。
 * そして 🚨 **除外の理由が消える**。
 * この検査は**漏れを見せて人に判断させる**——除外するなら、下の表に理由を書く。
 * 書けば次の人が消せるし、書かなければ落ち続ける。
 */
import { readFileSync } from "node:fs";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 巡回しないと決めたページ。**理由が無い行は書かない**（規律13 の4項目）。
 * 🚨 ここを空にしないこと。空にすると「除外は無い」ではなく「理由を消した」になる。
 */
const EXCLUDED = [
  {
    path: "/admin",
    recordedAt: "2026-08-15",
    status: "決定",
    decider: "design",
    reason: "HTTP 307（/admin/collections への恒久転送）。着地先を直接巡回している",
  },
  {
    path: "/admin/folders",
    recordedAt: "2026-08-15",
    status: "決定",
    decider: "design",
    reason: "HTTP 307（/admin/files へ統合済み・堀池「この二つはどう違うのかわからない」）",
  },
  {
    path: "/admin/settings/version",
    recordedAt: "2026-08-17",
    status: "決定",
    decider: "pages",
    reason:
      "中身を /admin/version へ移し、ここは転送だけになった（堀池「settings は不要で設定もしないので、admin/version でお願いします」）。着地先 /admin/version を直接巡回している",
  },
  {
    path: "/admin/settings/agents",
    recordedAt: "2026-08-17",
    status: "決定",
    decider: "pages",
    reason:
      "HTTP 307（/admin/settings/ai へ統合・堀池「これらは1つのページにまとめるか、タブで切り替えられるようにしてください」）。着地先を直接巡回している",
  },
  {
    path: "/admin/settings/mcp",
    recordedAt: "2026-08-17",
    status: "決定",
    decider: "pages",
    reason:
      "HTTP 307（/admin/settings/ai へ統合・堀池「これらは1つのページにまとめるか、タブで切り替えられるようにしてください」）。着地先を直接巡回している",
  },
];

/**
 * 🚨 **ファイル → URL の変換を 1 箇所に集める**（2026-08-15）。
 * それまで囮2 が同じ変換を**書き写して**いた。実測: 本物の `_` filter だけを殺しても
 * **囮2 は ✅ のまま**で、**他のどの囮も落とさなかった**（いまツリーに `_` 区画が無いため、
 * 判定側も変化しない＝**まだ出番が来ていない穴**）。
 * 本物と囮が同じ関数を通るようにして、写しを無くす。
 */
/** Next.js が URL にしないファイルなら false（`_` 始まりの区画）。 */
function isUrlFile(f) {
  return !f.split("/").some((seg) => seg.startsWith("_"));
}
/** `app/(admin)/…/page.tsx` を URL のパスへ（route group は消える）。 */
function toRoutePath(f) {
  const p =
    "/" +
    f
      .replace(/^app\/\(admin\)\//, "")
      .replace(/\/page\.tsx$/, "")
      .split("/")
      .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
      .join("/");
  return p === "/" ? "/" : p;
}

/** app/(admin) 配下の page.tsx から実在するルートを作る。`[param]` を含むものは別扱い。 */
function routesFromDisk() {
  const files = trackedGlob("app/(admin)/**/page.tsx", { cwd: root });
  return files
    // 🚨 **ディスクの page.tsx と、実際に URL になるものは違う**（2026-08-15・storage の指摘した形:
    //    「守りが見ている値と、実装が使う値は同じか」）。Next.js は次を URL にしない:
    //      _foo/  … アンダースコアで始まる区画（private folder）
    //      (foo)/ … 丸括弧の区画（route group。パスに現れない）
    //    実測: app/(admin)/admin/zz-x/_private/page.tsx を置くと**巡回漏れとして誤検出**した。
    //    ＝ この検査は「ファイルが在る」を見ていて、「URL が在る」を見ていなかった。
    .filter(isUrlFile)
    .map((f) => {
      const p = toRoutePath(f);
      return { file: f, path: p, dynamic: p.includes("[") };
    });
}

/** 監査の DEFAULT_PATHS を読む（import すると Chrome を起動してしまうので、テキストで抜く）。 */
function crawledPaths() {
  // 🚨 **両側を同じ側（索引）から読む**。片側だけ索引に移すと、赤の向きが裏返るだけになる
  //    （2026-08-16 実測。詳しくは lib/tracked-files.mjs の `readTracked` の説明）。
  const src = readTracked(resolve(root, "scripts/audit-surface-depth.mjs"));
  if (src === null) return null;
  const m = src.match(/const DEFAULT_PATHS = \[([\s\S]*?)\n\];/);
  if (!m) return null;
  return [...m[1].matchAll(/"(\/[^"]*)"/g)].map((x) => x[1]);
}

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
let selfTestFailed = false;

const routes = routesFromDisk();
const crawled = crawledPaths();

// 🚨 正の対照。「在るものが在ると出る」側だけが、探し方の正しさを保証する。
console.log(`  ${routes.length > 0 ? "✅" : "❌"} 実在するページを拾えている  ${routes.length} 件`);
if (routes.length === 0) selfTestFailed = true;

// 🚨 一覧が 0 件なら「漏れが無い」ではなく「読めていない」。
console.log(`  ${crawled && crawled.length > 0 ? "✅" : "❌"} 巡回一覧を読めている  ${crawled ? crawled.length : 0} 件`);
if (!crawled || crawled.length === 0) selfTestFailed = true;

/**
 * 🚨 除外の path が重複していないか（2026-08-15・polish の「内訳が畳まれる」形をここへ当てた）。
 * `excludedPaths` は Set なので**重複しても黙って 1 つに潰れる**が、
 * 表示は `EXCLUDED.length` を使うので **「除外 3 件」と出て実際は 2 件**になる。
 * ＝ **数と実態がずれるのに、どこも赤くならない。**
 * 実測でこの形が出たわけではない（いまは重複なし）。**出る前に塞ぐ**。
 */
const excludedNames = EXCLUDED.map((e) => e.path);
const dupExcluded = [...new Set(excludedNames.filter((n, i) => excludedNames.indexOf(n) !== i))];
console.log(`  ${dupExcluded.length === 0 ? "✅" : "❌"} 除外の path が一意  ${EXCLUDED.length} 件${dupExcluded.length ? "（重複: " + dupExcluded.join(" / ") + "）" : ""}`);
if (dupExcluded.length > 0) selfTestFailed = true;

/**
 * 🚨 **「検出されてはいけないもの」の囮**（2026-08-15・司令塔の指摘を受けて追加）。
 *
 * ここまでの囮は**検出される側**しか見ていなかった。**逆方向が無いと、過検出は永久に捕まらない。**
 * この検査は実際に一度、過検出している:
 *   `app/(admin)/admin/zz-x/_private/page.tsx` を「巡回漏れ」として報告した
 *   （Next.js は `_` 始まりの区画と `(…)` の区画を URL にしない）。
 * コードでは直したが、**囮が無いので、次に誰かが filter を消しても気づけなかった。**
 */
const 出てはいけない = [
  "app/(admin)/admin/zz/_private/page.tsx",   // アンダースコア区画 → URL にならない
  "app/(admin)/(group)/zz/page.tsx",          // route group → パスに現れない
];
{
  // routesFromDisk と同じ変換を、この 2 本にだけ当てる
  // 🚨 **本物と同じ関数を通す**（書き写さない）。
  const 変換 = 出てはいけない.filter(isUrlFile).map(toRoutePath);
  // 期待: `_private` は落ちて 0 件、route group は `/zz` に潰れる（＝ 2 本とも「そのままの形」では出ない）
  const 誤検出 = 変換.filter((p) => p.includes("_") || p.includes("("));
  console.log(`  ${誤検出.length === 0 ? "✅" : "❌"} 囮2: URL にならない区画  → 誤検出 ${誤検出.length} 件${誤検出.length ? "（" + 誤検出.join(" ") + "）" : ""}`);
  if (誤検出.length !== 0) selfTestFailed = true;
}

// 囮: 実在しないページを巡回一覧に混ぜたら「巡回に在るが実在しない」として出るか。
const decoyMissing = ["/admin/zz-not-a-page"].filter(
  (p) => !routes.some((r) => r.path === p) && !EXCLUDED.some((e) => e.path === p),
).length;
console.log(`  ${decoyMissing === 1 ? "✅" : "❌"} 囮: 実在しないページ  → 検出 ${decoyMissing} 件`);
if (decoyMissing !== 1) selfTestFailed = true;

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const excludedPaths = new Set(EXCLUDED.map((e) => e.path));
// `[param]` は実データが要るので `DEFAULT_PATHS` には書けない。発見の段（discoverDynamicPaths）が拾う。
const staticRoutes = routes.filter((r) => !r.dynamic);
const missing = staticRoutes.filter((r) => !crawled.includes(r.path) && !excludedPaths.has(r.path));
const stale = crawled.filter((p) => !routes.some((r) => r.path === p));

console.log(`\n■ 判定`);
console.log(`  実在する静的ページ: ${staticRoutes.length} 件（動的 ${routes.length - staticRoutes.length} 件は発見の段が拾う）`);
console.log(`  巡回一覧: ${crawled.length} 件 ／ 除外: ${EXCLUDED.length} 件`);
console.log(`  巡回していない: ${missing.length} 件 ／ 巡回に在るが実在しない: ${stale.length} 件`);
for (const e of EXCLUDED) {
  console.log(`  除外 ${e.path}  [${e.status}/${e.recordedAt}/${e.decider}] ${e.reason}`);
}

if (missing.length === 0 && stale.length === 0) process.exit(0);

if (missing.length > 0) {
  console.error(`\n🚨 実在するのに巡回していないページ: ${missing.length} 件`);
  console.error("   **開けるのに一度も測っていない**＝この監査の「違反なし」は、その分だけ嘘です。");
  // 🚨 **この検査は索引（git ls-files / git show :path）を見る**。2026-08-16 に変えた。
  //    以前はディスク（globSync）を見ていたので、**コミットしていない一時ファイルでも落ち、
  //    そのファイルに触っていない人のコミットが止まった**（2026-08-15 実測: 未追跡の page.tsx を
  //    1 枚置いただけで exit 1。design の zz-tree-probe / zz-wrap-probe が実際にそれを起こした）。
  //    🚨 いまは **ページも巡回一覧も索引から**読むので、**両方まだ入っていなければ緑**。
  //    ＝ **書きかけの人が、他人を落とさない。入れた側だけ入っていれば、入れた人が落ちる。**
  console.error(
    "\n   🚨 心当たりが「検証用に置いた一時ページ」なら、**消してください**。" +
      "\n      この検査は索引を見るので、**`git add` したものが対象**です（未追跡のままなら落ちません）。" +
      "\n      一時ファイルはリポジトリの外（scratchpad）へ置くこと。",
  );
  for (const r of missing) console.error(`  ${r.path}   (${r.file})`);
  console.error(
    "\n  直し方: `scripts/audit-surface-depth.mjs` の DEFAULT_PATHS へ足す。" +
      "\n  巡回しない理由があるなら、このファイルの EXCLUDED へ **理由つきで** 足す" +
      "\n  （recordedAt / status / decider / reason。🚨 理由の無い除外は書かないこと）。",
  );
}
if (stale.length > 0) {
  console.error(`\n🚨 巡回一覧に在るが、実在しないページ: ${stale.length} 件`);
  for (const p of stale) console.error(`  ${p}`);
  console.error("\n  直し方: DEFAULT_PATHS から外す（消えたページを測り続けても意味がありません）。");
}
process.exit(1);
