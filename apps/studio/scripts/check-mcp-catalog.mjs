#!/usr/bin/env node
/**
 * MCP のツール目録が、Studio 側の写しとずれていないかを検査する。
 *
 * ■ なぜ写しを置くのか（依存を足さなかった理由）
 *   正は `packages/mcp/src/catalog.ts` ただ1つ。Studio はそれを **import できない**:
 *     - `apps/studio` は `@ohmycms/mcp` に依存していない（実測 2026-08-15・依存46本に無し）
 *     - `packages/mcp` は `exports` / `main` / `types` を**1つも定義していない**（同）
 *     - `catalog.ts` は `schemas.ts` 経由で **zod** を引く。Studio に zod は**無い**
 *   入れるには「依存追加 + exports 定義 + bun.lock 更新」が要り、**bun.lock は9ペインが
 *   共有するツリーの中**にある。表示用の文字列のためにそこを動かすのは割に合わない。
 *   → **生成された写しを置き、ずれたら落ちる検査を付ける**（この家の `check-i18n-keys.mjs` と同じ形）。
 *
 * 🚨 **写しを手で直さないこと。** `--write` で作り直す。
 *
 * ■ 使い方
 *   node scripts/check-mcp-catalog.mjs          検査（ずれていたら exit 1）
 *   node scripts/check-mcp-catalog.mjs --write   写しを作り直す
 *
 * ## 🚨【鳴る】この検査が見ていない形（**書き置きではなく、毎回その場で通して出しています**）
 *
 * 🚨 **下の2行は、下のコードの `blind` 配列と一字一句そろえてあります。**
 *    そろっていなければこの検査は落ちます（`assertHeaderMatchesBlind`）。
 *    ＝ **同じことが散文とコードの2箇所にありますが、片方だけ腐ることはできません。**
 *    （二重に書くと片方が必ず腐る、という指摘への対処。司令塔 2026-08-16 / base2）
 * ```
 * 名前を変数で組み立てて登録する → **見逃す**（`registerTool(n, {})`。落とすには構文解析が要る）
 * 文字列リテラルの中の registerTool → **拾ってしまう**（過検出。承知で残している）
 * ```
 * 🚨 **この2つは 2026-08-16 まで「どちらも見逃す」と書いていました。通したら逆でした。**
 *    ＝ **見ていない範囲を書いても、確かめていなければ、それ自体が思いつきです**（司令塔 2026-08-16）。
 *    → 書き置きをやめ、**実行のたびに通して出す**形にした（下の「見ていない形」節）。
 * 🚨 **この2行が実際の振る舞いと食い違ったら、この検査は落ちます**（design の形）。
 *    ＝ ここは「書いただけ」ではなく「**古くなったら鳴る**」側。**両者は別物です。**
 *
 * 塞いだ形（**どれも見逃していたものを、作って確かめてから塞いだ**）:
 *   単一引用符で登録 / `src` の下の階層に置く / 目録の鍵を引用符で書く /
 *   目録の文言をテンプレートリテラルで書く /
 *   🚨 **名前に数字が入るツール**（`ohmycms_items_v2` のような形）。
 *      抽出が `ohmycms_[a-z_]+` だったため、**目録側と登録側の両方から同時に消えて釣り合い、
 *      違反 0 件で緑**になっていた（実測 2026-08-16: 数字なしなら 23 本、数字ありは 22 本のまま）。
 *      ＝ **写しからツールが 1 本落ちても、この検査は何も言いませんでした。**
 *      🚨 見つかった経緯: **囮の名前に数字を使ってしまい、囮が別の理由で外れた**。
 *         対照だけが数字なしの名前だったので通り、**囮 2 本が「見逃す」に見えていた**
 * 🟢 対照(+) 素直な登録は拾う（＝検出器が動いていることを毎回確認）
 * 🚨 実演の道具: `scratchpad/miss-probe.mjs`（共有ツリーは 1 バイトも触りません）
 *
 * 🚨 抽出は**行またぎの文字列連結に対応**していること。
 *    `grep -oE 'description: "[^"]*"'` のような素朴な形は **22 本中 7 本しか拾えず**、
 *    それでも「完全一致」と出る（2026-08-15 実測。私自身がこの穴に落ちた）。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_SRC = join(HERE, "..", "..", "..", "packages", "mcp", "src");
const SOURCE = join(MCP_SRC, "catalog.ts");
// 🚨 **独立した数え先**。目録と同じ書き方の思い込みを共有しないため、
//    「実際に登録されているツール名」は登録側から採る（下の理由を読むこと）。
//
// 🚨 **1 ファイルに決め打ちしない。** 以前は `server.ts` だけを読んでいた。
//    今日 22 件すべてがそこに在ったので**壊れてはいなかった**が、
//    **別のファイルに 1 つ足されたら、丸ごと見えないまま緑**になる
//    （＝「入口が1つ抜けている」形。2026-08-15、二重送信の検査から HTTP の PUT が
//    丸ごと抜けていた件と同じ）。**src の .ts を全部読む。**
// 🚨 **再帰する。** `readdirSync` は下の階層を見ないので、
//    `src/sub/extra.ts` に登録を書かれると**丸ごと見えないまま緑**になる
//    （2026-08-16、見逃す入力を自分で作って確認）。
function collectTs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTs(p));
    else if (entry.name.endsWith(".ts") && p !== SOURCE) out.push(p);
  }
  return out;
}
const SERVER_FILES = collectTs(MCP_SRC);
const COPY = join(HERE, "..", "lib", "mcp", "tool-catalog.json");
const WRITE = process.argv.includes("--write");

/** JS の文字列リテラル（行またぎ・`+` 連結を含む）を1本に畳む。 */
function joinedString(raw) {
  const parts = [...raw.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  return parts.join("").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function parseCatalog(source) {
  const tools = [];
  // 目録の1件は `ohmycms_xxx: { … },` の形。
  // 🚨 **字下げの幅を決め打ちしない。** 2026-08-15 に実測したところ、
  //    4 スペースで書くだけで抽出から漏れ、**同じ思い込みで数えていた守りも一緒に漏れて**
  //    「22 本一致」と緑になった（＝検査を迂回できた）。
  // 🚨 **数字を許すこと。** `[a-z_]` だけにすると `ohmycms_items_v2` のような名前が
  //    ここと下の登録側の**両方から同時に消え、釣り合って違反 0 件（緑）**になる
  //    （2026-08-16 実測。囮6/囮7 が守っている）。
  const re = /^[ \t]+["']?(ohmycms_[a-z0-9_]+)["']?:\s*\{([\s\S]*?)^[ \t]+\},/gm;
  for (const m of source.matchAll(re)) {
    const [, name, body] = m;
    const title = body.match(/\btitle:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/);
    const description = body.match(/\bdescription:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/);
    tools.push({
      name,
      title: title ? joinedString(title[1]) : null,
      description: description ? joinedString(description[1]) : null,
      // 読み取り専用かどうかだけを写す。破壊的かどうかは registerTool の注記に従う。
      readOnly: /readOnlyHint:\s*true/.test(body),
    });
  }
  return tools;
}

/**
 * コメントを落とす。**登録を数える前に必ず通す。**
 *
 * 🚨 通さないと、**コメントに書いた使用例を実際の登録として数える**（2026-08-16 実測。
 *    `// server.registerTool("ohmycms_zz")` / JSDoc の例 / 文字列リテラル、**3 通りとも拾った**）。
 *    ＝ 正しく書いてあるものを「登録が目録に無い」と言う**過検出**になる。
 *    今日この形で 3 人が別々に落ちている（規約の説明文を実装として計上・JSDoc の使用例を
 *    使用として計上・弱い語での棚卸し）。
 *
 * 🚨 **URL を壊さない。** 行コメントは「空白の直後の `//`」だけを落とす
 *    （`https://…` は `:` の直後なので当たらない）。
 *
 * 🚨 **塞げていないもの（宣言）**: **文字列リテラルの中**の `registerTool("ohmycms_…")`。
 *    落とすには構文解析が要る。**「たぶん書かない」であって、構造上の保証ではない。**
 *    囮5 でこの経路を明示的に測っており、**拾ってしまうことを承知で残している。**
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")   // ブロック（JSDoc を含む）
    .replace(/(^|\s)\/\/[^\n]*/g, "$1"); // 行コメント（URL の // は前が `:` なので当たらない）
}

/**
 * 実際に登録されているツール名を返す。
 *
 * 🚨 **抽出の式を 1 箇所に寄せてある。** 判定と、下の「実際に走査した数」の報告が
 *    別々の式を持つと、**片方だけ直したときに数と判定が食い違う**（同じことを 2 箇所に
 *    書くと片方が腐る、という今日の指摘と同じ）。
 */
function registeredNames(text) {
  return [...stripComments(text).matchAll(/registerTool\(\s*["'](ohmycms_[a-z0-9_]+)["']/g)].map((m) => m[1]);
}

/**
 * 目録と登録のずれを返す。**ファイルを読まない**ので、囮の文字列をそのまま渡せる。
 * 🚨 判定を関数にしてあるのは、**毎回その場で「検出できること」を確かめる**ため
 *    （この家の check-shortcuts / check-user-label-leak と同じ作法。10/23 本が採用している）。
 */
function findViolations(sourceText, serverText) {
  const found = parseCatalog(sourceText);
  const declaredCount = (sourceText.match(/^[ \t]+["']?ohmycms_[a-z0-9_]+["']?:/gm) ?? []).length;
  const out = [];
  if (found.length === 0 || found.length !== declaredCount) {
    out.push({ rule: "抽出できていない", detail: `宣言 ${declaredCount} 件 / 抽出 ${found.length} 件` });
    return { tools: found, violations: out };
  }
  for (const t of found.filter((x) => !x.title || !x.description)) {
    out.push({ rule: "文言を取れない", detail: t.name });
  }
  const names = registeredNames(serverText);
  if (names.length === 0) {
    out.push({ rule: "登録を読めない", detail: "server.ts から 0 件" });
    return { tools: found, violations: out };
  }
  const inCatalog = new Set(found.map((t) => t.name));
  for (const n of names.filter((n) => !inCatalog.has(n))) {
    out.push({ rule: "登録が目録に無い", detail: `${n}（画面には出ません）` });
  }
  for (const n of found.map((t) => t.name).filter((n) => !names.includes(n))) {
    out.push({ rule: "目録が登録に無い", detail: `${n}（使えません）` });
  }
  return { tools: found, violations: out };
}

/**
 * 🚨 読めなかったときに、**自分の言葉で**落とす。
 *    素の `readFileSync` は例外の生スタックを出すだけで、読んだ人には
 *    **「検査が壊れた」のか「対象が無い」のか分からない**（2026-08-15 実測）。
 *    どちらも exit は非 0 なので、**終了コードでは区別できない**。
 */
function readOrStop(path, what) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    console.error(`🚨 ${what}を読めませんでした: ${path}`);
    console.error(`   ${error.code === "ENOENT" ? "ファイルがありません（移動・改名された可能性）" : String(error.message)}`);
    console.error("   → **この検査は「違反なし」ではなく「測れていません」です。**");
    process.exit(1);
  }
}

const source = readOrStop(SOURCE, "MCP の目録");

// 🚨 **どのファイルを読んだかを出す。** 「登録 0 件」が「登録が無い」なのか
//    「読む先を間違えた」なのかを、読んだ人が割れるようにするため。
if (SERVER_FILES.length === 0) {
  console.error(`🚨 ${MCP_SRC} に .ts がありません。**測れていません**`);
  process.exit(1);
}
const serverText = SERVER_FILES.map((f) => readOrStop(f, `MCP の登録（${f.split("/").pop()}）`)).join("\n");

// 🚨 **候補と、実際に走査した数を分けて出す**（司令塔 2026-08-16 / polish の実測）。
//    「対象 N 本」とだけ出すと、**門が死んで 1 本も見ていなくても大きな数が出る**。
//    polish の写しでは「133 本を走査」と出しながら、実際は 0 本だった。
//
// 🚨 **走査 0 なら落とす。** 「登録が 0 件」は「登録が無い」ではなく「**見ていない**」。
//    ここで落とさないと、下の自己検査が先に鳴り、読む人には
//    「囮2 が検出できない」と見えて、**門が死んだこととは分からない**
//    （2026-08-16 実測。台で server.ts を落としたら、まさにそう出た）。
{
  const candidates = readdirSync(MCP_SRC, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile()).length;
  const registered = registeredNames(serverText).length;
  console.log(
    `■ 走査 … 候補 ${candidates} 本 / 読んだ .ts ${SERVER_FILES.length} 本` +
      `（読めた文字数 ${serverText.length}・正の catalog.ts は除く） / 見つけた登録 ${registered} 件`,
  );

  // 🚨 **本数だけでは「1 文字も読めていない」が隠れる**（司令塔 2026-08-16 / polish）。
  //    polish の写しは「395 ファイルを走査」と出しながら 1 文字も読めておらず、
  //    しかも**在りもしない違反を 14 件**出して、読んだ人を探しに行かせた。
  //    → 文字数を併記し、0 なら**自分が壊れている**ほうを先に言う。
  // 🚨 **`length === 0` では捕まりません。** 読み込みが死んだ形は、繋ぎの改行だけが残る
  //    （空文字を 4 本 join すると **3 文字**になる。2026-08-16 に自分の実演で踏んだ）。
  //    ＝ ここも「0 しか見ない」形だった。**中身が無いこと**で見る。
  if (serverText.trim().length === 0) {
    console.error("🚨 ファイルは見つかったのに、**中身を読めていません**。");
    console.error(`   読んだつもりのファイル: ${SERVER_FILES.map((f) => f.split("/").pop()).join(", ")}`);
    console.error("   → 違反を探す前に、**読み込みが壊れていないか**を疑ってください。");
    process.exit(1);
  }
  // ─────────────────────────────────────────────────────────────
  // 🚨 **3 つの守り（比率 / 平均 / 床）を、この検査は 1 つも持っていません。**
  //    **入れ忘れではありません。** 他の検査に在るからといって揃えに来ないでください
  //    （司令塔 2026-08-16。「選んだ理由を書かないと、次の人は揃えにくる」）。
  //
  //    比率（走査 ÷ 候補）… 🚨 **使えない。** 差は**構造で 1 固定**（正の catalog.ts を
  //      除くだけ）。範囲が壊れれば候補と走査が**同時に減る**ので、比は動かない。
  //    平均（文字数 ÷ 本数）… **要らない。** 本数が同じまま痩せる形は突き合わせが捕まえる。
  //      実測 2026-08-16: server.ts を 2000 字に切る → 登録 2 → **違反 20 件**（消えたツール名つき）。
  //    床（実測から遠い絶対値）… **要らない。** 丸ごと減る形も捕まえる。
  //      実測: MCP_SRC が小さいディレクトリを指す → exit 1 ／ 走査が 1 本で止まる → exit 1。
  //
  //    代わりに在るのは「**目録と登録の完全一致**」1 つで、これが 3 つ分を兼ねている。
  //    🚨 **突き合わせをやめるなら、3 つとも作り直すこと。**
  // ─────────────────────────────────────────────────────────────
  //
  // 🚨 **ここは 0 しか見ていません**（「0 ガードは 0 しか見ない」・司令塔 2026-08-16 / design）。
  //    件数の基準線（前回より大きく減ったら鳴らす）は**わざと足していません**。理由:
  //    この検査の本体が **目録と登録の突き合わせ**なので、走査が減れば減った分が
  //    そのまま「目録が登録に無い」として**名前つきで**出るため。
  //    🚨 実測（2026-08-16・現実の形＝登録が 2 ファイルに分かれ、片方が読まれない）:
  //      対照 分割したまま          候補 6 / 読んだ 5 / 登録 22 → exit 0
  //      extra-tools.ts が読まれない 候補 6 / 読んだ 4 / 登録 20 → exit 1
  //        [目録が登録に無い] ohmycms_health ／ ohmycms_collections_list
  //      ＝ **自己検査ではなく本判定で落ちる**（読む人が囮を見に行かない）
  //    ＝ 基準線を足すと**同じことを 2 通りで見る**ことになり、片方が腐る。
  //    🚨 **入れ忘れではなく判断です。** 突き合わせをやめるなら、ここも作り直すこと。
  //
  //    🚨 残る穴（塞いでいない）: 抽出そのものが大量に取りこぼす変更をすると、
  //    **囮も一緒に消えて自己検査で落ちる**ため、診断が「囮が検出できない」になる。
  //    緑にはならない（必ず赤い）が、**読む人は囮を見に行く**。
  if (registered === 0) {
    console.error("🚨 登録を 1 件も見つけられませんでした。**「登録が無い」ではなく「見ていない」です。**");
    // 🚨 **ファイルごとの文字数まで出す。** 名前だけだと、読む人は
    //    「選び方（collectTs）が悪い」としか読めない。実際には**中身が縮んだ**場合も在る
    //    （2026-08-16 実測: server.ts を 1 行にしたら、選び方は正しいのにこの門が鳴り、
    //     出していた案内は**間違った場所を指していた**）。
    console.error("   読んだファイル:");
    for (const f of SERVER_FILES) {
      console.error(`     ${f.split("/").pop()}  ${readFileSync(f, "utf8").length} 文字`);
    }
    if (SERVER_FILES.length === 0) console.error("     （なし）");
    console.error("   → **明らかに小さいファイルが在れば中身の問題**、");
    console.error("     どれも普通の大きさなら **どのファイルを読むか（collectTs / MCP_SRC）** を疑ってください。");
    process.exit(1);
  }
}

// 🚨 自己検査: 囮を仕込んで、**この実行で**検出できることを確かめる。
//    「違反 0 件」が「異常が無い」なのか「見ていない」なのかを、毎回その場で割るため。
//
// 🚨 `--write` はこの自己検査を**飛ばす**。飛ばすこと自体は正しい（写しを作り直すだけで
//    「検査した」わけではないので）が、**飛ばしたことが出力に出ていなかった**（2026-08-15 実測）。
//    ログだけを見た人には、緑で終わった実行が「検査を通った」ように読める。
//    → **例外を消すのではなく、例外が見える形にする**（司令塔 2026-08-15）。
if (WRITE) {
  console.log("⚠️  --write のため、自己検査（囮3本）と写しとの照合を**飛ばしました**。");
  console.log("    この実行は**何も検証していません**。検査は node scripts/check-mcp-catalog.mjs（引数なし）です。");
}
if (!WRITE) {
  const probes = [
    ["囮1: 登録だけ足す（目録を通さない）", source,
      serverText + '\n  server.registerTool(\n    "ohmycms_zz_probe",\n', "登録が目録に無い"],
    ["囮2: 目録の字下げを変えて足す", source.replace(/\n\} as const/, '\n    ohmycms_zz_indent: {\n      title: "x",\n      description: "y",\n      annotations: { readOnlyHint: true },\n    },\n} as const'),
      serverText, "目録が登録に無い"],
    // 🚨 字下げを前提にしない。2026-08-15、`^ {2}ohmycms_` で書いていたら、
    //    **4 スペースで足された項目だけ生き残って囮が成立しなくなった**
    //    （＝本体で直したのと同じ思い込みを、囮の側に残していた）。
    ["囮3: 目録を丸ごと読めなくする", source.replaceAll("ohmycms_", "zzz_"), serverText, "抽出できていない"],
    // 🚨 **ここから下は「検出されてはいけない」側。**
    //    2026-08-16 まで、囮は 3 本とも「検出されること」だけだった。
    //    **逆方向が無いと、過検出は永久に捕まらない**（司令塔 2026-08-16）。
    //    実際、この 2 つは**塞ぐ前は拾っていた**（＝正しく書いてあるものを違反と言っていた）。
    // 🚨 期待は「**この名前が出ないこと**」であって「違反 0 件」ではない。
    //    0 件を要求すると、**本物の違反が 1 つ在るだけで囮のほうが落ち**、
    //    「自己検査に失敗」が本当の違反を覆い隠す（2026-08-16 実測）。
    //    ＝ 赤くなったことと、狙ったものを捕まえたことは別。
    // 🚨 過検出の囮には **5 つ目**を付ける＝「**判定に届いたことの対照**」。
    //    「拾わない」は **①届いて正しく無視した** とも **②そもそも届いていない** とも読める
    //    （司令塔 2026-08-16。「違反なし」の意味が 2 通りある）。
    //    対照は **コメントの印だけを外した同じ文字列**。これが拾われれば、
    //    **本文は判定まで届いており、黙ったのはコメントだからだ**と言える。
    ["囮4: コメントに書いた使用例（拾ってはいけない）", source,
      serverText + '\n// server.registerTool("ohmycms_zz_incomment", …) と書く\n', "ohmycms_zz_incomment",
      serverText + '\nserver.registerTool("ohmycms_zz_incomment", {});\n'],
    ["囮5: JSDoc の使用例（拾ってはいけない）", source,
      serverText + '\n/**\n * 例: server.registerTool("ohmycms_zz_injsdoc", {})\n */\n', "ohmycms_zz_injsdoc",
      serverText + '\nserver.registerTool("ohmycms_zz_injsdoc", {});\n'],
    // 🚨 **名前に数字が入る形**。2026-08-16 まで抽出が `[a-z_]` だったため、
    //    目録側と登録側の**両方から同時に消えて釣り合い、違反 0 件で緑**になっていた。
    //    ＝ 片側だけを見る囮では捕まらない（**両方を別々に囮にする**）。
    ["囮6: 目録に数字入りの名前（登録には無い）",
      source.replace(/\n\} as const/, '\n  ohmycms_zz_v2: {\n    title: "x",\n    description: "y",\n    annotations: { readOnlyHint: true },\n  },\n} as const'),
      serverText, "目録が登録に無い"],
    ["囮7: 登録に数字入りの名前（目録には無い）", source,
      serverText + '\nserver.registerTool("ohmycms_zz_v3", {});\n', "登録が目録に無い"],
  ];
  // ■ 入口の囮
  //
  // 🚨 **囮は、実物と同じ入口から入れる**（司令塔 2026-08-16）。
  //    下の囮1〜7 は `findViolations` に**文字列を直接渡している**。
  //    ＝ **どのファイルを読むか（`collectTs`）を飛ばして入っている。**
  //    ＝ `collectTs` が壊れても、囮 7 本は**全部緑のまま**。
  //    実際 2026-08-16 に「再帰しない」穴が在り、**囮は 1 本も鳴らず**、
  //    台（`scratchpad/miss-probe.mjs`）で実ファイルを置いて初めて見つかった。
  //    → **入口そのものを囮にする。** ここだけは本物のディレクトリを渡す。
  {
    // 🟢 対照(+) 本物の入口。ここが空なら、下の囮は何を測っても意味が無い。
    // 🚨 **フルパスで見ること。** 以前はファイル名だけで "catalog.ts" を探しており、
    //    下の階層に**別の** catalog.ts が在るだけで「除外できていない」と嘘をついた
    //    （2026-08-16 実測。除外の実装は `p !== SOURCE` ＝ フルパスなので、正しく効いている）。
    //    ＝ **測っているものと、実装しているものが違っていた。**
    const real = collectTs(MCP_SRC);
    const realOk = real.length > 0 && real.some((p) => p.endsWith("/server.ts")) && !real.includes(SOURCE);
    console.log(`■ 入口の囮（どのファイルを読むか）`);
    console.log(`  ${realOk ? "✅" : "🚨"} 対照(+) 本物の ${MCP_SRC.split("/").slice(-2).join("/")} → ${real.length} 本` +
      `（server.ts ${real.some((p) => p.endsWith("/server.ts")) ? "在り" : "**無し**"}` +
      ` / 正の ${SOURCE.split("/").pop()} は除外 ${real.includes(SOURCE) ? "**できていない**" : "済み"}）`);

    // 囮: 下の階層と拡張子。**実物と同じくディレクトリを渡す**（配列へ直接足さない）。
    const d = mkdtempSync(join(tmpdir(), "mcp-catalog-probe-"));
    let entryOk = false;
    let got = [];
    try {
      mkdirSync(join(d, "sub"), { recursive: true });
      writeFileSync(join(d, "server.ts"), "");
      writeFileSync(join(d, "sub", "extra.ts"), "");
      writeFileSync(join(d, "skip.js"), ""); // .ts でないものは拾わない
      got = collectTs(d).map((p) => p.slice(d.length + 1)).sort();
      entryOk = JSON.stringify(got) === JSON.stringify(["server.ts", "sub/extra.ts"]);
    } finally {
      // 🚨 **片付けの失敗を、測定の失敗にしない**（2026-08-16 に踏んだ形）。
      try { rmSync(d, { recursive: true, force: true }); }
      catch (e) { console.log(`  ⚠️ 台の片付けに失敗（測定の結果とは無関係）: ${e.code ?? e.message}`); }
    }
    console.log(`  ${entryOk ? "✅" : "🚨"} 囮: 下の階層と拡張子 → ${JSON.stringify(got)}` +
      (entryOk ? "" : ' **期待は ["server.ts","sub/extra.ts"]**'));
    if (!realOk || !entryOk) {
      console.error("🚨 入口が壊れています。**下の囮が全部緑でも、この検査は何も見ていません。**");
      process.exit(1);
    }
  }

  let alive = 0;
  console.log("■ 自己検査（囮を仕込んで、検出できることをその場で確かめる）");
  // 🚨 ここから下の囮は **findViolations に文字列を直接渡している**＝入口を飛ばしている。
  //    入口は上の「入口の囮」で別に測る（迂回していることを、迂回している行に書く）。
  for (const [name, src, srv, wantRule, reachSrv] of probes) {
    // `ohmycms_` で始まる wantRule は「**その名前が出ないこと**」が期待（過検出の囮）。
    if (wantRule.startsWith("ohmycms_")) {
      const violations = findViolations(src, srv).violations;
      const leaked = violations.filter((v) => v.detail.includes(wantRule));
      const quiet = leaked.length === 0;
      // 🚨 **届いたことを確かめる。** 印だけ外した同じ文字列が拾われなければ、
      //    「拾わない」は**届いていないだけ**かもしれない。
      // 🚨 **届いたことは「✅」でなく、返ってきた実物で出す**（司令塔 2026-08-16 ⑦）。
      //    判定は「通った / 落ちた」しか言わない。**実物は「そこまで来た」を言う。**
      const reachHit = findViolations(src, reachSrv).violations.find((v) => v.detail.includes(wantRule));
      const ok = quiet && Boolean(reachHit);
      console.log(
        `  ${ok ? "✅" : "🚨"} ${name}  → ` +
          (quiet ? "拾わない（過検出なし）" : `**拾ってしまう**: ${leaked.map((v) => v.detail).join(" / ")}`) +
          ` ／ 印を外すと → ` +
          (reachHit ? `[${reachHit.rule}] ${reachHit.detail}` : "🚨 **何も返らない（この囮は判定に届いていません）**"),
      );
      if (ok) alive++;
      continue;
    }
    // 🚨 ここも**返ってきた実物**を出す（規則名だけだと、何を捕まえたか読めない）。
    const hit = findViolations(src, srv).violations.find((v) => v.rule === wantRule);
    console.log(`  ${hit ? "✅" : "🚨"} ${name}  → ${hit ? `[${hit.rule}] ${hit.detail}` : "**検出できない**"}`);
    if (hit) alive++;
  }
  if (alive !== probes.length) {
    console.error(`🚨 自己検査に失敗しました（${alive}/${probes.length}）。この検査は信用できません。`);
    process.exit(1);
  }

  // 🚨 **見ていない形も、書き置きにせず毎回その場で通す。**（司令塔 2026-08-16・polish の形）
  //    ヘッダに「この形は見ません」と**書いた**だけでは、**今も本当かを確かめられない**。
  //    polish は書いてあった形を実際に通したら **5/5 見逃していた**。
  //    🚨 私も同じでした: ヘッダは「文字列リテラルの中も見逃す」と書いていたのに、
  //       通したら**拾って**いた（過検出）。**逆向きの誤りを書いたまま配っていた。**
  //
  // 🚨 **記録と食い違ったら落とします**（design が入れた形・司令塔 2026-08-16）。
  //    2026-08-16 の私は「塞がるのは改善なのだから赤くするのは間違い」と考えて
  //    **出すだけ・exit 0** にしていた。**この判断を変えた。** 理由は議論ではなく実測:
  //    🚨 **このファイルの冒頭注記は、逆向きのまま配られていた**
  //       （「文字列リテラルの中も見逃す」と書いてあったが、通したら拾っていた）。
  //    出すだけでは、**次に読む人は古い注記のほうを読む**。
  //    落とせば、直した人が **1 行直して**先へ進める。止まるのは 1 回だけ。
  //
  // 🚨 落とすのは「塞いだから」ではなく「**注記が古いから**」。
  //    直し方は下のメッセージに書く（このファイルの冒頭 2 行を書き換えるだけ）。
  const blind = [
    ["名前を変数で組み立てて登録する",
      serverText + '\nconst n = "ohmycms_zz_var";\nserver.registerTool(n, {});\n', "ohmycms_zz_var", "見逃す"],
    ["文字列リテラルの中の registerTool",
      serverText + "\nconst s = 'server.registerTool(\"ohmycms_zz_instr\", {})';\n", "ohmycms_zz_instr", "拾ってしまう"],
  ];
  // 🚨 **散文（冒頭の注記）と、この配列がずれていないことを先に確かめる。**
  //    突き合わせているのが配列だけだと、**配列を直して注記を直し忘れても緑**になり、
  //    次に読む人は**注記のほうを信じます**（司令塔 2026-08-16 / base2 の指摘）。
  {
    const self = readOrStop(fileURLToPath(import.meta.url), "この検査自身");
    const header = self.slice(0, self.indexOf("*/"));

    // 🚨 **落ちる分岐を足したら、台で通してからこの数を更新すること**
    //    （司令塔 2026-08-16 / design の③「死んだ条件」）。
    //    永久に false の比較は、`node --check` も終了コードも出力も**何も言わない**。
    //    通して見るしかない。2026-08-16 に全 11 本を台で通したところ、
    //    🚨 **3 本はその日まで一度も通っていなかった**——うち 1 本は
    //    「**写しがずれた**」＝ **この検査の存在理由そのもの**だった。
    //    🚨 これは【鳴る】。**数が合わなければ落ちる**（＝足したことに気づける）。
    //    通っていることまでは保証しない（**通したかは人が台で確かめる**）。
    const EXIT_BRANCHES = 12;
    const branches = (self.match(/process\.exit\(1\)/g) ?? []).length;
    if (branches !== EXIT_BRANCHES) {
      console.error(`🚨 落ちる分岐の数が変わりました（記録 ${EXIT_BRANCHES} → いま ${branches}）。`);
      console.error("   → 足した分岐を**台で実際に通して**から、EXIT_BRANCHES を更新してください。");
      console.error("     🚨 死んだ条件（永久に false）は、通さないかぎり気づけません。");
      process.exit(1);
    }
    const missing = blind
      .map(([label, , , recorded]) => `${label} → **${recorded}**`)
      .filter((phrase) => !header.includes(phrase));
    if (missing.length > 0) {
      console.error("🚨 冒頭の注記と、コードの記録（blind）がずれています。");
      for (const m of missing) console.error(`  注記に見つからない行: ${m}`);
      console.error("  → 冒頭「この検査が見ていない形」の行を、この形のまま書いてください。");
      process.exit(1);
    }
  }

  console.log("■【鳴る】この検査が見ていない形（**毎回その場で通しています**）");
  const stale = [];
  for (const [label, srv, probe, recorded] of blind) {
    const caught = findViolations(source, srv).violations.some((v) => v.detail.includes(probe));
    const actual = caught ? "拾ってしまう" : "見逃す";
    if (actual !== recorded) stale.push([label, recorded, actual]);
    console.log(`  ${actual === recorded ? "▫️" : "🔔"} ${label} → **${actual}**`);
  }
  if (stale.length > 0) {
    console.error("\n🔔 **冒頭の注記が古くなっています**（振る舞いが変わりました）。");
    for (const [label, recorded, actual] of stale) {
      console.error(`  ${label}\n      注記: 「${recorded}」\n      いま: 「${actual}」`);
    }
    console.error("  → このファイル冒頭「この検査が見ていない形」の2行を書き換えてください。");
    console.error("     🚨 **振る舞いが悪くなったのではありません。記録が追いついていないだけです。**");
    console.error("     🚨 直さずに通すと、次に読む人は**古いほうを信じます**（実際にそうなりました）。");
    process.exit(1);
  }
}

const { tools, violations } = findViolations(source, serverText);
if (violations.length > 0) {
  console.error("\n🚨 MCP のツール目録に問題があります。");
  // 🚨 **何で赤くなったかを出す**。「赤い」と「狙ったものを捕まえた」は別なので、
  //    rule を書かないと、別の理由で落ちたのを検出だと読んでしまう。
  for (const v of violations) console.error(`  [${v.rule}] ${v.detail}`);
  process.exit(1);
}


const rendered = JSON.stringify(tools, null, 2) + "\n";

if (WRITE) {
  writeFileSync(COPY, rendered);
  console.log(`✅ 写しを作り直しました: ${tools.length} 本 → ${COPY}`);
  process.exit(0);
}

if (!existsSync(COPY)) {
  console.error(`🚨 写しがありません: ${COPY}\n   node scripts/check-mcp-catalog.mjs --write で作ってください`);
  process.exit(1);
}

const current = readOrStop(COPY, "Studio 側の写し");
if (current === rendered) {
  console.log(`ツール ${tools.length} 本 — 正（packages/mcp/src/catalog.ts）と写しが一致`);
  // 🚨 **数だけを出さない。拾った実物を 2 本添える。**（司令塔 2026-08-16）
  //    「22 本一致」は、**中身が空でも成立します**。実際、素朴な抽出は 22 本中 7 本しか
  //    文言を拾えていないのに「完全一致」と出しました（2026-08-15・このファイルの冒頭に記録）。
  //    読んだ人が「抽出が正気か」をその場で確かめられるように、生の値を出す。
  //    規律は覚えている間しか効かないが、出力なら覚えていなくても効く。
  const withText = tools.filter((t) => t.title && t.description).length;
  console.log(`  文言まで拾えたもの: ${withText} / ${tools.length}` +
    (withText === tools.length ? "" : "  🚨 **拾えていないものがあります**"));
  for (const t of tools.slice(0, 2)) {
    console.log(`  例 ${t.name}`);
    console.log(`     title: ${JSON.stringify(String(t.title).slice(0, 60))}`);
    console.log(`     desc : ${JSON.stringify(String(t.description).slice(0, 60))}`);
  }
  process.exit(0);
}

console.error("🚨 MCP のツール目録が、Studio 側の写しとずれています。");
const currentTools = JSON.parse(current);
const byName = new Map(currentTools.map((t) => [t.name, t]));
for (const t of tools) {
  const c = byName.get(t.name);
  if (!c) {
    console.error(`  + ${t.name}（正にあるが写しに無い）`);
    continue;
  }
  for (const key of ["title", "description", "readOnly"]) {
    if (String(c[key]) !== String(t[key])) {
      console.error(`  ~ ${t.name}.${key}\n      正   : ${t[key]}\n      写し : ${c[key]}`);
    }
  }
  byName.delete(t.name);
}
for (const name of byName.keys()) console.error(`  - ${name}（写しにあるが正に無い）`);
console.error("\n  直すには: node scripts/check-mcp-catalog.mjs --write");
process.exit(1);
