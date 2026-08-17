#!/usr/bin/env node
/**
 * ファイル配信の口が、**自分で** `nosniff` を決めていることをソースで確かめる。
 *
 * 由来: 2026-08-17。`next.config.ts` の `headers()` に既定を入れた（`646f604`・toast）ところ、
 * **受入の判定が鈍った**（saml が発見）。
 * `acceptance/checks/v1-b-storage.mjs` の nosniff の判定は応答ヘッダを見ているが、
 * **既定と自前が同じ値**なので、**storage の自前が消えても応答は 1 行のまま**＝ **緑のまま**。
 *
 * 🚨 **応答からは供給元を区別できない。** だから供給元＝ソースをここで見る。
 * 決定: `knowledge/decisions/layers-hide-each-others-regressions.md`
 *
 * 🚨 **存在は見ない。値だけ見る。**
 *    `contentTypeOptions` は型で必須にしてあるので（`lib/files/service.ts`）、
 *    **欄を消せば tsc が落ちる**（storage の指摘）。ここが重ねて見る必要は無い。
 *
 * 🚨 **2026-08-17 時点、この検査は門（lefthook）に入っていない。＝ 誰も回さない。**
 *    置いてあるだけでは「異常が無い 0」ではなく **「見ていない 0」** を作る。
 *    確かめたいときは **手で回すこと**: `node scripts/check-nosniff-source.mjs`
 *    （門に入れるかは司令塔の判断待ち。入ったら**この段落を消すこと**——
 *      残すと、今度はこの但し書きのほうが嘘になる）。
 *
 * ## 🚨 この検査が見ていないもの（出力にも同じものを印字する）
 * 1. **ソースしか見ない。** 実行時に別の層が上書きしても分からない。
 * 2. **口を名指しで持っている。** 3 つ目の口が増えても、この検査は何も言わない。
 *    → だから **名指しの先が索引に無ければ「見ていない」として落とす**（黙って緑にしない）。
 * 3. **`next.config.ts` の既定が消えても緑のまま。** 見ているのは自前の側だけ。
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTracked } from "./lib/tracked-files.mjs";
import { stripComments } from "./strip-comments.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 見る口。**ここに書いてあるものしか見ていない**（上の「見ていないもの」2 番）。
 *
 * 🚨 `re` は**コメントを外したソース**に当てる。
 *    経緯を書いたコメントを根拠に緑にしない／違反にしないため。
 */
const TARGETS = [
  {
    path: "lib/files/service.ts",
    what: "値を決めている側",
    // 🚨 プロパティ名の直後が `:` であることまで見る（部分一致で終わらせない）。
    re: /\bcontentTypeOptions\s*:\s*"nosniff"/,
    expected: 'contentTypeOptions: "nosniff"',
    why: "ここが実際の値を決める。既定が消えても、ファイル配信だけは自分で守れる状態を保つ。",
  },
  {
    path: "app/api/assets/[id]/route.ts",
    what: "応答へ載せている側",
    // 🚨 リテラルで書き直されていないこと（= 決めた値がそのまま載っていること）を見る。
    re: /"X-Content-Type-Options"\s*:\s*\w[\w.$]*\.contentTypeOptions\b/i,
    expected: '"X-Content-Type-Options": <asset>.contentTypeOptions',
    why: "ここが自前でリテラルを書くと、service.ts の判断が壁に当たらず落ちる（値は同じなので気づけない）。",
  },
];

const BLIND_SPOTS = [
  "ソースしか見ていない（実行時に別の層が上書きしても分からない）",
  "口を名指しで持っている（3 つ目の口が増えても、この検査は何も言わない）",
  "next.config.ts の既定が消えても緑のまま（見ているのは自前の側だけ）",
];

const failures = [];
const passed = [];

for (const t of TARGETS) {
  const abs = resolve(root, t.path);
  const source = readTracked(abs);
  if (source === null) {
    // 🚨 名指しの先が索引に無い＝「違反が無い」ではなく「見ていない」。黙って緑にしない。
    failures.push(`${t.path} … 索引に無い（改名・削除・未 add）。この検査は ${t.what} を見ていません`);
    continue;
  }
  if (t.re.test(stripComments(source))) passed.push(`${t.path}（${t.what}）`);
  else failures.push(`${t.path} … ${t.what} が見つからない。期待: ${t.expected}\n      理由: ${t.why}`);
}

console.log(`nosniff を自前で決めている口: ${passed.length} / ${TARGETS.length}`);
for (const p of passed) console.log(`  🟢 ${p}`);

console.log("\n□ この検査が見ていないもの");
for (const b of BLIND_SPOTS) console.log(`  ・${b}`);

if (failures.length > 0) {
  console.error(`\n■ ファイル配信の自前 nosniff が見つからない: ${failures.length} 件`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("\n  🚨 応答は既定（next.config.ts）が同じ値を入れるので、消しても画面からは気づけません。");
}

process.exit(failures.length === 0 ? 0 : 1);
