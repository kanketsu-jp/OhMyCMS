#!/usr/bin/env node
/**
 * 操作部品の高さを、素の数字（`h-8` など）で書いていないかを見る。
 *
 * 🚨 由来: 2026-08-15。`app/globals.css` に
 *    **「ここが唯一の定義場所。`h-8` のような素の数字を部品側に直接書かない」**と書いてあり、
 *    `button.tsx` にも「**素の h-8 を書き戻さない**」と書いてあった。
 *    **どちらもコメントだけで、止めるものが無かった。**
 *
 *    司令塔の規律12（同日）:
 *      **コメントが在ることは、守られていることではない。**
 *      **守っているコードを名指しできるか。名指しできないなら、それは願望。**
 *    → 名指しできなかったので、これを作った。
 *
 * 🚨 実際、同じ日に `--control-h-pc` を 32→36px へ動かしたとき、
 *    **`sidebar.tsx` だけ素の `h-8` のまま取り残された**（トークンを 1 つも使っていなかった）。
 *    素の数字は**トークンを動かしても追随しない**ので、こういう置き去りが静かに増える。
 *
 * ## 見るもの / 見ないもの
 *
 * 対象は **`h-` / `min-h-`** だけ。**`size-` は見ない**——
 * `size-6` はアイコンの字面の大きさで、**操作部品の高さではない**（実測で 20 箇所あり、
 * 全部を違反にすると門が死ぬ）。
 * 🚨 **コメント行は見ない**。「素の h-8 を書き戻さない」という**戒めの文自体**が
 * 違反になると、経緯が書けなくなる（`check-no-api-message.mjs` と同じ判断）。
 *
 * ## 🚨 この検査が見ていないもの（守り手を名乗る以上、範囲を明記する）
 *
 * **見ているのは class 文字列。実装が最終的に使うのは「計算後の高さ」で、両者は同じではない。**
 * 実測（2026-08-15）: `const zzS = { height: 32 };` のように **style で固定しても件数は 7 のまま**
 * ＝ **素通りする**。同じ形で `style={{ height: 32 }}` / CSS ファイル側の指定も見ていない。
 *
 * **塞いでいない理由**: このリポジトリの寸法は Tailwind のクラスで書く決まりで
 * （`every-element-must-earn-its-place` §4）、**style での指定はそもそも規約違反**。
 * ここで両方を見ようとすると、**計算後の高さを測る＝ブラウザが要る**ことになり、
 * pre-commit の「速いものだけ」に収まらない（面の監査が別に測っている）。
 * 🚨 **見ていないことを書いておく。** 書かないと「この検査が緑＝高さは全部トークン経由」と読まれる。
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 操作部品として使われうる段だけ（4px 刻みの 24〜56px）。 */
const PATTERN = /(?:^|[^a-z-])((?:min-)?h-(?:6|7|8|9|10|11|12|14))\b/g;
/**
 * 🚨 **文字列を組み立てての迂回**を止める（2026-08-15）。
 *    司令塔「自分ならどう避けるか、を一度考えて、避けられるなら塞いでください」を受けて
 *    実際に試したところ、`"h-" + "8"` で**素通りした**（件数が変わらなかった）。
 *    接頭辞だけの断片（`"h-"` / `"min-h-"`）が現れたら、組み立てを疑って落とす。
 */
const SPLIT_PATTERN = /(["'`])(?:min-)?h-\1/g;

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
}

/**
 * 🚨 **「高さが素の数字」だけでは足りない。「操作部品か」まで見る**（2026-08-15）。
 *
 * 由来: 7 件を「直してください」と 5 ペインへ配ったあと、中身を見たら
 * **本物は 1〜2 件**で、残りは **画像（ロゴのプレビュー）とヘッダ帯**だった。
 * ```
 * <img className="h-10 w-auto rounded">        ← 画像。--control-h-* の段は当たらない
 * <header className="flex min-h-14 …">          ← ヘッダ帯。操作部品ではない
 * <Input className="h-8 max-w-64">              ← これだけが本物
 * ```
 * `--control-h-*` は **押す・入力する部品**の高さの段であって、**画像や帯の寸法ではない**。
 * 対象を絞らない検査は、**正しいコードを直させる**（憲章 §1「正解を違反と言う検査は死ぬ」）。
 *
 * 🚨 落とさずに **分けて出す**。画像・帯を黙って除外すると、
 * 「本当は寄せたい帯」が出てきたときに気づけない。**落とすのは操作部品だけ**にして、
 * それ以外は **参考**として件数と中身を出す。
 */
const CONTROL_TAGS = new Set([
  "button", "input", "select", "textarea", "a", "label", "summary",
  "Button", "Input", "Select", "SelectTrigger", "Textarea", "Link", "Toggle", "Switch",
  "Checkbox", "RadioGroupItem", "SidebarMenuButton", "SidebarMenuSubButton", "CopyButton",
  "PageAction", "TabsTrigger", "AccordionTrigger", "DropdownMenuTrigger", "PopoverTrigger",
]);

/**
 * その行が属する JSX の開きタグ名を返す。
 * 🚨 直前の `<Tag` を後ろ向きに探すだけの単純な方法（構文解析はしない）。
 *    取り違えたときに**部品でないものを部品と読む**方向に倒れるので、
 *    見つからなければ `不明` を返し、**参考側**（落とさない側）へ寄せる。
 */
function enclosingTag(lines, index) {
  for (let i = index; i >= 0 && i > index - 12; i--) {
    const m = [...lines[i].matchAll(/<([A-Za-z][\w.]*)/g)].pop();
    if (m) return m[1];
  }
  return "不明";
}

function scan(sources) {
  const hits = [];
  for (const { file, text } of sources) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      const tag = enclosingTag(lines, i);
      const 部品 = CONTROL_TAGS.has(tag);
      for (const m of line.matchAll(PATTERN)) {
        hits.push({ file, line: i + 1, cls: m[1], tag, 部品, text: line.trim().slice(0, 90) });
      }
      for (const _m of line.matchAll(SPLIT_PATTERN)) {
        hits.push({ file, line: i + 1, cls: "h-（文字列を組み立てている）", tag, 部品, text: line.trim().slice(0, 90) });
      }
    });
  }
  return hits;
}

const files = globSync("{app,components}/**/*.tsx", { cwd: root });
const sources = files.map((file) => ({ file, text: readFileSync(resolve(root, file), "utf8") }));

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
let selfTestFailed = false;

// 🚨 **この囮は「探し方」しか検証していない**（2026-08-15・規律2 の追加を自分に当てた）。
//    囮は scan() に文字列を直接渡すので、**ディスクを読む経路（globSync）は通らない**。
//    ＝ **本命と同じ出どころではないが、本命の全経路も通っていない**。
//    実測: glob を壊すと **囮は「✅ 検出 1 件」のまま素通り**し、
//    落としたのは隣の「対象を拾えている **0 ファイル**」のほうだった。
//    → **囮と「対象が 0 なら落ちる」は、別々のものを守っている。両方要る。**
//      囮 = 探し方が当たっているか ／ 0 件ガード = そもそも読めているか
// 🚨 正の対照。「在るものが在ると出る」側だけが、探し方の正しさを保証する。
const decoy = scan([{ file: "decoy.tsx", text: `<div className="flex h-8 items-center" />` }]);
console.log(`  ${decoy.length === 1 ? "✅" : "❌"} 囮1: 素の h-8  → 検出 ${decoy.length} 件`);
if (decoy.length !== 1) selfTestFailed = true;

const decoy2 = scan([{ file: "decoy.tsx", text: `<div className="min-h-11" />` }]);
console.log(`  ${decoy2.length === 1 ? "✅" : "❌"} 囮2: 素の min-h-11  → 検出 ${decoy2.length} 件`);
if (decoy2.length !== 1) selfTestFailed = true;

// 誤検出を出さないこと（トークン記法・アイコン・コメント）。
const near = scan([
  { file: "n.tsx", text: `<div className="h-(--control-h) md:h-(--control-h-pc)" />` },
  { file: "n.tsx", text: `<Icon className="size-8" />` },
  { file: "n.tsx", text: `      // 🚨 素の h-8 を書き戻さない。` },
]);
console.log(`  ${near.length === 0 ? "✅" : "❌"} 囮3: トークン記法 / size- / コメント  → 誤検出 ${near.length} 件`);
if (near.length !== 0) selfTestFailed = true;

// 🚨 迂回の囮。実際にこれで素通りしていた（2026-08-15）。
const evade = scan([{ file: "d.tsx", text: `const c = "h-" + "8";` }]);
console.log(`  ${evade.length >= 1 ? "✅" : "❌"} 囮4: 文字列を組み立てて迂回  → 検出 ${evade.length} 件`);
if (evade.length < 1) selfTestFailed = true;

// 🚨 分類そのものにも囮を置く（2026-08-15）。
//    「部品か / 部品でないか」で落とす側を変えたので、**分類が壊れたら検査は静かに嘘をつく**
//    （画像を部品と読めば正しいコードを直させ、部品を画像と読めば違反を見逃す）。
//    両方向で確かめる。
const 分類囮 = scan([
  { file: "decoy-a.tsx", text: '<Input\n  className="h-8"\n/>' },
  { file: "decoy-b.tsx", text: '<img\n  className="h-10 w-auto"\n/>' },
]);
const 囮部品 = 分類囮.filter((h) => h.部品).length;
const 囮参考 = 分類囮.filter((h) => !h.部品).length;
console.log(`  ${囮部品 === 1 && 囮参考 === 1 ? "✅" : "❌"} 囮5: <Input h-8> は部品 / <img h-10> は部品でない  → 部品 ${囮部品} 件・参考 ${囮参考} 件`);
if (!(囮部品 === 1 && 囮参考 === 1)) selfTestFailed = true;

console.log(`  ${files.length > 0 ? "✅" : "❌"} 対象を拾えている  ${files.length} ファイル`);
if (files.length === 0) selfTestFailed = true;

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  process.exit(1);
}

// ── 判定 ─────────────────────────────────────────────────────
const hits = scan(sources);
const 部品 = hits.filter((h) => h.部品);
const 参考 = hits.filter((h) => !h.部品);

/**
 * 🚨 **採取した状態を出す**（2026-08-15）。
 * 行番号を「直してください」と配ったが、**共有ツリーは数分で動く**。
 * 実際に `left-sidebar.tsx` が編集中で、配った直後に行がずれた
 * （251 → 258／件数 7 → 6）。**HEAD と未コミットの有無を書かない一覧は、配れない。**
 */
let 採取 = "不明";
try {
  const { execFileSync } = await import("node:child_process");
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "apps/studio/app", "apps/studio/components"], {
    encoding: "utf8", cwd: resolve(root, "../.."),
  }).trim();
  const n = dirty ? dirty.split("\n").length : 0;
  採取 = `HEAD ${sha}` + (n ? ` 🚨 対象範囲に未コミット ${n} 件（**行番号は動きます**）` : "（対象範囲に未コミットなし）");
} catch { 採取 = "不明（git を引けませんでした）"; }

console.log(`\n■ 判定`);
console.log(`  採取: ${採取}`);
console.log(`  対象: ${files.length} ファイル（app/**, components/** の .tsx）`);
console.log(`  素の高さ指定: ${hits.length} 箇所 ／ うち**操作部品** ${部品.length} 箇所 ／ 参考（部品でない）${参考.length} 箇所`);

// 🚨 参考は**落とさないが、隠さない**。黙って除外すると、寄せたい帯が出ても気づけない。
if (参考.length > 0) {
  console.log(`\n  参考（操作部品ではないので落としません。画像・帯・器など）:`);
  for (const h of 参考) console.log(`    ${h.file}:${h.line}  ${h.cls}  <${h.tag}>`);
  console.log(`    🚨 この中に「本当は段へ寄せたいもの」が在れば、CONTROL_TAGS へタグ名を足してください。`);
}

if (部品.length === 0) process.exit(0);

console.error(`\n🚨 操作部品の高さを素の数字で書いています。**トークンを動かしても追随しません。**`);
for (const h of 部品) console.error(`  ${h.file}:${h.line}  ${h.cls}  <${h.tag}>\n      ${h.text}`);
console.error(
  "\n  直し方: `app/globals.css` の `--control-h-*` を Tailwind v4 の変数記法で引く" +
    "\n    例) h-(--control-h) md:h-(--control-h-pc)" +
    "\n  🚨 アイコンの大きさ（size-*）はここでは見ていない。**高さの話だけ**。",
);
process.exit(1);
