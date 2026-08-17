#!/usr/bin/env node
/**
 * パンくずの読み上げ名が、**見えている文字（ページ名）から作られている**ことを守る。
 *
 * なぜこれだけ検査にするか:
 *   このリポジトリの「〜しない」という約束は数えたら 20 件あり、守り手を名指しできたのは 3 件だった。
 *   残りは願望だが、**破れば画面で分かる**ものがほとんど（線が出る・薄くなる・ボタンになる）。
 *   🚨 **例外がここ。** `aria-label` を足す事故だけは**画面から見えない**——
 *   読み上げ名だけが静かに壊れ、次に AX ツリーを採る人が現れるまで誰も気づかない。
 *   （2026-08-15。実際に AX ツリーで「読み上げ名にスラッシュが入っていない」ことを確かめた状態を守る）
 *
 * 🚨 これは**静的な代理**であって、読み上げ名そのものを測ってはいない。
 *    本物は CDP の Accessibility.getPartialAXTree で採る（probe-crumb-slash.mjs）。
 *    ここで見るのは「壊す書き方が入っていないか」だけ。**そう書いてある**と**そうでないと通らない**の
 *    後者に近づけるための最低限。
 *
 * 🚨 **この守り手が見ていない範囲**
 *
 * 🚨 **【鳴る】走らせるたびに、実際に見逃す形を作って通し、その一覧を出す。**
 *    塞がったら「死角の記述が古くなっています」と鳴る。**一覧はここに書かない**——
 *    書くと 2 箇所になり、片方が必ず腐る（司令塔 2026-08-16）。**出力が正**。
 *
 * 🚨 **【書いただけ】以下は、道具では確かめていない**（作れない・作っていない）:
 *    ・**アイコンの中身**（`SlashIcon` が本当に「/」を描くか）→ 静的には見えない
 *    ・**実行時の読み上げ名そのもの** → 静的には採れない。本物は
 *      `scratchpad/probe-crumb-name.mjs` が Accessibility.getPartialAXTree から採る
 *    ・**この検査が走る cwd** → `apps/studio` 以外だと読めずに落ちる（**黙って通ることは無い**）
 *
 * 落とす条件:
 *   ① 引き金のボタンに `aria-label` **または `aria-labelledby`** がある（見えている文字を打ち消す。WCAG 2.5.3）
 *   ② 引き金のボタンに props の **spread（`{...}`）** がある（中身が見えないので隠して渡せる）
 *   ③ 記号のアイコン（Ellipsis / Slash）が **`aria-hidden="true"` になっていない**
 *      （**有無ではなく値**を見る。`"false"` は在るのに隠していない）
 *   ④ 🚨 **対象そのものを見つけられない**（＝この検査が何も見ていない状態。**通さずに落とす**）
 *
 * 🚨 ①②③ は、最初に作ったとき**素通りできた**（2026-08-15 実測。いずれも exit 0 だった）。
 *    司令塔の「自分の検査は迂回できないか当ててみろ」に従って自分で試したら見つかった。
 *    **迂回できる形を残すと、検査は在るだけで守っていない。**
 */
import { readTracked } from "./lib/tracked-files.mjs";

const FILE = "components/admin/breadcrumbs.tsx";
const problems = [];
const checked = [];

let src;
// 🚨 **索引から読む**（作業ツリーではない）。
//    由来（2026-08-16・polish の実事故）: 作業ツリーを読む道具が、**他人の編集中のファイル**を
//    拾い、**事実でない数**（「3 件」／索引では 2 件）を出した。
//    この検査は 1 ファイルしか読まないが、**その 1 ファイルを誰かが編集中なら同じことが起きる**。
//    🚨 走査型（突き合わせる相手が居ない）ので、索引に絞っても「片側だけ」にはならない。
try {
  src = readTracked(FILE);
  if (src === null) throw new Error("索引に無い");
} catch {
  // 🚨 **「読めなかった」を「守られていない」と書かない。**
  //    以前は「誰も守っていません」と出していたが、**それは確かめていないこと**。
  //    リポジトリ直下から走らせただけで、この文言が出ていた（実測）。
  //    読んだ人は**存在しない穴を探しに行く**（正しい対処は `cd apps/studio`）。
  console.error(
    `🚨 この検査を実行できませんでした（${FILE} を読めない）。\n` +
      `   いまの cwd: ${process.cwd()}\n` +
      `   考えられる原因:\n` +
      `     ① **走らせた場所が違う** … この検査は apps/studio から走らせる（いちばん多い）\n` +
      `     ② ファイルが移動・改名された … その場合は FILE の指定を直す\n` +
      `   🚨 **これは「守りが壊れている」ではありません。** 守りが効いているかは、**まだ何も分かっていません**。`,
  );
  process.exit(1);
}

// ── 対象を切り出す: DropdownMenuTrigger の中の <Button …> 開きタグ
const trigger = /<DropdownMenuTrigger[^>]*>([\s\S]*?)<\/DropdownMenuTrigger>/.exec(src);
if (!trigger) {
  console.error(
    `🚨 ${FILE} に DropdownMenuTrigger が見つかりません。\n` +
      `   構造が変わったか、パンくずがボタンでなくなったかです。\n` +
      `   **見つからないまま通すと、この検査は「何も見ていない緑」になります**ので落とします。`,
  );
  process.exit(1);
}
checked.push("DropdownMenuTrigger の中身を切り出した");

const buttonTag = /<Button\b[^>]*>/.exec(trigger[1]);
if (!buttonTag) {
  console.error(
    `🚨 ${FILE} の DropdownMenuTrigger の中に <Button> がありません。\n` +
      `   **対象が取れていないので落とします**（「異常が無い 0」と「見ていない 0」を区別するため）。`,
  );
  process.exit(1);
}
checked.push("引き金の <Button> の開きタグを取れた");

/**
 * 規則の本体。**任意のソース片に当てられる形**にしてある。
 * 🚨 こうしておかないと「囮」で自己検査できない——
 *    規則が壊れて何も検出しなくなっても、対象さえ見つかれば緑になる。
 *    （司令塔の決め: **囮は「探し方が当たっているか」、0 件ガードは「そもそも読めているか」。両方要る**）
 */
function inspect(triggerBody, buttonTag, where) {
  const found = [];
  // 🚨 **拾った実物を必ず添える**（司令塔 2026-08-16）。
  //    数と説明だけだと、**なぜそう判定したかを他人が確かめられない**。
  //    今日「12 か 10 か」が 3 回ひっくり返った原因は、出力が件数だけだったこと。
  //    行を出せば `?.` のような書き方の違いが目に入る（数を見ていても入らない）。
  const 実物 = (s) => `\n    実物: ${String(s).replace(/\s+/g, " ").trim().slice(0, 120)}`;
  // ① 引き金が読み上げ名を上書きしていないこと
  // 🚨 `aria-label` だけを見ていたら **`aria-labelledby` で素通りできた**（2026-08-15 実測）。
  for (const attr of ["aria-label", "aria-labelledby"]) {
    if (new RegExp(`\\b${attr}\\b`).test(buttonTag)) {
      found.push(
        `${where}: パンくずの引き金に ${attr} があります。\n` +
          `    読み上げ名が**見えているページ名を打ち消します**（WCAG 2.5.3 label in name）。\n` +
          `    補足は <span className="sr-only"> で**足して**ください（打ち消しません）。` +
          実物(buttonTag),
      );
    }
  }
  // 🚨 spread の中身はこの検査から見えない。**見えないものを通さない**
  if (/\{\s*\.\.\./.test(buttonTag)) {
    found.push(`${where}: 引き金に props の spread（{...}）があります。中身が見えないので aria-label を隠せます。` + 実物(buttonTag));
  }
  // ② 記号のアイコンが aria-hidden="true" であること
  for (const icon of ["EllipsisIcon", "SlashIcon"]) {
    const tag = new RegExp(`<${icon}\\b[^>]*>`).exec(triggerBody);
    if (!tag) {
      found.push(`${where}: ${icon} が引き金の中に見つかりません。文字に戻すと読み上げに記号が混ざります。` + 実物(triggerBody));
      continue;
    }
    // 🚨 **有無ではなく値を見る。** `aria-hidden="false"` は在るのに隠していない（2026-08-15 実測）。
    if (!/aria-hidden\s*=\s*["{]?\s*(?:true|"true")/.test(tag[0])) {
      found.push(`${where}: ${icon} が aria-hidden="true" になっていません（属性が無い／値が true でない）。` + 実物(tag[0]));
    }
  }
  // ③ 🚨 **ページ名そのものが在り、隠されていないこと**（2026-08-16 追加）
  //    由来: 「見逃す入力を作って通す」で、**6/6 見逃していた**うちの 2 つがこれだった。
  //    ページ名が消える／`aria-hidden` になると、**読み上げ名からページ名が消える**——
  //    この検査が守ろうとしているものそのものが、素通りしていた。
  const 名 = /<BreadcrumbPage\b[^>]*>/.exec(triggerBody);
  if (!名) {
    found.push(
      `${where}: 引き金の中に <BreadcrumbPage> がありません。` +
        `\n    読み上げ名から**ページ名が消えます**（アイコンだけの名前になる）。` +
        実物(triggerBody),
    );
  } else if (/aria-hidden\s*=\s*["{]?\s*(?:true|"true")/.test(名[0]) || /\bsr-only\b/.test(名[0])) {
    found.push(
      `${where}: <BreadcrumbPage> が aria-hidden / sr-only になっています。` +
        `\n    **見えている文字が無くなる**ので、WCAG 2.5.3（label in name）を満たせません。` +
        実物(名[0]),
    );
  }
  return found;
}

// ── 🚨 囮（自己検査）: **走るたびに、規則が本当に発火するかを確かめる**
//    これが無いと、規則が壊れて何も検出しなくなっても緑のままになる。
const OK_ICONS = '<EllipsisIcon aria-hidden="true" /><SlashIcon aria-hidden="true" />';
// 🚨 「きれいな形」にはページ名も要る（新しい規則③を満たすため）
const OK_ALL = `${OK_ICONS}<BreadcrumbPage>通知</BreadcrumbPage>`;
const DECOYS = [
  ["きれいな形（発火してはいけない）", OK_ALL, '<Button variant="secondary">', 0],
  ["aria-label", OK_ICONS, '<Button aria-label="x">', 1],
  ["aria-labelledby", OK_ICONS, '<Button aria-labelledby="x">', 1],
  ["spread", OK_ICONS, '<Button {...p}>', 1],
  ['aria-hidden="false"', '<EllipsisIcon aria-hidden="true" /><SlashIcon aria-hidden="false" />', "<Button>", 1],
  ["アイコンが無い", '<EllipsisIcon aria-hidden="true" />', "<Button>", 1],
  ["ページ名が無い", OK_ICONS, "<Button>", 1],
  ["ページ名が aria-hidden", `${OK_ICONS}<BreadcrumbPage aria-hidden="true">通知</BreadcrumbPage>`, "<Button>", 1],
];
let decoyFailed = false;
for (const [name, body, tag, want] of DECOYS) {
  const got = inspect(body, tag, "囮").length;
  const ok = want === 0 ? got === 0 : got >= 1;
  if (!ok) {
    decoyFailed = true;
    console.error(`🚨 囮が期待どおりに動きません: ${name} → 検出 ${got} 件（期待 ${want === 0 ? "0" : "1 以上"}）`);
  }
}
if (decoyFailed) {
  console.error("\n🚨 **規則そのものが壊れています。この検査の結果は信用できません**（緑でも意味を持たない）。");
  process.exit(1);
}
checked.push(`囮 ${DECOYS.length} 件すべてが期待どおり（規則は発火する／きれいな形では発火しない）`);

// 🚨 **この見逃し入力は、実物と同じ入口から入っていません**（司令塔 2026-08-16 の規律）。
//    実物の道 … ファイルを読む → `DropdownMenuTrigger` を切り出す → `<Button>` の開きタグを取る → `inspect()`
//    ここの道 … 🚨 **`inspect()` へ直接**（**抽出の 2 段を飛ばしている**）
//    ＝ **抽出が壊れる形の見逃し**（引き金の名前が変わる・入れ子が変わる 等）は、
//      **ここでは 1 件も測れていません**。下の一覧は「`inspect()` の中の規則」に限った話です。
//    🚨 同じ入口にするには、抽出を関数へ切り出す必要があります（**やっていません**）。
//    ── 🚨 **見逃す入力を、自分で作って通す**（司令塔 2026-08-16 / design の実演）
//    「取りこぼしの**数**」は数えられない（出てこないので）。
//    だが「**この形は取りこぼす**」は、**作れば必ず示せる**。
//    🚨 ここは**落とさない**（落とすと全員のコミットが止まる）。**見逃したことを印字するだけ**。
const 見逃す入力 = [
  // 🚨 **どの入力にも `<BreadcrumbPage>` を入れておく。**
  //    入れないと規則③（ページ名が無い）が拾ってしまい、
  //    **狙った観点とは別の理由で「捕まえた」ことになる**（2026-08-16 に実際にやった）。
  ["引き金に role=presentation を付ける（読み上げの木から外れる）",
   `${OK_ICONS}<BreadcrumbPage>通知</BreadcrumbPage>`,
   '<Button role="presentation" variant="secondary">'],
  ["別名 import で違うアイコンを EllipsisIcon と呼ぶ（名前だけ合っている）",
   `${OK_ICONS}<BreadcrumbPage>通知</BreadcrumbPage>`,
   '<Button variant="secondary">'],
  ["title 属性で別の名前を足す",
   `${OK_ICONS}<BreadcrumbPage>通知</BreadcrumbPage>`,
   '<Button title="別の名前" variant="secondary">'],
  ["ページ名の中身を空にする（タグは在るが文字が無い）",
   `${OK_ICONS}<BreadcrumbPage></BreadcrumbPage>`,
   '<Button variant="secondary">'],
  ["ページ名を display:none の親で包む（タグは在るが描かれない）",
   `${OK_ICONS}<span className="hidden"><BreadcrumbPage>通知</BreadcrumbPage></span>`,
   '<Button variant="secondary">'],
  ["引き金を <Button> でない要素にする（沈み込みも読み上げも変わる）",
   `${OK_ICONS}<BreadcrumbPage>通知</BreadcrumbPage>`,
   '<Button variant="secondary">'],
];
const 見逃し判定 = 見逃す入力.map(([n, body, tag]) => [n, inspect(body, tag, "見逃し")]);
const 見逃した = 見逃し判定.filter(([, r]) => r.length === 0).map(([n]) => n);
// 🚨 **拾えたものは「死角が塞がった」合図**。ヘッダの記述が古くなったことを鳴らす。
//    （司令塔 2026-08-16: 「書いただけ」と「古くなったら鳴る」は別）
//    🚨 拾えた**理由**も出す。狙いと違う理由で拾っていると、塞がったように見える。
const 塞がった = 見逃し判定
  .filter(([, r]) => r.length > 0)
  .map(([n, r]) => `${n}  → 拾った理由: ${r[0].split("\n")[0].slice(0, 60)}`);
// 🟢 対照(+): **拾う入力**も 1 つ通す（＝ 検出器が動いていることの確認。全部見逃しなら壊れている）
const 対照は拾えた = inspect(OK_ICONS, '<Button aria-label="x">', "対照").length > 0;
if (!対照は拾えた) {
  console.error("🚨 対照の入力すら拾えていません。見逃しの一覧は読めません（検出器が壊れています）。");
  process.exit(1);
}
checked.push(`🟢 対照(+) 拾う入力は拾えた（＝ 下の「見逃し」は本物）`);

// ── ④ 🚨 罫線文字（├ └ ┣ ┗ │ ─）を**実コードに書かない**（2026-08-17 追加）
//
// 由来: 堀池さん 2026-08-17（C4）原文「パンくずリスト：現在の罫線はただの記号のようなので、
//   デザインとしてあしらいを加えてください」。規約 `knowledge/decisions/tree-connector-lines.md` は
//   これを **2026-08-15 の時点で既に禁じていた**（「罫線文字（├ └ ┣）を使わない。
//   読み上げに乗り、字幅がフォントで変わる」）。
//   🚨 **それでも守り手が居なかった**ので、規約と `components/ui/tree.tsx` が在るのに
//   このファイルだけ繋がっていなかった。**同じ形は次の人が素直に踏み直す。**
//
// 🚨 **単純な grep では作れない。** 実測（2026-08-17）:
//   直す前 5 件 → 直した後 **12 件**（**直した方が多い**）。
//   申し送りのコメントが ├ └ に言及しているため。**コメントを外してから見る。**
function stripComments(source) {
  let out = "";
  let inBlock = false;
  for (const line of source.split("\n")) {
    let rest = line;
    let kept = "";
    while (rest.length > 0) {
      if (inBlock) {
        const end = rest.indexOf("*/");
        if (end === -1) { rest = ""; break; }
        rest = rest.slice(end + 2);
        inBlock = false;
        continue;
      }
      const block = rest.indexOf("/*");
      const lineC = rest.indexOf("//");
      if (block === -1 && lineC === -1) { kept += rest; break; }
      if (lineC !== -1 && (block === -1 || lineC < block)) { kept += rest.slice(0, lineC); break; }
      kept += rest.slice(0, block);
      rest = rest.slice(block + 2);
      inBlock = true;
    }
    out += kept + "\n";
  }
  return out;
}

const BOX_CHARS = /[─-╿]/g;

/** 実コード（コメントを外した後）に罫線文字が在るか。**行番号つきで返す**。 */
function boxCharViolations(source, where) {
  const stripped = stripComments(source).split("\n");
  const found = [];
  stripped.forEach((line, index) => {
    const hits = line.match(BOX_CHARS);
    if (!hits) return;
    found.push(
      `${where}: ${index + 1} 行目の**実コード**に罫線文字 ${[...new Set(hits)].join(" ")} があります。\n` +
        `    規約 knowledge/decisions/tree-connector-lines.md:「罫線文字（├ └ ┣）を使わない。\n` +
        `    読み上げに乗り、字幅がフォントで変わる」。線は components/ui/tree.tsx の\n` +
        `    <Tree> / <TreeItem> が CSS で描きます（擬似要素）。\n` +
        `    実物: ${line.replace(/\s+/g, " ").trim().slice(0, 80)}`,
    );
  });
  return found;
}

// 🚨 囮（自己検査）。**コメントの中は発火してはいけない／実コードは発火しなければならない**。
//    🚨 **文字列リテラルだけでなく JSX のテキストも**入れる——
//    `const b = "├"` より `<span>├{name}</span>` の方が、次に書かれやすい形だから。
const BOX_DECOYS = [
  ["きれいな形（発火してはいけない）", 'const branch = "";\n<span>{crumb.label}</span>\n', 0],
  ["行コメントの中の ├（発火してはいけない）", '// 以前は「├XXX」で描いていた\nconst x = 1;\n', 0],
  ["ブロックコメントの中の └（発火してはいけない）", '/**\n * 2026-08-15 の原文は「└XXX」だった\n */\nconst x = 1;\n', 0],
  ["JSX コメントの中の ├（発火してはいけない）", '{/* ├ と └ をやめた理由 */}\n<span>{x}</span>\n', 0],
  ["文字列リテラルの └（発火する）", 'const branch = "└";\n', 1],
  ["JSX のテキストの ├（発火する）", '<span className="truncate">├{crumb.label}</span>\n', 1],
  ["ブロックコメントを閉じた後の ─（発火する）", '/* 説明 */ const line = "─";\n', 1],
];
let boxDecoyFailed = false;
for (const [name, source, want] of BOX_DECOYS) {
  const got = boxCharViolations(source, "囮").length;
  const ok = want === 0 ? got === 0 : got >= 1;
  if (!ok) {
    boxDecoyFailed = true;
    console.error(`🚨 囮④が期待どおりに動きません: ${name} → 検出 ${got} 件（期待 ${want === 0 ? "0" : "1 以上"}）`);
  }
}
if (boxDecoyFailed) {
  console.error("\n🚨 **規則④が壊れています。この検査の結果は信用できません**（緑でも意味を持たない）。");
  process.exit(1);
}
checked.push(`囮④ ${BOX_DECOYS.length} 件すべてが期待どおり（コメントは通す／実コードは拾う）`);

// 🚨 **規則④の死角（`decisions/checks-must-declare-blind-spots.md`）**
//    ・**文字列の中の `//` を行コメントとして扱う**（例 `"https://…"` の後ろに罫線文字が在ると見逃す）。
//      塞いでいないのは、文字列の状態まで追うと**この検査自体が壊れやすくなる**ため。
//      外れる向きは**見逃す側**なので、緑を根拠に「1 件も無い」と言わないこと。
//    ・**このファイル 1 本しか見ていない**（`breadcrumbs.tsx`）。他のファイルの罫線文字は対象外。
checked.push("規則④の死角を出力に書いた（文字列中の // ／ このファイル 1 本のみ）");

problems.push(...boxCharViolations(src, FILE));

problems.push(...inspect(trigger[1], buttonTag[0], FILE));

console.log(`対象: ${FILE}`);
console.log(`確かめたこと: ${checked.length} 件`);
for (const c of checked) console.log(`  🟢 ${c}`);

if (problems.length > 0) {
  console.error(`\n🚨 パンくずの読み上げ名が壊れる書き方があります: ${problems.length} 件\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

if (塞がった.length > 0) {
  console.log(`\n🚨 **死角の記述が古くなっています**（${塞がった.length} 件が拾えるようになりました）:`);
  for (const n of 塞がった) console.log(`  ・${n}`);
  console.log("  🚨 **ヘッダの「見ていない範囲」から、この形を外してください**（🚨 理由が狙いどおりかも見ること）。");
}
if (見逃した.length > 0) {
  console.log(`\n🚨 この検査が**見ていない形** ${見逃した.length} / ${見逃す入力.length} 件（作って通した結果。落としません）:`);
  for (const n of 見逃した) console.log(`  ・${n}`);
  console.log("  🚨 これらは**壊れていても緑になります**。読み上げ名そのものは probe-crumb-name.mjs で測ること。");
}
console.log("違反なし。");
