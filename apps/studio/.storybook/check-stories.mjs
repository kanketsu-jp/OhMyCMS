#!/usr/bin/env node
/**
 * Storybook の整合性チェック(コミット前用)。
 *
 * idea.md:
 *   「Props が変わったり、共通コンポーネントに昇格するなどして削除・移管する時はもちろん合わせる。
 *     これは Lefthook などでコミット前にエラーとしてわかるようにする。」
 *
 * ここでやるのは **速いものだけ**。`storybook build` は数十秒かかるので pre-commit には置かない
 * (CI 向き。判断の根拠は F7 の報告に書いた)。
 *
 * 検査する3つ:
 *   1. components/ui/*.tsx に対応する stories/components/*.stories.tsx があるか
 *   2. story が実装を import しているか(中身をコピーしていないか = F7 の要件そのもの)
 *   3. 逆向き: 実装が消えたのに story だけ残っていないか
 *
 * 使い方: node .storybook/check-stories.mjs   (cwd は apps/studio)
 * 失敗したら exit 1。
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const UI_DIR = "components/ui";
const STORY_DIR = "stories/components";

/** story ファイルが実装を指しているとみなす import の書き方。 */
const IMPORT_PATTERNS = [/@\/components\/ui\//, /\.\.\/\.\.\/components\/ui\//];

const errors = [];

if (!existsSync(UI_DIR)) {
  console.error(`[storybook:check] ${UI_DIR} が見つかりません。cwd は apps/studio ですか？`);
  process.exit(1);
}

const components = readdirSync(UI_DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => f.replace(/\.tsx$/, ""))
  .sort();

const stories = existsSync(STORY_DIR)
  ? readdirSync(STORY_DIR)
      .filter((f) => f.endsWith(".stories.tsx"))
      .map((f) => f.replace(/\.stories\.tsx$/, ""))
      .sort()
  : [];

// 1. 実装に対応する story があるか
for (const name of components) {
  if (!stories.includes(name)) {
    errors.push(
      `story がありません: ${UI_DIR}/${name}.tsx → ${STORY_DIR}/${name}.stories.tsx を作ってください`,
    );
  }
}

// 3. 実装が消えたのに story が残っていないか
for (const name of stories) {
  if (!components.includes(name)) {
    errors.push(
      `実装がありません: ${STORY_DIR}/${name}.stories.tsx が指す ${UI_DIR}/${name}.tsx は存在しません。story を消すか移してください`,
    );
  }
}

// 2. story が実装を import しているか(コピーしていないか)
for (const name of stories) {
  if (!components.includes(name)) continue;
  const source = readFileSync(join(STORY_DIR, `${name}.stories.tsx`), "utf8");
  if (!IMPORT_PATTERNS.some((re) => re.test(source))) {
    errors.push(
      `実装を import していません: ${STORY_DIR}/${name}.stories.tsx。` +
        `story にコンポーネントを書き写さず、components/ui/${name}.tsx を import してください`,
    );
  }
}

if (errors.length > 0) {
  console.error("[storybook:check] 失敗");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `[storybook:check] OK — 共通UI ${components.length} 件すべてに story があり、すべて実装を import しています`,
);
