#!/usr/bin/env node
/**
 * ja と en で、**同じ鍵のプレースホルダが揃っているか**と、**どちらかが空でないか**を見る。
 *
 * 由来: 2026-08-16。`check-i18n-keys` は**鍵の集合**だけを見ていて、
 * **中身が食い違っていても通る**。設問290 で ja / en を同時に直す作業が控えており、
 * 「片方だけ直る」事故が実際に起きうるので、機械で見られる分だけを見る。
 *
 * 🚨 **この検査が見ていないもの**（作ったから安心、にしないため）:
 * ```
 * ❌ 「削除しました」と "Deleted" が **同じ意味か**
 *    → 🚨 **290 で守りたいのは、まさにここ。この検査は守ってくれない**
 *    → ja / en を直すときは、**人が両方を読むこと**
 * ❌ 敬体・常体、語調、長さ
 * ❌ ja と en が同じ文字列であること
 *    実測（2026-08-16）: 9 件在るが **全部 固有名詞**（OhMyCMS / SSO / 日本語 / 2 / 2）。
 *    検査にすると誤検出になるので、**意図的に見ていない**
 * ❌ 🚨 **`{name}` 以外の書き方**（下の「囮3」が毎回実演する）
 *    空白入り `{ name }` / 全角 `｛name｝` / `%s` `%d`
 *    実測（2026-08-16）: **実データには 0 件**（🟢 対照 素の `{name}` は 35 件）。
 *    いま実害が無いので拾えるようにしていない。**書かれたら静かに素通りする**
 * ```
 *
 * 🚨 **「見ていないもの」は、思いつきで書かない。**
 * **見逃す入力を自分で作って通し、落ちないことを確かめてから書く**（囮3）。
 * 由来: 2026-08-16 司令塔「**取りこぼしは数えられないが、実演はできる**」。
 *
 * 決定: `knowledge/decisions/checks-must-declare-blind-spots.md`
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** そのロケールの全文言を `名前空間.鍵` → 文字列 で返す。 */
function load(loc) {
  const dir = resolve(root, "i18n/messages", loc);
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const j = JSON.parse(readFileSync(resolve(dir, f), "utf8"));
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string") out[`${f.replace(/\.json$/, "")}.${k}`] = v;
    }
  }
  return out;
}

/** 文字列の中のプレースホルダ名を、並び順に依らない形で返す。 */
function placeholders(s) {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
}

/**
 * 🚨 **囮が本物を呼べるように、値を受け取る純関数にしてある**（2026-08-15 の教訓）。
 * ディスクを読むのは呼び出し側。ここに読み込みを入れると、囮は写しになる。
 */
function scan(ja, en) {
  const hits = [];
  for (const key of Object.keys(ja)) {
    if (!(key in en)) continue; // 鍵の欠落は check-i18n-keys の担当
    const a = ja[key], b = en[key];
    if (!a.trim() || !b.trim()) {
      hits.push({ key, rule: "どちらかが空", ja: a, en: b });
      continue;
    }
    if (placeholders(a) !== placeholders(b)) {
      hits.push({ key, rule: "プレースホルダが違う", ja: a, en: b });
    }
  }
  return hits;
}

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
let selfTestFailed = false;

// 🚨 0 だけを見るガードは「**ほとんど見ていない**」を通す（799 → 1 でも 0 ではない）。
//    由来: 2026-08-16。自分で 0 ガードを入れたあと、その穴に気づいた。
//    🚨 この数は 2026-08-16 の実測 799 の 7 割。**増えたら上げてよい。下げるときは理由を書く。**
const 共通の下限 = 560;
const ja = load("ja");
const en = load("en");
const 共通 = Object.keys(ja).filter((k) => k in en).length;

// 🚨 0 件ガード。読めていないのか、違反が無いのかを分ける。
const 足りている = 共通 >= 共通の下限;
console.log(
  `  ${足りている ? "✅" : "❌"} 対象を拾えている  ja ${Object.keys(ja).length} / en ${Object.keys(en).length} / 共通 ${共通} 件` +
    `（下限 ${共通の下限}。🚨 0 ではなく**大きく減った**ことも落とす）`,
);
if (!足りている) selfTestFailed = true;

// 🚨 **囮は scan() を直接呼ぶ＝実物より内側から入っている。**
//    だから **走査対象を決める処理（collect / load）が死んでも、囮 1・2 は緑のまま**。
//    それを捕まえているのは、下の「対象を拾えている」の 0 ガードだけ。
//    🔴 実測 2026-08-16（台の上で collect を空にした）: 囮1 ✅ / 囮2 ✅ のまま、
//       「対象 0 ファイル」で ❌ → exit 1。**囮ではなく 0 ガードが止めている。**
//    🚨 そして 0 ガードは **0 しか見ない**。214 → 1 に減っても通る。
//    由来: 司令塔 2026-08-16「囮が実物より内側から入っていると、外側の門が死んでも全部通る」。
//    🚨 実物の入口から入れるには**ディスクにファイルを置く**ことになり、共有ツリーを触るので
//    やっていない（**作れない理由を書く**）。
// 🚨 囮はすべて **本物の scan() を呼ぶ**（判定を書き写さない）。
const 囮 = (a, b) => scan({ "decoy.k": a }, { "decoy.k": b });

const 検出すべき = [
  ["片方にプレースホルダが無い", "「{name}」を削除", "Delete this"],
  ["プレースホルダの名前が違う", "「{name}」を削除", 'Delete "{title}"'],
  ["ja が空", "", "Delete"],
  ["en が空", "削除", "   "],
];
const 素通り = 検出すべき.filter(([, a, b]) => 囮(a, b).length === 0);
console.log(`  ${素通り.length === 0 ? "✅" : "❌"} 囮1: 検出すべき ${検出すべき.length} 通り  → 素通り ${素通り.length} 件${素通り.length ? "（" + 素通り.map(([n]) => n).join(" / ") + "）" : ""}`);
if (素通り.length !== 0) selfTestFailed = true;

const 検出してはいけない = [
  ["同じプレースホルダ", "「{name}」を削除", 'Delete "{name}"'],
  ["順番だけ違う", "{a} と {b}", "{b} and {a}"],
  ["プレースホルダ無し同士", "削除", "Delete"],
  ["🚨 固有名詞で同一（意図的に見ていない）", "OhMyCMS", "OhMyCMS"],
];
const 誤検出 = 検出してはいけない.filter(([, a, b]) => 囮(a, b).length > 0);
console.log(`  ${誤検出.length === 0 ? "✅" : "❌"} 囮2: 検出してはいけない ${検出してはいけない.length} 通り  → 誤検出 ${誤検出.length} 件${誤検出.length ? "（" + 誤検出.map(([n]) => n).join(" / ") + "）" : ""}`);
if (誤検出.length !== 0) selfTestFailed = true;

// 🚨 囮3: **見逃す入力**を自分で作って通す。落ちないことを確かめて「見ていない」と言う。
//    判定には影響させない（落とさない）。**拾えるようになったら、ここで気づける。**
const 見逃すはず = [
  ["空白入りの波括弧", "「{ name }」を削除", "Delete this"],
  ["全角の波括弧", "「｛name｝」を削除", "Delete this"],
  ["別記法 %s", "「%s」を削除", "Delete this"],
];
// 🚨 対照が先。**対照が死んでいると「見逃した」は「検出器が死んでいるだけ」で、何も言っていない。**
//    由来: 2026-08-16 [w4A:p1H / polish]。同日 toast も「4 本とも出ず、3 本見逃したと書きかけた」。
const 囮3の対照 = 囮("「{name}」を削除", "Delete this").length > 0;
if (!囮3の対照) {
  console.error("  ❌ 囮3 の対照が拾えない。**この先の「見逃した」は意味を持たない**（検出器が死んでいる）。");
  selfTestFailed = true;
}
const 実は拾えた = 見逃すはず.filter(([, a, b]) => 囮(a, b).length > 0);
console.log(
  `  ⚪ 囮3: **見逃すはず** ${見逃すはず.length} 通り  → 実際に見逃した ${見逃すはず.length - 実は拾えた.length} 件` +
    (実は拾えた.length ? `  🚨 拾えるようになった: ${実は拾えた.map(([n]) => n).join(" / ")} → JSDoc の「見ていないもの」を直すこと` : "（＝ JSDoc の記述どおり）"),
);

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const hits = scan(ja, en);
console.log(`\n■ 判定`);
console.log(`  対象: 共通の鍵 ${共通} 件`);
for (const rule of ["プレースホルダが違う", "どちらかが空"]) {
  const n = hits.filter((h) => h.rule === rule).length;
  console.log(`    ${String(n).padStart(3)} 件  ${rule}`);
}
console.log(`  🚨 この検査は「訳の意味が同じか」は見ていない（先頭の JSDoc を読むこと）`);

if (hits.length === 0) process.exit(0);

console.error(`\n🚨 ja と en で中身が食い違っています。`);
for (const h of hits) console.error(`  [${h.rule}] ${h.key}\n      ja: ${h.ja.slice(0, 60)}\n      en: ${h.en.slice(0, 60)}`);
console.error("\n  直し方: 片方に合わせる。🚨 **プレースホルダは名前まで一致させる**（{name} と {title} は別物）。");
process.exit(1);
