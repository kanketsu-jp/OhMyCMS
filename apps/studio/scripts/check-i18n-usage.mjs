#!/usr/bin/env node
/**
 * コードが呼んでいる辞書キーと、辞書に定義されているキーを突き合わせる。
 *
 *   - 呼んでいるのに辞書に無いキー  → 画面にキー文字列が出る（不具合）
 *   - 辞書にあるのに誰も呼ばないキー → 死んだ翻訳（掃除対象。警告のみ）
 *
 * 名前空間を解決する: `const t = await getT("files")` / `const t = useT("files")` の
 * 束縛を拾い、その変数で呼ばれた `t("title")` を `files.title` として突き合わせる。
 * 名前空間なし（`getT()` / `useT()`）ならキーをそのまま使う。
 *
 *   node scripts/check-i18n-usage.mjs
 */

import { resolve } from "node:path";
import { ROOT as root, flatten, loadDictionary } from "./i18n-load.mjs";
import { stripComments } from "./strip-comments.mjs";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";

// 辞書は名前空間ごとのファイル。組み立ては i18n-load.mjs に集約している。
const defined = flatten(loadDictionary("ja"));

const files = trackedGlob("{app,components}/**/*.{tsx,ts}", { cwd: root }).sort();

const used = new Map(); // "ns.key" -> [{file, line}]
const missing = [];
const dynamic = []; // 静的に解決できない呼び出し

for (const file of files) {
  // 🚨 コメントを潰してから探す。潰さないと両方向に壊れる（2026-08-16 実測）:
  //    ・JSDoc に書いた使用例 `t("…")` を「呼んでいるのに辞書に無い」として **exit=1**
  //      → 例を書いた 1 人が、全員のコミットを止める
  //    ・コメントに鍵を書くと「使われている」に数えられ、**死んだ鍵が掃除候補から消える**
  //      （実測: 未使用 20 → 19。**exit は 0 のまま**なので誰も気づけない）
  //    後者のほうが重い（前者はうるさいだけ、後者は黙って隠す）。
  //    行番号は保たれる（stripComments は空白へ潰すだけ）ので、報告の file:line は変わらない。
  // 🚨 **中身も索引から読む**（2026-08-16・toast）。`trackedGlob` は「**どのファイルを見るか**」
  //    しか索引にしておらず、**中身は作業ツリー**のままだった。
  //    実測: 追跡済みのファイルを **staged にせず**書き換えると exit=1
  //    ＝ **他ペインの、まだ add していない編集で、全員のコミットが止まる**。
  //    `readTracked` は索引と中身が同じファイルはディスクから読む（`git show` を起動しない）ので、
  //    速度は変わらない。
  const source = stripComments(readTracked(resolve(root, file)) ?? "");

  // 1) 名前空間の束縛を集める: const X = await getT("ns") / const X = useT("ns")
  //    名前空間なしの場合は "" を入れる。
  const scopes = new Map();
  const bindingRe =
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:getT|useT)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g;
  let m;
  while ((m = bindingRe.exec(source)) !== null) {
    scopes.set(m[1], m[2] ?? "");
  }
  if (scopes.size === 0) continue;

  // 2) 束縛された変数での呼び出しを集める: X("key")
  for (const [variable, namespace] of scopes) {
    const callRe = new RegExp(`\\b${variable}\\(\\s*([^)]*?)\\s*[,)]`, "g");
    let c;
    while ((c = callRe.exec(source)) !== null) {
      const arg = c[1];
      const line = source.slice(0, c.index).split("\n").length;

      // 単純な文字列リテラルか？（テンプレートリテラルの ${...} は動的扱い）
      const literal = /^(["'`])([^"'`]+)\1$/.exec(arg);
      if (!literal || literal[2].includes("${")) {
        // `t(\`locale_${x}\`)` や `t(item.labelKey)` のような動的キーは
        // 静的解析では解決できない。名前空間ごと「動的」に印を付け、
        // 誤検出（missing / unused）を出さずに一覧だけ残す。
        if (arg) dynamic.push({ namespace, arg, file, line });
        continue;
      }

      const key = namespace ? `${namespace}.${literal[2]}` : literal[2];
      if (!used.has(key)) used.set(key, []);
      used.get(key).push({ file, line });
      if (!defined.has(key)) missing.push({ key, file, line });
    }
  }
}

/** 動的キーが使われた名前空間。ここ配下は「未使用」と断定できない。 */
const dynamicNamespaces = new Set(dynamic.map((d) => d.namespace).filter(Boolean));

// 🚨 `lib/admin/page-meta.ts` は**辞書キーを文字列として持つ**ので、
//    上の静的解析（`t("…")` の形を探す）では**1件も見えない**。
//    見えないまま放置すると、存在しないキーを書いても誰も気づかない
//    （実際に `files.description` を書いてしまい、手で確かめて見つけた。2026-08-15）。
//    ここで実在を確かめる。**パンくず・右サイドバー・Storybook・LLM が読む定数なので、
//    キーが死んでいると画面にキー文字列がそのまま出る。**
// 🚨 `lib/admin/page-actions.ts`（アクションボタンの定義）も**同じ形**で
//    辞書キーを文字列として持つ。ここへ足しておかないと、生きているキーが
//    下の「未使用・掃除候補」に並び、**次の人が消す**（page-meta.ts と同じ穴）。
//    構造そのもの（form の id が実在するか等）は `scripts/check-page-actions.mjs` が見る。
const metaPath = resolve(root, "lib/admin/page-meta.ts");
const actionsPath = resolve(root, "lib/admin/page-actions.ts");
let metaKeys = new Set();
const metaMissing = [];
if (readTracked(metaPath) !== null) {
  const metaSrc = readTracked(metaPath) ?? "";
  const actionSrc = readTracked(actionsPath) ?? "";
  metaKeys = new Set([
    ...[...metaSrc.matchAll(/(?:titleKey|descriptionKey):\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...metaSrc.matchAll(/sectionKeys:\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])),
    ...[...actionSrc.matchAll(/labelKey:\s*"([^"]+)"/g)].map((m) => m[1]),
  ]);
  for (const full of metaKeys) {
    const i = full.indexOf(".");
    const ns = full.slice(0, i);
    const key = full.slice(i + 1);
    for (const locale of ["ja", "en"]) {
      const file = resolve(root, `i18n/messages/${locale}/${ns}.json`);
      if (readTracked(file) === null) { metaMissing.push(`${full} (${locale}: 名前空間が無い)`); continue; }
      const dict = JSON.parse(readTracked(file) ?? "{}");
      if (!(key in dict)) metaMissing.push(`${full} (${locale}: キーが無い)`);
    }
  }
  console.log(
    `page-meta.ts ＋ page-actions.ts のキー: ${metaKeys.size} 件（ja/en の両方で実在を確認）`,
  );
  if (metaMissing.length > 0) {
    console.error("\n■ page-meta.ts / page-actions.ts が実在しないキーを指している");
    for (const x of metaMissing) console.error(`  ${x}`);
  }
}


const unused = [...defined]
  .filter((k) => !used.has(k))
  // 🚨 `page-meta.ts` が持つキーは**使われている**。静的解析からは見えないだけ。
  //    ここで除かないと「未使用・掃除候補」に生きたキーが並び、**次の人が消す**
  //    （2026-08-15。パンくずが読んでいる 37 キーが掃除候補に出ていた）。
  .filter((k) => !metaKeys.has(k))
  .filter((k) => !dynamicNamespaces.has(k.split(".")[0]))
  .sort();

/**
 * 「出番待ち」— **使う先がまだ書かれていないと分かっている**キー。
 *
 * 🚨 **除外しない。数からも引かない。** 未使用の一覧を「出番待ち」と「未分類」に**割るだけ**。
 *    理由: 未使用が 25 件あって、そのうち 9 件が**意図して置いたもの**だと、
 *    **本当に死んでいる 1 件が読まれなくなる**。赤が習慣になると、本物が埋もれる。
 *
 * 🚨 **接頭辞で一括りにしない**（`license.*` のような書き方をしない）。
 *    一括りにすると、**あとで足された死んだキーまで黙って「出番待ち」に入ります**。
 *
 * 🚨 **この表自身が腐るので、腐りを下で検出する**（出番待ちなのに使われている／辞書に無い）。
 */
const PARKED = {
  // `docs/design/license-keys.md` §11-1「スコープは `lib/` と CLI まで。API ルートは作らない」。
  // `docs/index.md:13` も「課金/プラン/UI は対象外」と書いている。
  // ＝ 画面が無いので呼ばれない。**先に文言だけ置いた**（地ならし）。
  "license.error_license_bad_signature": "license-keys.md §11-1 / 画面は v1 の対象外",
  "license.error_license_device_limit": "license-keys.md §11-1 / 画面は v1 の対象外",
  "license.error_license_device_mismatch": "license-keys.md §11-1 / 画面は v1 の対象外",
  "license.error_license_expired": "license-keys.md §11-1 / 画面は v1 の対象外",
  "license.error_license_malformed": "license-keys.md §11-1 / 画面は v1 の対象外",
  "license.error_license_public_key_missing": "license-keys.md §11-1 / 画面は v1 の対象外",
  "license.error_license_revocation_stale": "license-keys.md §11-1 / 画面は v1 の対象外",
  "license.error_license_revoked": "license-keys.md §11-1 / 画面は v1 の対象外",
  "license.error_license_signing_key_missing": "license-keys.md §11-1 / 画面は v1 の対象外",
};

const parkedKeys = new Set(Object.keys(PARKED));
const unusedParked = unused.filter((k) => parkedKeys.has(k));
const unusedUnclassified = unused.filter((k) => !parkedKeys.has(k));

/** 🚨 表の腐り。**「出番待ちに書いてあるのに、もう未使用ではない」**＝ 出番が来たので表から外す番。 */
const parkedNowUsed = [...parkedKeys].filter((k) => defined.has(k) && used.has(k)).sort();
/** 🚨 表の腐り。**「出番待ちに書いてあるのに、辞書に無い」**＝ キーが消えたので表から外す番。 */
const parkedMissing = [...parkedKeys].filter((k) => !defined.has(k)).sort();

/** 動的キーの名前空間配下で、静的には未使用に見えるもの（＝動的に引かれている想定）。 */
const coveredByDynamic = [...defined]
  .filter((k) => !used.has(k))
  .filter((k) => dynamicNamespaces.has(k.split(".")[0]))
  .sort();

console.log(`辞書に定義されたキー: ${defined.size}`);
console.log(`コードが呼んでいるキー（静的に解決できたもの）: ${used.size}`);
console.log(`呼んでいるのに辞書に無い: ${missing.length}`);
// 🚨 内訳の合計が元の数と一致することを、読む人がその場で確かめられるように並べる。
console.log(
  `辞書にあるのに未使用: ${unused.length}`
    + `（＝ 出番待ち ${unusedParked.length} ＋ 未分類 ${unusedUnclassified.length}）`,
);
console.log(`動的キーの呼び出し箇所: ${dynamic.length}（配下 ${coveredByDynamic.length} キーは静的検証の対象外）`);

if (dynamic.length > 0) {
  console.log("\n□ 静的に解決できない呼び出し（ブラウザ確認で担保すること）");
  for (const d of dynamic) {
    console.log(`  ${d.file}:${d.line}  ${d.namespace || "(名前空間なし)"} ← ${d.arg}`);
  }
  console.log("  → この名前空間配下で静的に未使用に見えるキー:");
  for (const key of coveredByDynamic) console.log(`     ${key}`);
}

if (missing.length > 0) {
  console.error("\n■ 呼んでいるのに辞書に無いキー（画面にキー文字列が出る）");
  for (const x of missing) {
    console.error(`  ${x.file}:${x.line}  ${x.key}`);
  }
}
if (unusedUnclassified.length > 0) {
  console.warn(`\n□ 辞書にあるのに未使用のキー・未分類（警告のみ・掃除候補）: ${unusedUnclassified.length}`);
  console.warn("  🚨 「まだ画面が無いだけ」なら、上の PARKED に理由つきで足すこと（消す前に）。");
  for (const key of unusedUnclassified) console.warn(`  ${key}`);
}
if (unusedParked.length > 0) {
  console.log(`\n□ 出番待ち（意図して置いてある。掃除候補ではない）: ${unusedParked.length}`);
  for (const key of unusedParked) console.log(`  ${key}  ← ${PARKED[key]}`);
}
// 🚨 「出番待ち」の表そのものが腐っていないか。0 件でも黙らず、腐っていたら必ず出す。
if (parkedNowUsed.length > 0) {
  console.warn(`\n□ 出番待ちに書いてあるが、もう使われているキー: ${parkedNowUsed.length}`);
  console.warn("  → 出番が来た。PARKED から外すこと。");
  for (const key of parkedNowUsed) console.warn(`  ${key}`);
}
if (parkedMissing.length > 0) {
  console.warn(`\n□ 出番待ちに書いてあるが、辞書に無いキー: ${parkedMissing.length}`);
  console.warn("  → キーが消えた。PARKED から外すこと。");
  for (const key of parkedMissing) console.warn(`  ${key}`);
}

// 未使用は警告どまり。呼び出し側の欠けだけを失敗にする。
process.exit(missing.length === 0 && metaMissing.length === 0 ? 0 : 1);
