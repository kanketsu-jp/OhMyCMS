#!/usr/bin/env node
/**
 * ナビゲーションの「2部品トラップ」を機械的に検出する。
 *
 * 由来（2026-08-15 実測）: 管理画面のナビは PC 用の `<LeftSidebar>`（components/admin/left-sidebar.tsx）
 * と SP 用の `<MobileNav>`（components/admin/mobile-nav.tsx）という**別々のコンポーネント**が、
 * `app/(admin)/layout.tsx` から渡された**同じデータ**を独自に描画している。
 *
 * このため、layout.tsx が新しい行き先（例: 通知 `bottomItems` / 不具合報告 `reports`）を
 * `<LeftSidebar>` にだけ配線して `<MobileNav>` への配線を忘れる、という事故が起きた。
 * 実際に「通知」と「不具合報告」が **SP（390px 幅）でだけ消えていた**（PC は正常）。
 * PC 幅で確認する受入ハーネスはこれを検出できず、**PASS のまま見逃されていた**。
 *
 * このスクリプトは layout.tsx を読み、`<LeftSidebar …>` と `<MobileNav …>` それぞれに
 * 渡している prop 名の集合を比較する。片方にしか無い prop があれば、
 * 下の EXCEPTIONS に理由付きで載っているもの以外は **失敗（exit 1）**として報告する。
 *
 * これにより「データを1コンポーネントにしか配線しない」という同じ形の事故を、
 * 実装を読まなくても機械的に検出できるようにする。
 *
 * 🚨 2026-08-15 に、このスクリプト自身が同じ事故を隠す側に回っていたことが判明した。
 * `collectionsError`（コレクション取得失敗時のエラー文言）が `<LeftSidebar>` にしか
 * 配線されておらず、SP は読み込み失敗を静かに無視していた。この未修正の欠落を、
 * EXCEPTIONS の理由に「SP未対応は既知の差分（本チェックの対象外として明示）」と書いて
 * **緑にしていた**。検査が「まだやっていないこと」を正当な設計判断として通してしまうと、
 * 検査があるという理由で誰も直さなくなる。そのため EXCEPTIONS の reason に
 * 「未対応」「未実装」「既知の差分」「TODO」「後で」等の**未完了を示す語**が含まれていたら、
 * このスクリプト自体が exit 1 で拒否する（下の `assertExceptionsAreDesignDecisions` 参照）。
 * EXCEPTIONS は**設計上そうする理由**だけを書く場所であり、「まだ直していない」の言い訳置き場ではない。
 *
 * 🚨 追記（2026-08-15・2回目）: この検査には自己検査が無かった。「本当に検出できるか」を
 * その場で証明していなかったので、将来ここが空振りするようになっても緑のまま気づけない。
 * `check-user-label-leak.mjs` と同じ流儀（判定ロジックを「{ ファイル名: 中身 } の写し」を
 * 受け取る純関数 `judgeParity` に切り出し、実物の写しをメモリ上で壊して RED/GREEN を毎回
 * その場で確かめる）を足した。壊すのはメモリ上の写しだけで、ディスク上の layout.tsx は
 * 一切書き換えない。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** 判定対象の実物。壊すときもこの写しを差し替える。 */
const LAYOUT_FILE = "app/(admin)/layout.tsx";

function read(file) {
  return readFileSync(path.join(root, file), "utf8");
}

// 🚨 片方のコンポーネントにしか無くて正しい prop。
// 追加するときは**理由を1行で書く**（隠れた例外を作らない）。
// 🚨 **この守り手が見ていない範囲**（塞げないものは隠さず書く）:
//   ・**props の名前しか見ていない**。同じ名前で**違う値**を渡していても通る
//     （例: 片方に `items={all}`、もう片方に `items={[]}` でも「両方に在る」と判定する）
//   ・**layout.tsx の外**で描かれた場合 → 見つからないので**落ちる**（黙って通ることは無い）
//   ・**条件付きで渡す形**（`{...(cond ? {a:1} : {})}`）→ spread を禁止したので**落ちる**
//   ・**実際に画面へ出ているか** → 見ていない。本物は SP/PC を両方開いて数える
const EXCEPTIONS = {
  brand: {
    onlyIn: "LeftSidebar",
    reason: "PCヘッダーのブランド表示用。SPヘッダーはブランド表示を外す設計（堀池 2026-08-15指示）",
    recordedAt: "2026-08-15",
    status: "decided",
    decider: "堀池（指示）",
    question: "—（決定済み。SPヘッダーにブランドを出さない）",
  },
  logo: {
    onlyIn: "LeftSidebar",
    reason: "同上。SPヘッダーにロゴを出さない設計のため",
    recordedAt: "2026-08-15",
    status: "decided",
    decider: "堀池（指示）",
    question: "—（決定済み）",
  },
  contentHeading: {
    onlyIn: "MobileNav",
    reason: "SPドロワー内で「コンテンツ」見出しラベルを描画するために必要。PCは left-sidebar.tsx が useT() を直接呼んで自前で用意している",
    recordedAt: "2026-08-15",
    status: "decided",
    decider: "base2（実装上の事実）",
    question: "—（決定済み。PC は自前で用意している）",
  },
  personalUnreadNotifications: {
    onlyIn: "MobileNav",
    reason:
      "SPのフッターから通知を外した代わりに、☰ に未読バッジを出すため（堀池 2026-08-15指示）。" +
      "PCは左サイドバーの一覧に通知の行が常に見えているので、バッジで知らせる必要がない",
    recordedAt: "2026-08-15",
    status: "decided",
    decider: "堀池（指示）＋司令塔（第1段の承認）",
    question: "—（決定済み。SP だけに出す）",
  },
};

// 🚨 例外の行に「いつ・未決か・誰が決めるか・何を決めるか」を必ず持たせる（司令塔の規律13）。
//    理由: **黙って緑が続くと、決める人が居ることを誰も思い出さない**。
//    「承認」は多くの場合「いま在ることを記録した」だけで、「これでよい」ではない。
const REQUIRED_FIELDS = ["onlyIn", "reason", "recordedAt", "status", "decider", "question"];

function assertExceptionsAreComplete() {
  const bad = [];
  for (const [prop, entry] of Object.entries(EXCEPTIONS)) {
    const missing = REQUIRED_FIELDS.filter((f) => !entry[f]);
    if (missing.length > 0) bad.push(`${prop}: ${missing.join(" / ")} が無い`);
    if (entry.status && !["decided", "undecided"].includes(entry.status)) {
      bad.push(`${prop}: status は decided か undecided（いまは "${entry.status}"）`);
    }
  }
  if (bad.length > 0) {
    console.error("check-nav-parity: FAIL — EXCEPTIONS の行に足りない項目がある\n");
    for (const b of bad) console.error(`  ${b}`);
    console.error(
      "\n  🚨 例外は「いま在ることを記録した」だけのことが多く、「これでよい」とは限らない。" +
        "\n  黙って緑が続くと、決める人が居ることを誰も思い出さないので、" +
        "\n  いつ記録したか / 未決か / 決める人 / 何を決めるのか を必ず書く。",
    );
    process.exit(1);
  }
}

/** 🚨 未決のものは、緑のときも毎回出す（出さないと解決済みとして扱われ始める）。 */
function reportUndecided() {
  const undecided = Object.entries(EXCEPTIONS).filter(([, e]) => e.status === "undecided");
  if (undecided.length === 0) return;
  console.log(`\n🟡 未決の例外: ${undecided.length} 件（緑ですが、決まっていません）`);
  for (const [prop, e] of undecided) {
    console.log(`  ${prop}  記録 ${e.recordedAt} / 決める人: ${e.decider}`);
    console.log(`    何を決めるのか: ${e.question}`);
  }
}

// 🚨 EXCEPTIONS の reason にこれらの語が含まれていたら、それは「設計判断」ではなく
// 「まだ直していないこと」を書いているだけ。exit 1 で拒否する（上のヘッダーコメント参照）。
const UNFINISHED_WORDS = ["未対応", "未実装", "既知の差分", "TODO", "後で"];

/**
 * EXCEPTIONS の reason が「まだやっていない」ことの言い訳になっていないかを確認する。
 * 見つけたら exit 1 で拒否する（このスクリプト自身が正当化の場所にならないため）。
 */
function assertExceptionsAreDesignDecisions() {
  const offenders = [];
  for (const [prop, entry] of Object.entries(EXCEPTIONS)) {
    const hit = UNFINISHED_WORDS.find((word) => entry.reason.includes(word));
    if (hit) {
      offenders.push({ prop, hit, reason: entry.reason });
    }
  }
  if (offenders.length === 0) return;

  console.error("check-nav-parity: FAIL — EXCEPTIONS の reason が「未完了」を示している\n");
  for (const { prop, hit, reason } of offenders) {
    console.error(`  ${prop}: 「${hit}」を含む reason は不可 → "${reason}"`);
  }
  console.error(
    "\n  EXCEPTIONS は「設計上、片方にしか渡さない」という決定だけを書く場所。" +
      "まだ配線していない・実装していない欠落を、ここに理由として書いて緑にしないこと。" +
      "配線するか、EXCEPTIONS から削除して未配線のまま失敗させるかのどちらかにする。",
  );
  process.exit(1);
}

/**
 * source 内の `<TagName …>` または `<TagName … />` を1つ探し、
 * トップレベル（`{}` の外）の `属性名=` を集めて返す。
 * `{}` の中（式の中）に `foo=` のような文字列が来ても誤検出しないよう、深さを見る。
 */
function extractTagProps(source, tagName) {
  const startMarker = `<${tagName}`;
  // 🚨 素の indexOf だと `<LeftSidebar` が `<LeftSidebarProvider` にもマッチしてしまう
  // （文字列としては前方一致する）。タグ名の直後が空白・改行・`/`・`>` であることまで見る。
  const tagStartRe = new RegExp(`<${tagName}(?=[\\s/>])`);
  const match = tagStartRe.exec(source);
  const start = match ? match.index : -1;
  if (start === -1) return null;

  let i = start + startMarker.length;
  let depth = 0;
  let end = -1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    } else if (depth === 0 && ch === "/" && source[i + 1] === ">") {
      end = i;
      break;
    } else if (depth === 0 && ch === ">") {
      end = i;
      break;
    }
    i++;
  }
  if (end === -1) {
    throw new Error(`<${tagName} …> の閉じタグが見つからない（layout.tsx の構造が変わった可能性）`);
  }

  const tagBody = source.slice(start + startMarker.length, end);
  const propNames = new Set();
  const re = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=/g;
  let m;
  while ((m = re.exec(tagBody)) !== null) {
    propNames.add(m[1]);
  }
  // 🚨 spread（`{...obj}`）はこの抽出に**一切写らない**（`name=` の形を持たないため）。
  //    2026-08-15、作業者が「この検査に見つからないように」と spread を選んだと申告してきて発覚した。
  //    申告が無ければ気づけなかった——**検査が黙って素通りしていた**。
  //    実測: 直接渡す → exit 1 ／ 同じものを spread → exit 0。
  //    → 見つけたら**落とす**。片側だけに渡すこと自体は EXCEPTIONS で宣言できるので、
  //      **宣言する道があるのに黙って回避する道を残さない**。
  propNames.spreads = (tagBody.match(/\{\s*\.\.\./g) ?? []).length;
  return propNames;
}

/**
 * 判定本体。ディスクを読まず「{ ファイル名: 中身 } の写し」を受け取る純関数にする
 * （自己検査で、実物をメモリ上で壊した写しを渡せるようにするため）。
 *
 * 返り値の violations は `{ rule, detail }` の配列。rule のラベル一覧:
 *   - "missing-file" : LAYOUT_FILE が sources に無い
 *   - "parse-error"  : タグの閉じが見つからない等でパースに失敗した
 *   - "missing-tag"  : <LeftSidebar …> / <MobileNav …> 自体が無い
 *   - "spread"       : どちらかのタグが props を spread で渡している
 *   - "empty-props"  : 片方の props が 0 件（対象を拾えていない可能性）
 *   - "onlyLeft"     : <LeftSidebar> にしか無い prop で、EXCEPTIONS の説明が無い
 *   - "onlyMobile"   : <MobileNav> にしか無い prop で、EXCEPTIONS の説明が無い
 *
 * spread が見つかった場合は、その時点の props 集合が信用できないため（spread の
 * 中身が一切見えていない）、onlyLeft/onlyMobile の判定はせず早期に返す
 * （元の実装が spread 検出時に即 process.exit(1) していたのと同じ考え方）。
 */
function judgeParity(sources) {
  const violations = [];
  const source = sources[LAYOUT_FILE];

  if (source === undefined) {
    violations.push({ rule: "missing-file", detail: `${LAYOUT_FILE} が sources に無い` });
    return { violations, leftProps: null, mobileProps: null };
  }

  let leftProps = null;
  let mobileProps = null;
  try {
    leftProps = extractTagProps(source, "LeftSidebar");
    mobileProps = extractTagProps(source, "MobileNav");
  } catch (e) {
    violations.push({ rule: "parse-error", detail: e.message });
    return { violations, leftProps: null, mobileProps: null };
  }

  if (!leftProps) {
    violations.push({ rule: "missing-tag", detail: "<LeftSidebar …> が layout.tsx に見つからない" });
  }
  if (!mobileProps) {
    violations.push({ rule: "missing-tag", detail: "<MobileNav …> が layout.tsx に見つからない" });
  }
  if (!leftProps || !mobileProps) {
    return { violations, leftProps, mobileProps };
  }

  // 🚨 spread の中身はこの検査から見えないので、「片方にしか渡していない」を黙って隠せてしまう。
  //    見つけたら即座に報告し、以降の parity 判定（信用できない）はしない。
  const spreads = [
    ["LeftSidebar", leftProps.spreads],
    ["MobileNav", mobileProps.spreads],
  ].filter(([, n]) => n > 0);
  if (spreads.length > 0) {
    for (const [tag, n] of spreads) {
      violations.push({ rule: "spread", detail: `<${tag}> に {...} が ${n} 件` });
    }
    return { violations, leftProps, mobileProps };
  }

  // 🚨 対象を1件も拾えていないのに緑になる（EXCEPTIONS 差分だけで判定して素通りする）のを防ぐ。
  //    実測（HEAD af7b597）: 通常は <LeftSidebar> 12 props / <MobileNav> 12 props。
  if (leftProps.size === 0) {
    violations.push({ rule: "empty-props", detail: "<LeftSidebar> の props が 0 件（対象を拾えていない可能性）" });
  }
  if (mobileProps.size === 0) {
    violations.push({ rule: "empty-props", detail: "<MobileNav> の props が 0 件（対象を拾えていない可能性）" });
  }

  const leftOnly = [...leftProps].filter((p) => !mobileProps.has(p));
  const mobileOnly = [...mobileProps].filter((p) => !leftProps.has(p));

  const unexplainedLeftOnly = leftOnly.filter((p) => EXCEPTIONS[p]?.onlyIn !== "LeftSidebar");
  const unexplainedMobileOnly = mobileOnly.filter((p) => EXCEPTIONS[p]?.onlyIn !== "MobileNav");

  for (const p of unexplainedLeftOnly) {
    violations.push({
      rule: "onlyLeft",
      detail: `<LeftSidebar> にはあるが <MobileNav> に無い（未説明）: ${p}`,
    });
  }
  for (const p of unexplainedMobileOnly) {
    violations.push({
      rule: "onlyMobile",
      detail: `<MobileNav> にはあるが <LeftSidebar> に無い（未説明）: ${p}`,
    });
  }

  return { violations, leftProps, mobileProps };
}

function loadSources() {
  return { [LAYOUT_FILE]: read(LAYOUT_FILE) };
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

// ── 1) 自己検査: わざと壊して、赤くなることを確かめる ──────────────────────
// 壊し方は3通り。片方向だけだと「たまたま落ちた」が混ざるので、
// LeftSidebar 側／MobileNav 側の両方向と、spread の3本を試す。

const LEFT_ANCHOR = "<LeftSidebar\n        brand={brand}";
const MOBILE_ANCHOR =
  "<MobileNav\n        // SP メニューボタンのバッジ専用。ナビの行き先データではないので PC サイドバーへは渡さない。\n        personalUnreadNotifications={personalUnreadNotifications}";

const selfTests = [
  {
    name: "壊し方1: <LeftSidebar> にだけ zzSelfTestOnlyLeft を足す（片側のみ・LeftSidebar方向）",
    expectRule: "onlyLeft",
    expectNeedle: "zzSelfTestOnlyLeft",
    apply(sources) {
      const before = sources[LAYOUT_FILE];
      const count = countOccurrences(before, LEFT_ANCHOR);
      const after = before.replace(LEFT_ANCHOR, "<LeftSidebar\n        zzSelfTestOnlyLeft={1}\n        brand={brand}");
      return { sources: { ...sources, [LAYOUT_FILE]: after }, count };
    },
  },
  {
    // 🚨 片方向だけ試すと「たまたま落ちた」が混ざる。onlyLeft と onlyMobile は
    //    別々の配列（leftOnly / mobileOnly）から作られるので、逆方向も必ず試す。
    name: "壊し方2: <MobileNav> にだけ zzSelfTestOnlyMobile を足す（片側のみ・逆方向）",
    expectRule: "onlyMobile",
    expectNeedle: "zzSelfTestOnlyMobile",
    apply(sources) {
      const before = sources[LAYOUT_FILE];
      const count = countOccurrences(before, MOBILE_ANCHOR);
      const after = before.replace(
        MOBILE_ANCHOR,
        "<MobileNav\n        zzSelfTestOnlyMobile={1}\n        // SP メニューボタンのバッジ専用。ナビの行き先データではないので PC サイドバーへは渡さない。\n        personalUnreadNotifications={personalUnreadNotifications}",
      );
      return { sources: { ...sources, [LAYOUT_FILE]: after }, count };
    },
  },
  {
    name: "壊し方3: <LeftSidebar> に {...{ zzSelfTestSpread: 1 }} を足す（spread）",
    expectRule: "spread",
    expectNeedle: "<LeftSidebar>",
    apply(sources) {
      const before = sources[LAYOUT_FILE];
      const count = countOccurrences(before, LEFT_ANCHOR);
      const after = before.replace(
        LEFT_ANCHOR,
        "<LeftSidebar\n        {...{ zzSelfTestSpread: 1 }}\n        brand={brand}",
      );
      return { sources: { ...sources, [LAYOUT_FILE]: after }, count };
    },
  },
];

// ── 1b) 対照検査: 壊していない変更で誤検出しないことを確かめる（GREENの確認） ──
// 🚨 EXCEPTIONS に載っている既存の差分（brand / logo / contentHeading /
//    personalUnreadNotifications）が、そのままで違反 0 件・exit 0 になることを確かめる。
//    ＝ EXCEPTIONS の仕組み自体が効いていることの確認。

const greenTests = [
  {
    name: "対照1: EXCEPTIONS に載っている既存の差分はそのままで違反 0 件になる",
    apply(sources) {
      // 何も壊さない。LEFT_ANCHOR が今も見つかることだけを確認し、
      // 「スクリプトが前提にしているレイアウト構造がまだ生きているか」を担保する
      // （anchor が見つからなければ count=0 になり、下の「置換 0 件」検出に回る）。
      const count = countOccurrences(sources[LAYOUT_FILE], LEFT_ANCHOR);
      return { sources, count };
    },
  },
];

const original = loadSources();
// 🚨 **外側（読み込み）が死んだら、生のスタックで落ちていた**（2026-08-16 実測）。
//    exit は 1 なので黙って通ることは無いが、**読んだ人には理由が分からない**。
//    司令塔 2026-08-16「候補と、実際に走査した数を分けて出す。走査 0 なら落とす」。
//    🚨 ここで**読めた件数**を先に出し、対象が無ければ**読める文で**落とす。
{
  const 読めた = Object.keys(original).length;
  // 🚨 **件数だけだと「1 ファイル」は 0 バイトでも出る**（司令塔 2026-08-16 / polish の形）。
  //    **読めた文字数**も出す。0 なら数字が明らかにおかしいと分かる。
  //    🚨 名前の意味: 「読み込み」＝ **実際に readFileSync した数**（候補の数ではない）。
  const 文字数 = typeof original?.[LAYOUT_FILE] === "string" ? original[LAYOUT_FILE].length : 0;
  console.log(`読み込み: ${読めた} ファイル / ${文字数} 文字（判定に要るのは ${LAYOUT_FILE}）`);
  if (原本が無い(original)) {
    console.error(
      `🚨 ${LAYOUT_FILE} を読めていません（読み込み ${読めた} ファイル）。\n` +
        `   **この検査は何も見ていません。** 緑でも意味を持ちません。\n` +
        `   考えられる原因: 走らせた場所が違う（apps/studio から走らせる）／ファイルが移動した。`,
    );
    process.exit(1);
  }
}
function 原本が無い(sources) {
  return typeof sources?.[LAYOUT_FILE] !== "string" || sources[LAYOUT_FILE].length === 0;
}

function main() {
  assertExceptionsAreDesignDecisions();
  assertExceptionsAreComplete();

  // 🚨 **この検査には「死角が塞がったら鳴る」仕掛けを入れていません。理由:**
  //    4/4 の見逃しは **props の「名前」しか見ない**という**構造的な死角**で、
  //    塞ぐには「値まで比べる」＝**別の検査**になる。**塞がる見込みが無いものに鳴る仕掛けを足すと、
  //    永久に鳴らない仕掛けが増えるだけ**なので入れていない（司令塔 2026-08-16 承認）。
  //    🚨 **入れ忘れではありません。** 値まで比べる検査を作るなら、そのときに考えること。
  //    （なお**拾えた入力には理由を印字する**ので、塞がったことには気づけます）
  // ── 🚨 **見逃す入力を、自分で作って通す**（司令塔 2026-08-16）
  //    取りこぼしの**数**は数えられない（出てこないので）。
  //    だが「**この形は取りこぼす**」は、**作れば必ず示せる**。
  //    🚨 落とさない（落とすと全員のコミットが止まる）。**見逃したことを印字するだけ**。
  //    🚨 対照（拾える入力）が拾えなければ **exit 1**——
  //       対照が死んでいると「見逃した」は「検出器が死んでいるだけ」になり、何も言っていない。
  const 見逃す入力 = [
    // 🚨 **入れ子の波括弧に注意**。`items={navItems.map(...)}` を `\{[^}]*\}` で狙うと
    //    途中で切れて JSX が壊れ、**別の理由（onlyLeft）で拾われる**（2026-08-16 に実際にやった）。
    //    → **タグの手前で切ってから、入れ子の無い prop を狙う**。
    ["同じ prop 名で、渡している値が違う（片方を空配列にする）",
     (s) => {
       const k = s.indexOf("<MobileNav");
       if (k < 0) return s;
       return s.slice(0, k) + s.slice(k).replace("groups={navGroups}", "groups={[]}");
     }],
    ["同じ prop を 2 回渡す（後ろが勝つので、実質は別の値）",
     (s) => {
       const k = s.indexOf("<MobileNav");
       if (k < 0) return s;
       return s.slice(0, k) + s.slice(k).replace("groups={navGroups}", "groups={navGroups} groups={[]}");
     }],
    ["3 つ目のナビ部品を足す（この検査は 2 つしか見ていない）",
     (s) => s.replace("<MobileNav", "<TabletNav items={items} />\n      <MobileNav")],
    ["prop の値だけコメントアウトする（名前は残る）",
     (s) => {
       const k = s.indexOf("<MobileNav");
       if (k < 0) return s;
       return s.slice(0, k) + s.slice(k).replace("groups={navGroups}", "groups={/* 消した */ navGroups}");
     }],
  ];

  const 見逃した = [];
  const 拾えた = [];
  for (const [名, 壊す] of 見逃す入力) {
    const 壊れた = 壊す(original[LAYOUT_FILE]);
    if (壊れた === original[LAYOUT_FILE]) {
      // 🚨 置換が当たっていない ＝ **見逃したかどうかを測れていない**
      見逃した.push(`${名}  🚨 （置換が当たらず、測れていません）`);
      continue;
    }
    const { violations } = judgeParity({ ...original, [LAYOUT_FILE]: 壊れた });
    if (violations.length === 0) {
      見逃した.push(名);
    } else {
      // 🚨 **拾えた理由を必ず出す。** 別の理由（parse-error 等）で拾っていると、
      //    「この形は見ている」と誤読する（2026-08-16 に a11y 側で実際にやった）。
      const 理由 = [...new Set(violations.map((v) => v.rule))].join(",");
      拾えた.push(`${名}  → rule: ${理由}`);
    }
  }
  // 🟢 対照(+): 拾える入力（片側だけに prop）を 1 つ通す
  const 対照 = judgeParity({
    ...original,
    [LAYOUT_FILE]: original[LAYOUT_FILE].replace("<LeftSidebar", "<LeftSidebar\n        zzControlOnlyLeft={1}"),
  });
  if (対照.violations.length === 0) {
    console.error("🚨 対照の入力すら拾えていません。見逃しの一覧は読めません（検出器が壊れています）。");
    process.exit(1);
  }
  if (見逃した.length > 0) {
    console.log(`■ 🚨 この検査が**見ていない形** ${見逃した.length} / ${見逃す入力.length} 件（作って通した。落としません）`);
    for (const n of 見逃した) console.log(`  ・${n}`);
  }
  if (拾えた.length > 0) {
    console.log(`■ 拾えた ${拾えた.length} 件（🚨 **理由を見ること**。狙いと違う理由なら死角のまま）`);
    for (const n of 拾えた) console.log(`  ・${n}`);
  }

  console.log("■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
  let selfTestFailed = false;
  for (const test of selfTests) {
    const { sources, count } = test.apply(original);
    const { violations } = judgeParity(sources);
    const matched = violations.filter((v) => v.rule === test.expectRule && v.detail.includes(test.expectNeedle));
    // 🚨 置換が 0 件なら、壊せていない。「赤くならなかった」ではなく「壊れていない」が正しい。
    const detected = count > 0 && matched.length > 0;

    const detectedRules = [...new Set(violations.map((v) => v.rule))].join(",") || "-";
    console.log(
      `  ${detected ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${violations.length} 件（rule: ${detectedRules}、期待 rule "${test.expectRule}" ${matched.length}件一致）`,
    );
    if (count === 0) {
      console.error("     ↑ 置換が 0 件。壊せていないので、赤くならないのは当然。検査の書き方が古い。");
    }

    if (!detected) selfTestFailed = true;
  }

  console.log("\n■ 対照検査（壊していない変更で誤検出しないことを確かめる）");
  let greenTestFailed = false;
  for (const test of greenTests) {
    const { sources, count } = test.apply(original);
    const { violations } = judgeParity(sources);
    const clean = count > 0 && violations.length === 0;

    console.log(`  ${clean ? "✅" : "❌"} ${test.name}  置換 ${count} 件 → 検出 ${violations.length} 件`);
    if (count === 0) {
      console.error("     ↑ 置換が 0 件。前提の anchor が見つからない（layout.tsx の構造が変わった可能性）。");
    }
    if (!clean && violations.length > 0) {
      for (const v of violations) {
        console.error(`     誤検出 [${v.rule}] ${v.detail}`);
      }
    }

    if (!clean) greenTestFailed = true;
  }

  // ── 2) 本番の判定 ─────────────────────────────────────────────────────
  const { violations, leftProps, mobileProps } = judgeParity(original);

  console.log("\n■ 判定");
  if (leftProps && mobileProps) {
    console.log(`  <LeftSidebar> ${leftProps.size} props / <MobileNav> ${mobileProps.size} props`);
  }
  console.log(`  違反: ${violations.length} 件`);

  if (violations.length > 0) {
    console.error("\n  PC と SP のナビに渡している prop が食い違っている（または検査自体が判定できない状態）:");
    // 🚨 **拾った実物を必ず添える**（司令塔 2026-08-16）。
    //    件数と説明だけだと、**なぜそう判定したかを他人が確かめられない**。
    //    今日、別の検査で「12 か 10 か」が 3 回ひっくり返った原因が、出力が件数だけだったこと。
    if (leftProps && mobileProps) {
      console.error(`  実物 <LeftSidebar> の props（${leftProps.size} 件）: ${[...leftProps].join(", ")}`);
      console.error(`  実物 <MobileNav>   の props（${mobileProps.size} 件）: ${[...mobileProps].join(", ")}`);
    } else {
      console.error("  🚨 実物を出せません（props を取れていない＝判定以前の状態）");
    }
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.detail}`);
    }
    console.error(
      "\n  正しい行き先データを渡し忘れている可能性がある（実例: bottomItems / reports が MobileNav に配線されておらず、SPから通知・不具合報告が消えた）。",
    );
    console.error(
      "  意図した片側だけの prop なら、このスクリプト冒頭の EXCEPTIONS に理由付きで追加すること。",
    );
  } else {
    console.log("  OK — 差分は全て EXCEPTIONS に理由あり。");
  }

  if (selfTestFailed) {
    console.error("\n🚨 自己検査（RED）に失敗した。**この検査の結果は信用できない**（緑でも意味を持たない）。");
  }
  if (greenTestFailed) {
    console.error("\n🚨 対照検査（GREEN）に失敗した。壊していない変更で誤検出している（過検出）。");
  }

  // 🚨 **緑のときも未決を出す。** 出さないと「解決済み」として扱われ始める（司令塔の規律13）。
  //    ここに置くのは、**成功・失敗のどちらの経路でも必ず通る**ため。
  //    （最初は成功メッセージの隣に足そうとして置換を外し、**定義したのに一度も呼ばれない**状態を作った）
  reportUndecided();

  process.exit(violations.length === 0 && !selfTestFailed && !greenTestFailed ? 0 : 1);
}

main();
