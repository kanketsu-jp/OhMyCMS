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
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT_PATH = path.join(__dirname, "..", "app", "(admin)", "layout.tsx");

// 🚨 片方のコンポーネントにしか無くて正しい prop。
// 追加するときは**理由を1行で書く**（隠れた例外を作らない）。
const EXCEPTIONS = {
  brand: {
    onlyIn: "LeftSidebar",
    reason: "PCヘッダーのブランド表示用。SPヘッダーはブランド表示を外す設計（堀池 2026-08-15指示）",
  },
  logo: {
    onlyIn: "LeftSidebar",
    reason: "同上。SPヘッダーにロゴを出さない設計のため",
  },
  contentHeading: {
    onlyIn: "MobileNav",
    reason: "SPドロワー内で「コンテンツ」見出しラベルを描画するために必要。PCは left-sidebar.tsx が useT() を直接呼んで自前で用意している",
  },
  personalUnreadNotifications: {
    onlyIn: "MobileNav",
    reason:
      "SPのフッターから通知を外した代わりに、☰ に未読バッジを出すため（堀池 2026-08-15指示）。" +
      "PCは左サイドバーの一覧に通知の行が常に見えているので、バッジで知らせる必要がない",
  },
};

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

function main() {
  assertExceptionsAreDesignDecisions();

  const source = readFileSync(LAYOUT_PATH, "utf8");

  const leftSidebarProps = extractTagProps(source, "LeftSidebar");
  const mobileNavProps = extractTagProps(source, "MobileNav");

  if (!leftSidebarProps) {
    console.error("check-nav-parity: <LeftSidebar …> が layout.tsx に見つからない");
    process.exit(1);
  }
  if (!mobileNavProps) {
    console.error("check-nav-parity: <MobileNav …> が layout.tsx に見つからない");
    process.exit(1);
  }

  // 🚨 spread があると、この検査は**その中身を一つも見られない**。
  //    「片方にしか渡していない」を隠せてしまうので、spread 自体を許さない。
  const spreads = [
    ["LeftSidebar", leftSidebarProps.spreads],
    ["MobileNav", mobileNavProps.spreads],
  ].filter(([, n]) => n > 0);
  if (spreads.length > 0) {
    console.error("check-nav-parity: FAIL — props を spread で渡している\n");
    for (const [tag, n] of spreads) {
      console.error(`  <${tag}> に {...} が ${n} 件`);
    }
    console.error(
      "\n  spread の中身はこの検査から見えないので、" +
        "「片方にしか渡していない」を黙って隠せてしまう。\n" +
        "  🚨 片側だけに渡すのが設計上の判断なら、**直接渡したうえで EXCEPTIONS に理由を書く**。\n" +
        "  検査に見つからない書き方を選ぶのではなく、見つかる書き方で宣言すること。",
    );
    process.exit(1);
  }

  const leftOnly = [...leftSidebarProps].filter((p) => !mobileNavProps.has(p));
  const mobileOnly = [...mobileNavProps].filter((p) => !leftSidebarProps.has(p));

  const unexplainedLeftOnly = leftOnly.filter((p) => EXCEPTIONS[p]?.onlyIn !== "LeftSidebar");
  const unexplainedMobileOnly = mobileOnly.filter((p) => EXCEPTIONS[p]?.onlyIn !== "MobileNav");

  if (unexplainedLeftOnly.length === 0 && unexplainedMobileOnly.length === 0) {
    console.log(
      `check-nav-parity: OK — <LeftSidebar> ${leftSidebarProps.size} props / <MobileNav> ${mobileNavProps.size} props。差分は全て EXCEPTIONS に理由あり。`,
    );
    process.exit(0);
  }

  console.error("check-nav-parity: FAIL — PC と SP のナビに渡している prop が食い違っている\n");
  if (unexplainedLeftOnly.length > 0) {
    console.error(
      `  <LeftSidebar> にはあるが <MobileNav> に無い（未説明）: ${unexplainedLeftOnly.join(", ")}`,
    );
  }
  if (unexplainedMobileOnly.length > 0) {
    console.error(
      `  <MobileNav> にはあるが <LeftSidebar> に無い（未説明）: ${unexplainedMobileOnly.join(", ")}`,
    );
  }
  console.error(
    "\n  正しい行き先データを渡し忘れている可能性がある（実例: bottomItems / reports が MobileNav に配線されておらず、SPから通知・不具合報告が消えた）。",
  );
  console.error(
    "  意図した片側だけの prop なら、このスクリプト冒頭の EXCEPTIONS に理由付きで追加すること。",
  );
  process.exit(1);
}

main();
