#!/usr/bin/env node
/**
 * ⌘Enter の**宣言された保存の鍵**を持つ画面が、**黙って減らない**ようにする。
 *
 * 由来（2026-08-16 実測）:
 *   d635b58「一覧＋その場で足すフォーム 6 枚を揃える（主ボタンを持たない）」で
 *   `PAGE_ACTIONS` から 4 ルートの宣言が消え、**宣言された保存の鍵が 4 ルート減った**。
 *   `mcp-catalog` が「正と写しがずれている」で赤くなったが、
 *   🚨 **写しを作り直したら緑に戻り、減ったことは緑の中に残った**（ff1fe6b / 58f6973）。
 *   design の原文:「私は 58f6973 で写しを作り直して緑にして満足しました。
 *                  減ったことは、緑の中に残ったままでした」
 *   ＝ **「緑になったこと」と「直ったこと」は別**。この検査はその差を埋める。
 *
 * なぜ守るのか（実装を直す人が理由を消さないように、ここにも残す）:
 *   ⌘Enter は **キーボードだけで操作する人の保存の導線**。
 *   🚨 マウスで押せる人には代わりが在るが、**そうでない人には代わりが無い**。
 *   ＝「見える／押せる／読み上げられる」の 3 つ目に効く話。
 *
 * 見ているもの:
 *   台帳 `save-shortcut-routes.json` の routes と、
 *   写し `packages/mcp/src/shortcuts-snapshot.ts` の `mod+enter` の scope を突き合わせる。
 *     - 台帳に在るのに写しに無い、かつ removed に理由が無い → 🔴 黙って減った
 *     - 写しに在るのに台帳に無い               → 台帳の足し忘れ（台帳が腐る）
 *     - removed に在るのに写しにも在る          → 直ったので removed から消す
 *     - 写しが 0 件                            → 「全部ある」ではなく「見ていない」
 *
 * 🚨 **`PAGE_ACTIONS` を自分で読まない。** 導出はこのリポジトリに 1 つだけ
 *    （`build-shortcuts-manifest.mjs`）で、その出力が写しに入っている。
 *    ここで正規表現をもう 1 本書くと**抽出が 2 つになり、片方だけ直る**
 *    （2026-08-16 に実際にそれで 1 本潰した）。**写しを読むことで導出は 1 つのまま**。
 *    ＝ design がフォーム側へ ⌘Enter を移しても、**生成器の導出元が増えれば写しが正しくなる**ので、
 *      この検査は**そのまま動く**。
 *
 * 🚨 **【2026-08-16 訂正】この検査は「できること」を見ていない。「宣言された鍵」を見ている。**
 *    最初、ここに「仕組みではなく**できること**を見ている」と書いた。**誤りだった。**
 *    写しは `PAGE_ACTIONS` から導出されるので、**宣言された鍵しか見えない**。
 *    素のフォーム送信や、フォーム側が自分で付けた鍵は、**原理的に見えない**。
 *    ＝ **この検査が赤くても「⌘Enter が効かない」とは言えない。**
 *      言えるのは「**宣言された鍵が消えた**」まで。
 *
 * 🚨 **【同日・上の訂正に付けた根拠も誤りだったので、取り消す】**
 *    最初、根拠として「宣言が消えた画面でも押したら送信された（shell の実測）」を挙げ、
 *    「**素のフォーム送信が肩代わりしうる**」と書いた。**その測定は使えない。**
 *    測った木に **design の未コミットの直し（`hooks/use-form-submit-shortcut.ts`）が入っていた**
 *      `git status` … `A `（索引に在る）／ `git show HEAD:…` … exit 128（HEAD に無い）
 *      🟢 対照 `git show HEAD:next.config.ts` … exit 0（＝ この確かめ方は動いている）
 *    ＝ **直したものを測って、直す必要が無いと結論しかけた**（対照が対照になっていない）。
 *    🚨 **素のフォーム送信が肩代わりするかどうかは、いまも未測定。**
 *      分けるには **焦点を `document.body` に置いて押す**（宣言された鍵は `document` に付くので
 *      焦点がどこでも効く／素の送信は焦点が欄の中のときだけ効く）。
 *    🚨 上の見出し（この検査は宣言された鍵しか見ない）は、**導出元から言えるので残る**。
 *      消えたのは**根拠として引いた測定**だけ。**主張と根拠を分けて扱う。**
 *
 * 🚨 **数える単位は「ルート」であって「画面（ファイル）」ではない。**
 *   同じ退行を、画面で数えると **5**、ルートで数えると **4** になる（2026-08-16 実測）。
 *   d635b58 で `<PageAction>` を失ったのは 5 ファイル:
 *     agents / policies / roles / users-policy … `form=` を持つ `role="primary"` → **⌘Enter を失った（4）**
 *     policy-permissions ………………………… 🚨 `form=` が**無く** `onClick`（kind: "button"）
 *                                             → `page-action.tsx` が `!form` で降りるので
 *                                               **元から ⌘Enter を持っていない**（失っていない）
 *   ＝ **単位が違うだけでなく、5 枚目は種類が違う。** 出力には必ず「ルート」と書く。
 *
 * 🚨 **この検査が見ていない形**（毎回その場で通している囮以外）:
 *   ▫️ 写しと実装がずれている場合 → こちらは `mcp-catalog` の担当（役割を分けている）
 *   ▫️ 「保存できる状態のときだけ効く」（disabled / 編集モード）→ 写しの別の節が扱う
 *   ▫️ ヘッダの主ボタンを失っただけの画面（`form=` を持たないもの）→ **この検査の対象外**
 *      （⌘Enter は元から効いていないため。マウスの導線は `page-actions-rendered` の担当）
 *
 * 🚨 **導出元を足す場所はここではない。** design がフォーム側で ⌘Enter を受ける口を作ったら、
 *    足すのは `build-shortcuts-manifest.mjs` の `submitRoutes`（＝ 写しを作っている側）。
 *    この検査は写しを読むだけなので、**1 行も直さなくてよい**。
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readTracked } from "./lib/tracked-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studio = path.join(__dirname, "..");
const root = path.join(studio, "..", "..");

const SNAPSHOT_FILE = "packages/mcp/src/shortcuts-snapshot.ts";
const LEDGER_FILE = "apps/studio/scripts/save-shortcut-routes.json";

/**
 * 写しの本文から `mod+enter` の scope（ルート一覧）を取り出す。
 *
 * 🚨 **`]` で止めない。** ルートには `[collection]` や `[id]` が入るので、
 *    `"scope": [ ... ]` を `[\s\S]*?\]` で囲うと **`[collection]` の `]` で切れて 1 件しか取れない**。
 *    実測（2026-08-16・この検査を書いているときに踏んだ）: 11 件のはずが **1 件**になった。
 *    → 項目の始まりから `"label_key"` までを範囲にして、その中の `"page:…"` を全部拾う。
 */
export function extractSaveRoutes(snapshotSource) {
  const m = /"key":\s*"mod\+enter"([\s\S]*?)"label_key"/.exec(snapshotSource);
  if (!m) return null; // 🚨 「0 件」ではなく「見つからない」。呼び出し側で区別する
  return [...m[1].matchAll(/"page:([^"]+)"/g)].map((x) => x[1]);
}

/** 写しの保存鍵が未設定なら、保存ルートの宣言は存在しない。 */
export function isSaveShortcutUnassigned(snapshotSource) {
  return /"key":\s*"unassigned-save"[\s\S]*?"action":\s*"save"/.test(snapshotSource);
}

/**
 * 判定本体。ファイルを読まず配列だけを受け取る純関数にする
 * （自己検査で、実物の写しをメモリ上で壊して確かめられるようにするため）。
 *
 * violations の rule ラベル:
 *   - "empty-derived"        : 写しから 1 件も取れない（見ていない）
 *   - "missing-without-reason": 台帳に在るのに写しに無く、removed にも無い（🔴 黙って減った）
 *   - "removed-without-why"  : removed に在るが理由が空
 *   - "declared-but-present" : removed に在るのに写しにも在る（直ったので消す）
 *   - "undeclared-addition"  : 写しに在るのに台帳に無い（台帳の足し忘れ）
 *   - "ledger-mismatch"      : 台帳の件数 ≠ 写し + removed（内訳の合計が合わない）
 */
export function judgeSaveRoutes(derived, ledgerRoutes, removed) {
  const violations = [];

  if (derived === null || derived.length === 0) {
    violations.push({
      rule: "empty-derived",
      detail:
        "写しから ⌘Enter の scope を 1 件も取り出せない。**「全部ある」ではなく「見ていない」**" +
        "（写しが壊れた・書式が変わった・生成器が落ちた のいずれか）",
    });
    return { violations, counts: { derived: 0, ledger: ledgerRoutes.length, removed: removed.length } };
  }

  const derivedSet = new Set(derived);
  const ledgerSet = new Set(ledgerRoutes);
  const removedMap = new Map(removed.map((r) => [r.route, r.why ?? ""]));

  for (const route of ledgerRoutes) {
    if (derivedSet.has(route)) continue;
    if (!removedMap.has(route)) {
      violations.push({
        rule: "missing-without-reason",
        detail:
          `${route} から**宣言された保存の鍵**が消えている（台帳に在るのに写しに無い）。🚨 これは「⌘Enter が効かない」の意味ではない（素の送信やフォーム側の鍵は、この検査から見えない）。` +
          `\n      意図した削除なら ${LEDGER_FILE} の removed に**理由つきで**移すこと。` +
          `\n      🚨 理由が書けないなら、それは意図した削除ではない。`,
      });
    } else if (removedMap.get(route).trim() === "") {
      violations.push({
        rule: "removed-without-why",
        detail: `${route} が removed に在るが、why が空。**なぜ外したかを書くこと**（空の理由は理由ではない）`,
      });
    }
  }

  for (const r of removed) {
    if (derivedSet.has(r.route)) {
      violations.push({
        rule: "declared-but-present",
        detail: `${r.route} は removed に在るのに、写しにも在る（＝ 直っている）。${LEDGER_FILE} の removed からこの行を消すこと`,
      });
    }
    if (!ledgerSet.has(r.route)) {
      violations.push({
        rule: "removed-without-why",
        detail: `${r.route} が removed に在るが routes に無い。**routes にも残す**（台帳は「本来効くべき集合」なので、外したことで消さない）`,
      });
    }
  }

  for (const route of derived) {
    if (!ledgerSet.has(route)) {
      violations.push({
        rule: "undeclared-addition",
        detail: `${route} に**宣言された保存の鍵**が増えたが、台帳に無い。${LEDGER_FILE} の routes に 1 行足すこと`,
      });
    }
  }

  // 🚨 内訳の合計が元の数と一致するか（合わなければ二重計上か取りこぼし）。
  //    removed は routes の部分集合なので、写し + removed = 台帳 になるはず。
  const presentRemoved = removed.filter((r) => !derivedSet.has(r.route)).length;
  if (violations.length === 0 && derived.length + presentRemoved !== ledgerRoutes.length) {
    violations.push({
      rule: "ledger-mismatch",
      detail:
        `内訳の合計が合わない: 写し ${derived.length} + 外した ${presentRemoved} ≠ 台帳 ${ledgerRoutes.length}。` +
        "（どこかで二重に数えているか、取りこぼしている）",
    });
  }

  return {
    violations,
    counts: { derived: derived.length, ledger: ledgerRoutes.length, removed: removed.length },
  };
}

/** 索引（git ls-files）から読む。未追跡なら作業ツリーへ落として、**どちらから読んだかを出す**。 */
function readBoth(rel) {
  const abs = path.join(root, rel);
  const tracked = readTracked(abs);
  if (tracked !== null) return { source: tracked, from: "索引" };
  if (!existsSync(abs)) return { source: null, from: "🚨 在りません" };
  return {
    source: readFileSync(abs, "utf8"),
    from: "🚨 作業ツリー（まだ追跡されていません。新しい clone や CI には無い状態です）",
  };
}

function main() {
  const snap = readBoth(SNAPSHOT_FILE);
  const led = readBoth(LEDGER_FILE);

  // 🚨 照合する相手が居ないときは、黙って緑にせず**診断を出して打ち切る**
  //    （「載っていないものが 0 件」ではなく「何も見ていない」）。
  for (const [name, r] of [[SNAPSHOT_FILE, snap], [LEDGER_FILE, led]]) {
    if (r.source === null) {
      console.error("■ 診断");
      console.error(`  ${name} が在りません。**照合する相手が居ない**ので、この検査は何も見ていません。`);
      process.exit(1);
    }
  }

  const derived = extractSaveRoutes(snap.source);
  const saveShortcutUnassigned = isSaveShortcutUnassigned(snap.source);
  const ledger = JSON.parse(led.source);
  const ledgerRoutes = ledger.routes ?? [];
  const removed = ledger.removed ?? [];

  // 🚨 どちら側から読んだか・何文字読んだかを必ず出す（黙って切り替えると赤の向きが変わった理由が分からない）
  console.log(
    `読み込み: 写し ${snap.source.length} 文字（${snap.from}）→ ⌘Enter の scope ${derived === null ? "🚨 取り出せません" : `${derived.length} ルート`}` +
      ` ／ 台帳 ${ledgerRoutes.length} ルート・外した ${removed.length} ルート（${led.from}）` +
      "\n  🚨 単位は**ルート**（画面＝ファイルで数えると数が変わる。同じ退行が 5 画面 / 4 ルート）",
  );

  // ── 入口の囮: 取り出しが本当に効いているか（実際に踏んだ形を含める） ─────────
  console.log("\n■ 入口の囮（取り出しが効いているかを、その場で確かめる）");
  const probes = [
    {
      name: "囮1: `[collection]` を含むルート（🚨 `]` で切れると 1 件しか取れない。実際に踏んだ形）",
      src: '"key": "mod+enter", "scope": ["page:/a/[collection]/new", "page:/b"], "label_key": "x"',
      expect: 2,
    },
    {
      name: "囮2: `mod+enter` が写しに無い（＝ 取り出せない。0 件ではない）",
      src: '"key": "mod+k", "scope": ["page:/a"], "label_key": "x"',
      expect: null,
    },
    {
      name: "囮3: 別の鍵の scope を混ぜて拾わないか（過検出）",
      src: '"key": "mod+enter", "scope": ["page:/a"], "label_key": "x" }, { "key": "mod+k", "scope": ["page:/zz-nope"], "label_key": "y"',
      expect: 1,
    },
  ];
  let probeFailed = false;
  for (const p of probes) {
    const got = extractSaveRoutes(p.src);
    const n = got === null ? null : got.length;
    const ok = n === p.expect;
    console.log(`  ${ok ? "✅" : "❌"} ${p.name} → ${n === null ? "取り出せない" : `${n} 件`}（期待 ${p.expect === null ? "取り出せない" : `${p.expect} 件`}）`);
    if (!ok) probeFailed = true;
  }

  // ── 自己検査: わざと壊して赤くなることを確かめる（壊し方 4 通り） ────────────
  console.log("\n■ 自己検査（この検査が本当に検出できるかを毎回その場で確かめる）");
  // 未設定時も判定ロジック自体の自己検査は実施する。実物の照合対象が無いことと、
  // 判定ロジックが壊れていないことは別なので、台帳を基準にした合成集合を使う。
  const selfTestDerived = derived ?? ledgerRoutes;
  const selfTests = [
    {
      name: "壊し方1: 写しから 1 ルート消す（理由なし）",
      expect: "missing-without-reason",
      apply: () => ({ d: selfTestDerived.slice(1), l: ledgerRoutes, r: removed }),
    },
    {
      name: "壊し方2: 写しを空にする（0 件は『全部ある』ではない）",
      expect: "empty-derived",
      apply: () => ({ d: [], l: ledgerRoutes, r: removed }),
    },
    {
      name: "壊し方3: 写しに台帳に無いルートが増える",
      expect: "undeclared-addition",
      apply: () => ({ d: [...selfTestDerived, "/admin/zz-self-test"], l: ledgerRoutes, r: removed }),
    },
    // 🚨 **自己検査は実データの形に依存させない。**
    //    2026-08-16、`removed` が空になった（全部戻った）瞬間に、
    //    `removed[0]` を使っていたこの 2 本が成立しなくなり **自己検査が落ちた**。
    //    ＝ **台帳が正しい状態になると検査が壊れる**という、逆立ちした依存だった。
    //    → 壊し方は**その場で作った値だけ**で組む。
    {
      name: "壊し方4: removed に在るルートが写しにも在る（直ったのに台帳が古い）",
      expect: "declared-but-present",
      apply: () => ({
        d: selfTestDerived,
        l: ledgerRoutes,
        r: [{ route: selfTestDerived[0], why: "自己検査のために作った値" }],
      }),
    },
    {
      name: "壊し方5: removed の理由が空",
      expect: "removed-without-why",
      apply: () => ({
        d: selfTestDerived,
        l: [...ledgerRoutes, "/admin/zz-self-test"],
        r: [{ route: "/admin/zz-self-test", why: "  " }],
      }),
    },
  ];
  let selfFailed = false;
  for (const t of selfTests) {
    const { d, l, r } = t.apply();
    const { violations } = judgeSaveRoutes(d, l, r);
    const hit = violations.filter((v) => v.rule === t.expect).length;
    const rules = [...new Set(violations.map((v) => v.rule))].join(",") || "-";
    console.log(`  ${hit > 0 ? "✅" : "❌"} ${t.name} → 検出 ${violations.length} 件（rule: ${rules}／期待 "${t.expect}" ${hit} 件）`);
    if (hit === 0) selfFailed = true;
  }

  // ── 対照: 壊していない実物で誤検出しないこと ─────────────────────────────
  // 🚨 既定が未設定のときは、保存の宣言された scope は存在しない。
  //    空の写しとして judgeSaveRoutes に渡すと「見ていない」と誤判定するため、
  //    自己検査は通常どおり行ったうえで、実物の照合だけを対象外にする。
  const control = saveShortcutUnassigned
    ? { violations: [], counts: { derived: 0, ledger: ledgerRoutes.length, removed: removed.length } }
    : judgeSaveRoutes(derived, ledgerRoutes, removed);
  const outputDerived = derived ?? [];
  console.log("\n■ 対照（壊していない実物で誤検出しないことを確かめる）");
  console.log(
    `  ${control.violations.length === 0 ? "✅" : "❌"} 実物 → 検出 ${control.violations.length} 件` +
      (saveShortcutUnassigned ? "（保存鍵は未設定のためルート照合を対象外）" : "") +
      `（写し ${control.counts.derived} ＋ 外した ${removed.filter((r) => !outputDerived.includes(r.route)).length} ＝ 台帳 ${control.counts.ledger} ルート）`,
  );

  console.log("\n■ 判定");
  if (control.violations.length > 0) {
    for (const v of control.violations) {
      console.error(`  [${v.rule}] ${v.detail}`);
    }
    console.error(
      "\n  ⌘Enter は**キーボードだけで操作する人の保存の導線**です。" +
        "\n  🚨 マウスで押せる人には代わりが在りますが、そうでない人には代わりが在りません。",
    );
  } else {
    console.log("  OK — **宣言された保存の鍵**は、台帳どおり（減っていない）。🚨 「⌘Enter が効く」ではない（この検査からは見えない）。");
  }
  if (probeFailed) console.error("\n🚨 入口の囮に失敗した。取り出しが壊れているので、この検査の結果は信用できない。");
  if (selfFailed) console.error("\n🚨 自己検査（RED）に失敗した。この検査の結果は信用できない（緑でも意味を持たない）。");

  process.exit(control.violations.length === 0 && !probeFailed && !selfFailed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
