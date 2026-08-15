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
import { globSync, readFileSync } from "node:fs";
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
];

/** app/(admin) 配下の page.tsx から実在するルートを作る。`[param]` を含むものは別扱い。 */
function routesFromDisk() {
  const files = globSync("app/(admin)/**/page.tsx", { cwd: root });
  return files
    // 🚨 **ディスクの page.tsx と、実際に URL になるものは違う**（2026-08-15・storage の指摘した形:
    //    「守りが見ている値と、実装が使う値は同じか」）。Next.js は次を URL にしない:
    //      _foo/  … アンダースコアで始まる区画（private folder）
    //      (foo)/ … 丸括弧の区画（route group。パスに現れない）
    //    実測: app/(admin)/admin/zz-x/_private/page.tsx を置くと**巡回漏れとして誤検出**した。
    //    ＝ この検査は「ファイルが在る」を見ていて、「URL が在る」を見ていなかった。
    .filter((f) => !f.split("/").some((seg) => seg.startsWith("_")))
    .map((f) => {
      const p =
        "/" +
        f
          .replace(/^app\/\(admin\)\//, "")
          .replace(/\/page\.tsx$/, "")
          // route group は URL に現れない
          .split("/")
          .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
          .join("/");
      return { file: f, path: p === "/" ? "/" : p, dynamic: p.includes("[") };
    });
}

/** 監査の DEFAULT_PATHS を読む（import すると Chrome を起動してしまうので、テキストで抜く）。 */
function crawledPaths() {
  const src = readFileSync(resolve(root, "scripts/audit-surface-depth.mjs"), "utf8");
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
  // 🚨 この検査は staged ではなく**ディスクを見る**（globSync）。
  //    ＝ **コミットしていない一時ファイルでも落ちる＝全員のコミットが止まる**。
  //    2026-08-15 実測: 未追跡の page.tsx を 1 枚置いただけで exit 1 になった。
  //    実際に design が zz-tree-probe / zz-wrap-probe を app/ 配下へ置いており、
  //    **消し忘れていたら全員を止めていた**（司令塔が「門が止まる形」の 3 件目として記録）。
  console.error(
    "\n   🚨 心当たりが「検証用に置いた一時ページ」なら、**消してください**。" +
      "\n      この検査は staged ではなくディスクを見るので、**コミットしていなくても落ちます**。" +
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
