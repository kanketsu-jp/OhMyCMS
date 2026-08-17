#!/usr/bin/env node
/**
 * 左サイドバーの**静的な行**が、既定のアイコンに落ちていないかを見る。
 *
 * 由来: 堀池さん 2026-08-17 K1「ゴミ箱のアイコンが不自然」／ S1「設定のアイコンもちゃんと個別に設定」。
 * 規約は `DESIGN.md` §3-1「アイコンは既定に落とさない。項目ごとに設定する」。
 *
 * 🚨 **なぜ検査が要るか（注意では止まらないから）。**
 *   2026-08-17、**同じ日に 2 回再発した**。どちらも私が直した直後に、他レーンが行を動かして戻った:
 *     ① pages の AF1 で `/admin/settings/ai` が新設 → 既定落ち（f11a658f で修正）
 *     ② auth の AH1 で `/admin/version` へ移動 → 既定落ち（da64b841 で修正）
 *   **行を足す・動かすのは他レーンの正当な作業**なので、「気をつける」では止まらない。
 *
 * ## 見るもの / 見ないもの
 *
 * 見るもの … `app/(admin)/layout.tsx` に**文字列で書かれた行き先**（`href: "/admin/..."`）と、
 *            `components/admin/left-sidebar.tsx` の `NavItemIcon` の分岐。
 * 🚨 **コレクションの行は見ない。** あちらは行き先が実行時に決まり（`/admin/content/<識別子>`）、
 *   既定が**正しい**（名前から散らす・`collectionIconFor`）。ここで見ると必ず誤検知になる。
 *
 * 🚨 **この検査の死角（`decisions/checks-must-declare-blind-spots.md`）**
 *   ・**静的な文字列しか見ていない。** 行き先を変数や関数から組み立てたら見えない
 *   ・**画面を見ていない。** 分岐が在っても描画側が使っていなければ通る
 *     （`NavItemIcon` を呼ばない書き方に変えられたら素通り）
 *   ・**`left-sidebar.tsx` と `layout.tsx` の 2 本しか読まない。** SP のドロワーは対象外
 *     （実測 2026-08-17: ドロワーの下部項目はラベルだけでアイコンを描いていない）
 */
import { readTracked } from "./lib/tracked-files.mjs";

const LAYOUT = "app/(admin)/layout.tsx";
const SIDEBAR = "components/admin/left-sidebar.tsx";

const problems = [];
const checked = [];

const layout = readTracked(LAYOUT);
const sidebar = readTracked(SIDEBAR);

// 🚨 **対象そのものを見つけられないときは落とす**（「異常が無い 0」と「見ていない 0」を分けるため）。
if (layout === null || sidebar === null) {
  console.error(
    `🚨 対象を索引から読めません（${LAYOUT} / ${SIDEBAR}）。\n` +
      `   **何も見ていないので落とします。** リポジトリ直下ではなく apps/studio で実行してください。`,
  );
  process.exit(1);
}
checked.push(`対象 2 本を索引から読めた（${LAYOUT} / ${SIDEBAR}）`);

/** `layout.tsx` に文字列で書かれた行き先を集める。**コレクションは動的なので出てこない。** */
function hrefsIn(source) {
  return [...new Set([...source.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]))];
}

/** `NavItemIcon` の中で分岐している行き先を集める（完全一致と前方一致の両方）。 */
function coveredIn(source) {
  const start = source.indexOf("function NavItemIcon");
  if (start === -1) return null;
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end === -1 ? undefined : end);
  const exact = [...body.matchAll(/href === "([^"]+)"/g)].map((m) => ({ kind: "exact", value: m[1] }));
  const prefix = [...body.matchAll(/href\.startsWith\("([^"]+)"\)/g)].map((m) => ({ kind: "prefix", value: m[1] }));
  return [...exact, ...prefix];
}

/** 規則の本体。**任意のソース片に当てられる形**にしてある（囮で自己検査するため）。 */
function inspect(layoutSource, sidebarSource, where) {
  const covered = coveredIn(sidebarSource);
  if (covered === null) {
    return [`${where}: NavItemIcon が見つかりません。**対象が取れていないので落とします。**`];
  }
  const found = [];
  for (const href of hrefsIn(layoutSource)) {
    const hit = covered.some((c) =>
      c.kind === "exact" ? c.value === href : href.startsWith(c.value),
    );
    if (!hit) {
      found.push(
        `${where}: ${href} に分岐がありません（既定のアイコンに落ちます）。\n` +
          `    DESIGN.md §3-1「アイコンは既定に落とさない。項目ごとに設定する」。\n` +
          `    直し方: ${SIDEBAR} の NavItemIcon に 1 行足す。\n` +
          `    🚨 **新しい絵を選ばないこと**（§3-2）。既にこのリポジトリで使っている絵から採る。`,
      );
    }
  }
  return found;
}

// ── 🚨 囮（自己検査）: 走るたびに、規則が本当に発火するかを確かめる
const 分岐あり = `function NavItemIcon({ href }) {
  if (href === "/admin/zz-a") return <A />;
  if (href.startsWith("/admin/zz-pre")) return <B />;
  return <TableIcon />;
}`;
const DECOYS = [
  ["きれいな形（発火してはいけない）", 'href: "/admin/zz-a",', 分岐あり, 0],
  ["前方一致でも拾える（発火してはいけない）", 'href: "/admin/zz-pre/x",', 分岐あり, 0],
  ["分岐の無い行き先（発火する）", 'href: "/admin/zz-none",', 分岐あり, 1],
  ["NavItemIcon ごと消す（発火する）", 'href: "/admin/zz-a",', "function Other() {}", 1],
];
let decoyFailed = false;
for (const [name, l, s, want] of DECOYS) {
  const got = inspect(l, s, "囮").length;
  const ok = want === 0 ? got === 0 : got >= 1;
  if (!ok) {
    decoyFailed = true;
    console.error(`🚨 囮が期待どおりに動きません: ${name} → 検出 ${got} 件（期待 ${want === 0 ? "0" : "1 以上"}）`);
  }
}
if (decoyFailed) {
  console.error("\n🚨 **規則が壊れています。この検査の結果は信用できません**（緑でも意味を持たない）。");
  process.exit(1);
}
checked.push(`囮 ${DECOYS.length} 件すべてが期待どおり（分岐が在れば通す／無ければ拾う）`);

// 🚨 **拾えているか**も出す。0 件が「異常が無い」なのか「そもそも読めていない」なのかを分けるため。
const hrefs = hrefsIn(layout);
if (hrefs.length === 0) {
  console.error(`🚨 ${LAYOUT} から行き先を 1 件も取れませんでした。**書き方が変わった可能性があります。**`);
  process.exit(1);
}
checked.push(`${LAYOUT} から静的な行き先を ${hrefs.length} 件拾えた`);

problems.push(...inspect(layout, sidebar, SIDEBAR));

console.log(`対象: ${LAYOUT} / ${SIDEBAR}`);
console.log(`確かめたこと: ${checked.length} 件`);
for (const c of checked) console.log(`  🟢 ${c}`);
console.log("🚨 見ていない範囲: コレクションの行（実行時に決まる・既定が正しい）／SP のドロワー／描画そのもの");

if (problems.length > 0) {
  console.error(`\n🚨 既定のアイコンに落ちる行き先: ${problems.length} 件`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("違反なし。");
