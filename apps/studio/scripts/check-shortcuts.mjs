#!/usr/bin/env node
/**
 * ショートカットが被っていないかを機械的に確かめる。
 *
 * 由来（堀池・2026-08-15 原文）:「ショートカットは**被ってはいけない**」
 *
 * 🚨 **人が一覧を眺めて確かめない。** 被りは「同じ組み合わせが2つある」だけなので
 *    目で見れば分かる、と思いがちだが、増えたときに必ず見落とす。
 *
 * 🚨 走るたびに **囮（decoy）を仕込んで、それを検出できることを確かめてから**判定を出す。
 *    そうしないと「被りが無いから緑」なのか「**検出できていないから緑**」なのかが
 *    区別できない（正規表現が古くなって1件も拾えていない、が一番危ない）。
 *    合わせて **拾えた件数**も出す（0 件のまま緑になっていないかを見るため）。
 *
 *   node scripts/check-shortcuts.mjs
 *
 * ── Tiptap 衝突検査（2026-08-15 追加）─────────────────────────────────
 * `components/admin/shortcuts.ts` の `toggleRightSidebar` に「`mod+i` にしない。WYSIWYG
 * （Tiptap）の斜体と衝突する」と書いてあるのに、それを守る仕組みが無かった（実測: このファイル
 * 旧版120行に `mod+i` / Tiptap / 衝突 は0件）。この節はそれを機械検査にする。
 *
 * 🚨 予約語（Tiptapが実際に登録しているキー）を手で一覧化しない。手書きの一覧は
 *    Tiptapを上げた日に嘘になる。`node_modules` の実体（Tiptap自身）を出典にする。
 *
 * 🚨 抽出でハマった実例（仕様書 `.temp/2026-08-15/spec-shortcut-editor-conflict.md` より）:
 *    - `apps/studio/node_modules/@tiptap` の直下には5本しか居ない
 *      （extension-image / extension-table / pm / react / starter-kit）。
 *      `extension-italic` はここに無い。
 *    - 残り25本は `starter-kit` の依存関係の先（bunの実体では `.bun/@tiptap+starter-kit@…`
 *      配下）にある。`starter-kit` は symlink なので、symlinkを辿らない `find` は0件を返す。
 *    - symlink先のディレクトリだけを歩いても、兄弟の `extension-italic` には届かない。
 *    → だから **パスを決め打ちせず、パッケージグラフ（package.json の dependencies /
 *      実際の import 文）から解決する**（`createRequire(...).resolve(name)`）。
 *      `.bun` のハッシュ付きディレクトリ名は検査に一切焼き込まない。
 *
 * 🚨 抽出できたことの確かめ方（受入基準の中核）: **抽出結果に `Mod-i` が含まれ、
 *    出所が `extension-italic` であること。** 含まれなければ「衝突が無い」ではなく
 *    「見ていない」なので、この検査自体を失敗させる（下の自己検査を参照）。
 *
 * 🚨 衝突が見つかっても、勝手に EXCEPTIONS へ入れて緑にしない。件数と中身をそのまま報告する。
 *    例外にするかどうかは堀池が決める（`TIPTAP_CONFLICT_EXCEPTIONS` は既定で空）。
 *
 * ── アプリ側の上書き検出（2026-08-15 追加）──────────────────────────
 * 上の Tiptap 衝突検査は `node_modules` の**既定値だけ**を見ているため、アプリが
 * `Extension.create({ addKeyboardShortcuts() { return { "Mod-Enter": () => true }; } })`
 * のように**既定を上書き**していても気づけない（衝突が実質解消していても「未決」と言い続ける）。
 *
 * 🚨 上書きを見つけても、この検査は判定（✅/🟡/🚨）を**勝手に変えない**。
 *    `decided` は司令塔（人）が決めるもの。ここは「上書きがある」という事実を追加で出すだけ。
 *
 * 🚨 上書きしているファイル名を決め打ちにしない。**未コミットの差分は変わりうる**ので、
 *    components 配下 / app 配下を毎回走査して見つける（対象範囲は check-i18n-hardcoded.mjs の
 *    trackedGlob("{app,components}" 配下の全 .ts/.tsx) と同じ考え方）。
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";
// 🚨 **中身も索引から読む**（一覧を `trackedGlob` にしただけでは足りない・2026-08-16）。
//    一覧だけ索引にすると「未追跡ファイル」の扉は閉まるが、
//    🚨 **追跡済みファイルの「まだ add していない編集」はそのまま読む**ので、
//    **他ペインの書きかけで、触っていない人のコミットが止まる**（toast が実測して見つけた）。
//    未追跡は `null` → 空にせず**飛ばす**か、呼ぶ側で 0 の顔を書くこと。
/** 索引から読む。未追跡は空（一覧は `trackedGlob` で絞ってあるので、通常は起きない）。 */
const readIndexed = (f, _enc) => readTracked(f) ?? "";

import {
  normalize,
  normalizeTiptapKey,
  extractFunctionBodies,
  extractModBindings,
  collectTiptapBindings,
  groupTiptapBindings,
  isExtractionHealthy,
  assertCombosUsable,
} from "./tiptap-combos.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "components/admin/shortcuts.ts";

/** `search: "mod+k",` の行を拾って { 名前: 組み合わせ } にする。 */
function parseShortcuts(source) {
  const entries = [];
  // SHORTCUTS の中だけを見る（formatShortcut の中の記号表を拾わないため）
  const start = source.indexOf("export const SHORTCUTS");
  const end = source.indexOf("} as const;", start);
  if (start === -1 || end === -1) return entries;
  const body = source.slice(start, end);
  for (const m of body.matchAll(/^\s*(\w+)\s*:\s*"([^"]+)"\s*,/gm)) {
    entries.push({ name: m[1], combo: m[2] });
  }
  return entries;
}

// 🚨 normalize() / normalizeTiptapKey() は tiptap-combos.mjs から import する（このファイルの
//    上部を参照）。実装をここへ複製しない — 複製すると node_modules の中身が変わったときに
//    片方だけ古くなる（このファイル冒頭コメント「なぜ」を参照）。

function findConflicts(entries) {
  const seen = new Map();
  const conflicts = [];
  for (const entry of entries) {
    const key = normalize(entry.combo);
    const previous = seen.get(key);
    if (previous) {
      conflicts.push({ combo: key, names: [previous, entry.name] });
    } else {
      seen.set(key, entry.name);
    }
  }
  return conflicts;
}

// ── Tiptap のキーバインドを node_modules の実体から抽出する ──────────────────
// 🚨 findPackageJsonNear() / extractFunctionBodies() / extractModBindings() /
//    collectTiptapBindings() / groupTiptapBindings() は tiptap-combos.mjs へ移設した
//    （このファイル冒頭コメント「なぜ」を参照）。ここでは import したものをそのまま使う。

/**
 * `components/**` と `app/**` から、Tiptap の `addKeyboardShortcuts()` をアプリ側で
 * 上書きしている箇所を集める（例: `Extension.create({ addKeyboardShortcuts() { return
 * { "Mod-Enter": () => true }; } } })` で既定の挙動を打ち消す）。
 *
 * 抽出ロジックは Tiptap 側の抽出（`extractFunctionBodies` / `extractModBindings`）を
 * そのまま再利用する。**ファイル名を決め打ちにしない**（未コミットの差分で変わりうるため、
 * 対象は毎回 glob で走査する）。
 */
function collectAppOverrides(studioRoot) {
  const files = trackedGlob("{app,components}/**/*.{ts,tsx}", { cwd: studioRoot }).sort();
  const map = new Map(); // normalized -> [{ raw, file }]
  for (const file of files) {
    const text = readIndexed(join(studioRoot, file), "utf8");
    for (const body of extractFunctionBodies(text, "addKeyboardShortcuts")) {
      for (const b of extractModBindings(body)) {
        if (b.dynamic) continue; // 動的な値は比較対象外（Tiptap側の抽出と同じ扱い）
        const norm = normalizeTiptapKey(b.raw);
        if (!map.has(norm)) map.set(norm, []);
        map.get(norm).push({ raw: b.raw, file });
      }
    }
  }
  return { map, fileCount: files.length };
}

/**
 * うちの SHORTCUTS と Tiptap のバインドを突き合わせる。
 * `TIPTAP_CONFLICT_EXCEPTIONS` に理由付きで載っている組み合わせは除外し、無いものだけ違反にする。
 */
function findTiptapConflicts(entries, tiptapMap, exceptions) {
  const violations = [];
  for (const entry of entries) {
    const norm = normalize(entry.combo);
    const hits = tiptapMap.get(norm);
    if (!hits || hits.length === 0) continue;
    if (exceptions[norm]) continue;
    violations.push({ name: entry.name, combo: entry.combo, normalized: norm, hits });
  }
  return violations;
}

// 🚨 ここに載っている組み合わせだけ、Tiptapと衝突していても違反にしない。
//    理由が無い衝突は違反。**堀池が「これは許容する」と決めたものだけ**、理由付きで追加すること
//    （check-nav-parity.mjs の EXCEPTIONS と同じ形）。既定は空 — 見つかった衝突を
//    このスクリプトが勝手に緑にしない。
const TIPTAP_CONFLICT_EXCEPTIONS = {
  // 🚨 この2件は、この検査を作った 2026-08-15 の時点で**既に衝突していた**。
  //    検査が新しく壊したのではなく、**今まで誰も見ていなかった**ものが見えた形。
  //    どちらも「実害の有無」を実測してから、reason を書き分けてある。
  "mod+b": {
    recordedAt: "2026-08-15",
    decided: false,
    decidedBy: "司令塔（w4A:p1P）",
    openQuestion:
      "🚨 **決定済み・未反映（2026-08-16）。** 284 の備考で堀池さんが決めた（原文）:" +
      "「ショートカットは**必要そうなものを、なるべくたくさん用意する**が、**初期は未設定" +
      "（ショートカットが空）でいい**。**もちろん重複はできない。**」" +
      "＝ 🚨 **既定でキーが割り当てられないので、この衝突はそもそも起きなくなる。**" +
      "当初ここに書いていた「(a) このまま残す / (b) 割り当てを変える」は、**どちらも要らなくなった**" +
      "（**譲る先のキーを選ぶ話が消えた**）。" +
      "🚨 **ただし、いまのコードはまだ `mod+b` を固定で割り当てている**ので、" +
      "**この行は実装が入るまで出し続ける**（決まったことと、直っていないことは別）。" +
      "実装後にここが見るべきものは「**利用者が割り当てるときに重複を弾けているか**」で、" +
      "その相手には **Tiptap の 18 本**（`tiptap-combos.mjs` の `tiptapCombos()`）も含める。",
    reason:
      "左サイドバーの開閉。Tiptap の Mod-b（太字）と当たるが、`left-sidebar.tsx` の " +
      "`useShortcut(SHORTCUTS.toggleLeftSidebar, …)` は `whileTyping` を立てていないので、" +
      "`use-shortcut.ts` の `isTyping()` が " +
      "`isContentEditable` を見て弾く。**編集中は発火しない**ので、" +
      "太字と同時に動くことはない。残るのは「編集中だけ効かない」という説明のしにくさで、" +
      "これは `mod+j` を選んだのと同じ理由（`toggleRightSidebar` の申し送り）。" +
      "動かすなら堀池の合意が要るので、いまは衝突を認めたうえで据え置く。",
  },
  "mod+enter": {
    recordedAt: "2026-08-15",
    decided: false,
    decidedBy: "司令塔（w4A:p1P）",
    openQuestion:
      "🚨 **こちらも決定済み・未反映（2026-08-16・284 の備考）。既定でキーを割り当てないので、" +
      "この衝突も起きなくなる**（詳細は `mod+b` 側に書いた。**同じことを 2 箇所に書かない**）。" +
      "🚨 **ただし実害の確認は済んでいて、いまのコードでも保存は動く**（下記の実測）。" +
      "🚨 **未測定の中身が変わった（2026-08-16 に読み直して判明）。** 当初ここには" +
      "「Tiptap の Mod-Enter と同時に動くかが未測定」と書いていたが、**それは既に測られていて、直っている**——" +
      "`rich-text-field.tsx` の `richTextReservedKeys` 拡張が `Mod-Enter: () => true`" +
      "（priority 1000）で Tiptap 側を止めており、" +
      "同ファイルに実測が残っている（原文「外す前は **保存されると同時に改行も入り**、" +
      "保存された doc JSON の末尾に hardBreak が 1 つ混ざっていた」）。" +
      "🚨 **その逆側（上書きを入れた後も「保存」が動いているか）を 2026-08-16 に実測した。結果: 動く。**" +
      "🚨 **訂正（同日）: 私は『確かめた記録が無い』と書いたが、それは誤り。記録は在った。**" +
      "コミット `665cbda`（2026-08-15）の**本文**に「**どちらも保存は成功（URL が /new から一覧へ）**」" +
      "と実測が書いてある。**私はファイル（`knowledge` / `docs` / `apps/studio`）だけを探して、" +
      "git の履歴を探していなかった**——「見ていない 0」を「記録が無い」と読んだ形。" +
      "🚨 **申し送りがコミット本文にしか無いと、ファイルを探す人には見えない。**" +
      "**だからここへ書き写す。** そのうえで 2026-08-16 に独立に測り直した" +
      "（ブラウザ・本物のキー入力・`zz_probe_actions` の編集画面・lang=ja）:" +
      "**本文（contenteditable）にカーソルを置いて ⌘Enter → `form#item-form` の submit が発火（4 回中 4 回）。" +
      "本文の HTML は押す前後で一致（＝ 改行は入らない）**。" +
      "🟢 対照(+): 本文の外（`input#field:title`）でも submit が発火（3 回中 3 回）。" +
      "🚨 🔴 陰性対照: 本文の中で **⌘B** を押すと submit **0 件**（3 回中 3 回）" +
      "——**この計器が 0 も 1 も出せる**ことの確認（全部 1 なら、計器が壊れていても同じ表示になる）。" +
      "🚨 **DB には 1 行も書いていない**（submit を capture で `preventDefault` し、`fetch` も遮断。" +
      "遮断した回の fetch は 0 件）。" +
      "→ **残っているのは「鍵をこのままにするか」だけで、実害の確認は済んでいる。**",
    reason:
      "保存。堀池の原文が「保存（⌘エンター）」と指定しているので、この検査の都合で動かさない。" +
      "🚨 ただし `mod+b` と違い、保存は `whileTyping: true` で登録されている" +
      "（`page-action.tsx` の `useShortcut(SHORTCUTS.save, …)`。**2026-08-16 訂正: ここには " +
      "`bug-report-composer.tsx` / `report-thread.tsx` も並べていたが、その 2 本が登録しているのは " +
      "`SHORTCUTS.submit` ＝ `mod+shift+enter` で、**別の鍵**。`mod+enter` を登録しているのは " +
      "`page-action.tsx` **1 本だけ**）ため、" +
      "**Tiptap の編集中でも発火する**。Tiptap 側の Mod-Enter は `exitCode`（@tiptap/core）と " +
      "`setHardBreak`（@tiptap/extension-hard-break）。**同時に動くかどうかは未測定**で、" +
      "WYSIWYG を実際に置いた画面での実測が要る。ここで承認しているのは「鍵を動かさない」ことだけで、" +
      "「実害が無い」ことではない。実測は別担当（この reason を根拠に閉じないこと）。",
  },
};

// check-nav-parity.mjs と同じ考え方: EXCEPTIONS の reason が「まだ直していない」の
// 言い訳になっていないかを確認する。
const UNFINISHED_WORDS = ["未対応", "未実装", "既知の差分", "TODO", "後で"];
function assertTiptapExceptionsAreDesignDecisions() {
  const offenders = [];
  for (const [combo, entry] of Object.entries(TIPTAP_CONFLICT_EXCEPTIONS)) {
    const hit = UNFINISHED_WORDS.find((word) => entry.reason?.includes(word));
    if (hit) offenders.push({ combo, hit, reason: entry.reason });
  }
  if (offenders.length === 0) return;
  console.error("check-shortcuts: FAIL — TIPTAP_CONFLICT_EXCEPTIONS の reason が「未完了」を示している\n");
  for (const { combo, hit, reason } of offenders) {
    console.error(`  ${combo}: 「${hit}」を含む reason は不可 → "${reason}"`);
  }
  process.exit(1);
}

// ── 迂回3種の診断（`SHORTCUTS` の値を直接リテラルで書かない場合、拾えるか）─────────────
// 🚨 受入基準どおり、SHORTCUTS.ts 自体は書き換えず、合成した「SHORTCUTS もどき」のソース文字列を
//    parseShortcuts() に食わせて確かめる。拾えないなら「拾えない」と明記する（黙って緑にしない）。
function checkEvasionPatterns() {
  const patterns = [
    {
      name: "変数経由",
      source: `export const SHORTCUTS = {\n  search: "mod+k",\n  toggleRightSidebar: modI,\n} as const;`,
    },
    {
      name: "文字列連結",
      source: `export const SHORTCUTS = {\n  search: "mod+k",\n  toggleRightSidebar: "mod+" + "i",\n} as const;`,
    },
    {
      name: "別ファイルから import",
      source: `import { MOD_I } from "./shortcuts-extra";\nexport const SHORTCUTS = {\n  search: "mod+k",\n  toggleRightSidebar: MOD_I,\n} as const;`,
    },
  ];
  const results = [];
  for (const p of patterns) {
    const entries = parseShortcuts(p.source);
    const caught = entries.some((e) => e.name === "toggleRightSidebar");
    results.push({ ...p, entries, caught });
  }
  return results;
}

const source = readIndexed(resolve(root, SOURCE), "utf8");
const entries = parseShortcuts(source);

assertTiptapExceptionsAreDesignDecisions();

// ── 自己検査 ─────────────────────────────────────────────────
console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");

let selfTestFailed = false;

// (1) そもそも拾えているか。0 件なら「被りが無い」ではなく「見ていない」。
const parsedOk = entries.length >= 2;
console.log(`  ${parsedOk ? "✅" : "❌"} 定義を拾えている  ${entries.length} 件`);
if (!parsedOk) {
  console.error("     ↑ 2 件未満しか拾えていない。SHORTCUTS の書き方が変わって正規表現が古い。");
  selfTestFailed = true;
}

// (2) 囮1: まったく同じ組み合わせを足す
const decoy1 = [...entries, { name: "__decoy_same", combo: entries[0]?.combo ?? "mod+k" }];
const found1 = findConflicts(decoy1).length;
console.log(`  ${found1 > 0 ? "✅" : "❌"} 囮1: 同じ組み合わせを足す  → 検出 ${found1} 件`);
if (found1 === 0) selfTestFailed = true;

// (3) 囮2: 修飾キーの**書き順だけ**を変えた同じ組み合わせ（見落としやすい形）
const submit = entries.find((e) => e.combo.includes("+shift+")) ?? entries[0];
const reordered = submit
  ? (() => {
      const parts = submit.combo.split("+");
      const key = parts.pop();
      return [...parts.reverse(), key].join("+");
    })()
  : "mod+k";
const decoy2 = [...entries, { name: "__decoy_reordered", combo: reordered }];
const found2 = findConflicts(decoy2).length;
console.log(
  `  ${found2 > 0 ? "✅" : "❌"} 囮2: 修飾キーの書き順だけ変える（${submit?.combo} → ${reordered}）  → 検出 ${found2} 件`,
);
if (found2 === 0) selfTestFailed = true;

// ── Tiptap 抽出 ───────────────────────────────────────────────
const { bindings: rawBindings, skipped: skippedPackages, visited } = collectTiptapBindings(root);
const { map: tiptapMap, literal: literalBindings, dynamic: dynamicBindings } = groupTiptapBindings(rawBindings);

console.log("\n■ 自己検査（Tiptap 抽出 — これが失敗していたら「衝突が無い」ではなく「見ていない」）");

// 🚨 isExtractionHealthy() も tiptap-combos.mjs から import する（このファイル冒頭を参照）。

// (4) 抽出そのものが機能しているか（0件なら壊れている）
const tiptapExtractedOk = isExtractionHealthy(literalBindings.length);
console.log(
  `  ${tiptapExtractedOk ? "✅" : "❌"} Tiptap のキーバインドを拾えている  ` +
    `raw ${rawBindings.length} 件 / リテラル ${literalBindings.length} 件 / 動的(比較対象外) ${dynamicBindings.length} 件 / ` +
    `一意な組み合わせ ${tiptapMap.size} 件（訪問パッケージ ${visited.length} 件）`,
);
if (!tiptapExtractedOk) {
  console.error("     ↑ 1 件も拾えていない。抽出が壊れている（パッケージ解決 or 正規表現が古い）。");
  selfTestFailed = true;
}

// (5) 受入基準の中核: Mod-i が extension-italic 出所で含まれているか
const modIHits = literalBindings.filter(
  (b) => b.raw.toLowerCase() === "mod-i" && b.pkgName === "@tiptap/extension-italic",
);
console.log(
  `  ${modIHits.length > 0 ? "✅" : "❌"} Mod-i が extension-italic 出所で含まれている  → ${modIHits.length} 件` +
    (modIHits.length > 0 ? ` (${modIHits.map((b) => b.raw).join(", ")})` : ""),
);
if (modIHits.length === 0) {
  console.error(
    "     ↑ Mod-i が見つからない。これは「衝突が無い」ではなく「見ていない」。抽出器を直すまでこの検査は信用できない。",
  );
  selfTestFailed = true;
}

// (6) 囮3: SHORTCUTS 側に、実在する Tiptap の組み合わせと同じ値を足す → 検出できるか。
//     italic 特化の偶然に頼らないよう、mod+i と「それ以外の1件」の2種で試す（rule: tiptap-conflict）。
const secondRealCombo = [...tiptapMap.keys()].find((k) => k !== "mod+i");
const decoyCombos = ["mod+i", secondRealCombo].filter(Boolean);
let decoy3AllDetected = true;
for (const combo of decoyCombos) {
  const decoy3 = [...entries, { name: `__decoy_tiptap_conflict_${combo}`, combo }];
  const found = findTiptapConflicts(decoy3, tiptapMap, TIPTAP_CONFLICT_EXCEPTIONS).length;
  console.log(
    `  ${found > 0 ? "✅" : "❌"} 囮3: SHORTCUTS 側に実在の Tiptap 組み合わせ（${combo}）を足す  → 検出 ${found} 件（rule: tiptap-conflict）`,
  );
  if (found === 0) decoy3AllDetected = false;
}
if (!decoy3AllDetected) selfTestFailed = true;

// (7) 囮4: 抽出が0件に壊れた状態を、実際の判定関数 isExtractionHealthy() に食わせて
//     ちゃんと「不健全」と出ることを確認する（RED）。あわせて今の実際の件数では
//     「健全」と出ることも確認する（GREEN・対照）。トートロジーにしないよう、
//     判定対象は本番と同じ純関数を使う。
const redHealthy = isExtractionHealthy(0);
const greenHealthy = isExtractionHealthy(literalBindings.length);
console.log(
  `  ${!redHealthy ? "✅" : "❌"} 囮4(RED): 抽出0件を模擬 → isExtractionHealthy(0) = ${redHealthy}（false が正しい。rule: tiptap-empty）`,
);
console.log(
  `  ${greenHealthy ? "✅" : "❌"} 対照(GREEN): 実際の件数 ${literalBindings.length} 件 → isExtractionHealthy() = ${greenHealthy}（true が正しい）`,
);
if (redHealthy || !greenHealthy) selfTestFailed = true;

// (8) 対照: 壊していない状態（実際の SHORTCUTS そのまま）で、衝突していない既知の組み合わせ
//     （search=mod+k / back=mod+arrowleft / toggleRightSidebar=mod+j）を過検出していないかを確かめる。
//     これが無いと「囮を入れると赤くなる」ことしか分からず、「何もしていないときに誤って赤くならない」
//     ことを確認していない。
const knownSafeNames = ["search", "back", "toggleRightSidebar"];
const realTiptapConflictNames = new Set(findTiptapConflicts(entries, tiptapMap, TIPTAP_CONFLICT_EXCEPTIONS).map((v) => v.name));
const falsePositives = knownSafeNames.filter((n) => realTiptapConflictNames.has(n));
console.log(
  `  ${falsePositives.length === 0 ? "✅" : "❌"} 対照: 衝突しないはずの ${knownSafeNames.join("/")} を誤検出していない  → 誤検出 ${falsePositives.length} 件`,
);
if (falsePositives.length > 0) {
  console.error(`     ↑ 過検出: ${falsePositives.join(", ")}`);
  selfTestFailed = true;
}

// ── assertCombosUsable の自己検査（返す値側の守りが本当に鳴るか）────────────────
// 由来（2026-08-16・shell の実測）: 旧版の守りは literal（入力側）だけを見ており、
// normalizeTiptapKey が壊れて map の鍵が null になっても throw しなかった
// （combos 18件・null の鍵1件・mod+i 欠落 のまま黙って返っていた）。
// tiptap-combos.mjs の assertCombosUsable() はそれを返す値（combos/map）側で見るように直した。
// ここではその守りが実際に鳴ることを確かめる。
//
// 🚨 囮は実物と同じ入口から入れる（司令塔の規律・2026-08-16「囮は実物と同じ入口から入れる」）。
//    内部配列へ push したり、判定を迂回して直接組み立てたりしない — 必ず assertCombosUsable() を
//    直接呼び、throw するかどうかで確かめる。
console.log("\n■ 自己検査（assertCombosUsable — 返す値側の守りが本当に鳴るか）");

function expectAssertCombosUsableThrows(label, args) {
  let threw = false;
  let message = "";
  try {
    assertCombosUsable(args);
  } catch (e) {
    threw = true;
    message = e.message;
  }
  console.log(
    `  ${threw ? "✅" : "❌"} 🔴 ${label} → throw すること` +
      (threw ? `  (${message.slice(0, 70)}…)` : "  throw しなかった"),
  );
  if (!threw) selfTestFailed = true;
}

// (12) 🔴 鍵に null が混じった集合
expectAssertCombosUsableThrows("鍵に null が混じった集合", {
  combos: new Set(["mod+i", null]),
  map: new Map([
    ["mod+i", [{ raw: "Mod-i", pkgName: "@tiptap/extension-italic" }]],
    [null, [{ raw: "Broken-key", pkgName: "@tiptap/extension-foo" }]],
  ]),
  literal: [{ raw: "Mod-i", pkgName: "@tiptap/extension-italic", dynamic: false }],
  visited: [],
  skipped: [],
});

// (13) 🔴 mod+i を欠いた集合（literal 側には Mod-i を「見えている」形にして、combos/map の側だけが
//      壊れている状況を再現する。これがまさに実測で見つかった穴 — literal だけを見る旧版の守りは
//      これを通してしまっていた）
expectAssertCombosUsableThrows("mod+i を欠いた集合（combos/map だけが壊れている）", {
  combos: new Set(["mod+k"]),
  map: new Map([["mod+k", [{ raw: "Mod-k", pkgName: "@tiptap/extension-something" }]]]),
  literal: [{ raw: "Mod-i", pkgName: "@tiptap/extension-italic", dynamic: false }],
  visited: [],
  skipped: [],
});

// (14) 🔴 空の集合
expectAssertCombosUsableThrows("空の集合", {
  combos: new Set(),
  map: new Map(),
  literal: [],
  visited: [],
  skipped: [],
});

// (15) 🟢 対照: 本物の抽出結果（実際に collectTiptapBindings/groupTiptapBindings で得た
//      tiptapMap/literalBindings をそのまま渡す）。これが throw したら、上の (12)〜(14) の
//      「鳴った」は「何でも鳴るだけ」であり、何も言っていない。
{
  const realCombos = new Set(tiptapMap.keys());
  let threw = false;
  let message = "";
  try {
    assertCombosUsable({
      combos: realCombos,
      map: tiptapMap,
      literal: literalBindings,
      visited,
      skipped: skippedPackages,
    });
  } catch (e) {
    threw = true;
    message = e.message;
  }
  console.log(
    `  ${!threw ? "✅" : "❌"} 🟢 対照: 本物の抽出結果 → throw しないこと` +
      (threw ? `  throw した (${message})` : ""),
  );
  if (threw) selfTestFailed = true;
}

// ── アプリ側の上書き検出 ─────────────────────────────────────────
const { map: appOverrideMap, fileCount: appScannedFileCount } = collectAppOverrides(root);

console.log("\n■ 自己検査（アプリ側の上書き検出 — components/**, app/** を走査する）");

// (9) そもそもアプリ側ソースを走査できているか。0 件なら「上書きが無い」ではなく「見ていない」。
const appScanOk = appScannedFileCount > 0;
console.log(
  `  ${appScanOk ? "✅" : "❌"} アプリ側ソースを走査できている  ${appScannedFileCount} 件（components/**, app/**）`,
);
if (!appScanOk) {
  console.error("     ↑ 0 件しか走査できていない。glob パターンかディレクトリ構成が変わった。");
  selfTestFailed = true;
}

// (10) 囮5(RED): メモリ上の合成ソース（実ファイルは書き換えない）に Mod-Enter の上書きを
//      仕込んで、検出できることを確かめる。検出件数を印字し、0 件なら失敗にする。
const decoyOverrideSource = [
  "Extension.create({",
  "  addKeyboardShortcuts() {",
  '    return { "Mod-Enter": () => true };',
  "  },",
  "})",
].join("\n");
const decoyOverrideBindings = extractFunctionBodies(decoyOverrideSource, "addKeyboardShortcuts")
  .flatMap((body) => extractModBindings(body))
  .filter((b) => !b.dynamic && normalizeTiptapKey(b.raw) === "mod+enter");
console.log(
  `  ${decoyOverrideBindings.length > 0 ? "✅" : "❌"} 囮5: 合成ソースに Mod-Enter の上書きを仕込む  → 検出 ${decoyOverrideBindings.length} 件`,
);
if (decoyOverrideBindings.length === 0) selfTestFailed = true;

// (11) 対照(GREEN): 上書きの無い合成ソースでは上書き 0 件と出ること（誤検出しない）。
const cleanAppSource = ["export function Foo() {", "  return null;", "}"].join("\n");
const cleanOverrideBindings = extractFunctionBodies(cleanAppSource, "addKeyboardShortcuts").flatMap((body) =>
  extractModBindings(body),
);
console.log(
  `  ${cleanOverrideBindings.length === 0 ? "✅" : "❌"} 対照: 上書きの無い合成ソースでは上書き 0 件  → 検出 ${cleanOverrideBindings.length} 件`,
);
if (cleanOverrideBindings.length !== 0) selfTestFailed = true;

if (skippedPackages.length > 0) {
  console.log(`\n  スキップしたパッケージ（root export が無い等・想定内）:`);
  for (const s of skippedPackages) {
    console.log(`    - ${s.name}: ${s.reason.split("\n")[0]}`);
  }
}

// ── 迂回3種の診断 ─────────────────────────────────────────────
console.log("\n■ 迂回3種の診断（SHORTCUTS.ts は書き換えず、合成ソースで parseShortcuts() を試す）");
for (const r of checkEvasionPatterns()) {
  if (r.caught) {
    console.log(`  ✅ ${r.name}: 拾えた（${JSON.stringify(r.entries.find((e) => e.name === "toggleRightSidebar"))}）`);
  } else {
    console.log(`  ⚠️  ${r.name}: 拾えない（parseShortcuts はリテラル文字列直書きしか見ない。設計上の既知の限界）`);
  }
}

// ── 本番の判定 ────────────────────────────────────────────────
const conflicts = findConflicts(entries);
const tiptapConflicts = findTiptapConflicts(entries, tiptapMap, TIPTAP_CONFLICT_EXCEPTIONS);

console.log(`\n■ ショートカット一覧（${SOURCE}）`);
for (const entry of entries) {
  console.log(`  ${entry.name.padEnd(20)} ${entry.combo}`);
}
console.log(`\n  被り（うち同士）: ${conflicts.length} 件`);
for (const c of conflicts) {
  console.error(`  🚨 ${c.combo} が ${c.names.join(" と ")} で重複`);
}

console.log(`\n■ Tiptap のキーバインド一覧（一意な組み合わせ ${tiptapMap.size} 件）`);
for (const [norm, hits] of tiptapMap) {
  console.log(`  ${norm.padEnd(20)} <- ${hits.map((h) => `${h.raw}(${h.pkgName})`).join(", ")}`);
}
if (dynamicBindings.length > 0) {
  console.log(`\n  動的で確定できない（比較対象外・別枠報告。値を静的に決め打ちしない）:`);
  for (const b of dynamicBindings) {
    console.log(`    ${b.raw} (${b.pkgName})`);
  }
}

console.log(`\n■ うち ${entries.length} 件それぞれの Tiptap 衝突判定`);
for (const entry of entries) {
  const norm = normalize(entry.combo);
  const hits = tiptapMap.get(norm);
  const hasHit = hits && hits.length > 0;
  const excepted = hasHit && TIPTAP_CONFLICT_EXCEPTIONS[norm];
  // 🚨 「承認済み」は「これでよい」ではなく「いま在ることを記録した」の意味。
  //    未決のものは**毎回そう出す**（黙って緑が続くと、決める人が居ることを誰も思い出さない）。
  const mark = !hasHit
    ? "✅ 衝突なし"
    : excepted
      ? excepted.decided === false
        ? "🟡 衝突あり（記録済み・**未決**）"
        : "🟡 衝突あり（例外承認済み）"
      : "🚨 衝突あり（未承認）";
  console.log(
    `  ${entry.name.padEnd(20)} ${entry.combo.padEnd(18)} ${mark}` +
      (hasHit ? `  ← ${hits.map((h) => `${h.raw}(${h.pkgName})`).join(", ")}` : ""),
  );
  // 🚨 上書きが見つかっても mark は変えない（decided は司令塔が決める）。事実の追記のみ。
  if (hasHit) {
    const overrideHits = appOverrideMap.get(norm);
    if (overrideHits && overrideHits.length > 0) {
      const overrideFiles = [...new Set(overrideHits.map((h) => h.file))];
      for (const f of overrideFiles) {
        console.log(`  ${" ".repeat(20)} ${" ".repeat(18)} 🔵 アプリ側で上書きあり: ${f}`);
      }
      // 承認済み(decided:true)は既に決着済みなので「閉じられる可能性」の案内は出さない。
      if (!excepted || excepted.decided === false) {
        console.log(
          `  ${" ".repeat(20)} ${" ".repeat(18)} → この未決は閉じられる可能性があります。決める人に確認してください`,
        );
      }
    }
  }
  if (excepted && excepted.decided === false) {
    console.log(
      `  ${" ".repeat(20)} ${" ".repeat(18)} 記録 ${excepted.recordedAt} / 決める人: ${excepted.decidedBy} / ${excepted.openQuestion}`,
    );
  }
}
console.log(`\n  Tiptap との衝突（未承認）: ${tiptapConflicts.length} 件`);
for (const v of tiptapConflicts) {
  console.error(
    `  🚨 ${v.name}(${v.combo}) が Tiptap の ${v.hits.map((h) => `${h.raw}(${h.pkgName})`).join(", ")} と衝突`,
  );
}

if (selfTestFailed) {
  console.error("\n🚨 自己検査に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
}

const totalConflicts = conflicts.length + tiptapConflicts.length;
process.exit(totalConflicts === 0 && !selfTestFailed ? 0 : 1);
