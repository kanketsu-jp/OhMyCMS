/**
 * 欄名の辞書（設問286 A）の検査。`bun run check:field-labels`
 *
 * 🚨 **表示側と書き込み側の両方を見る。**
 *   表示 … 辞書が無いとき **生の識別子に落ちる**こと（＝既存の画面が変わらないこと）
 *   書込 … 壊れた形を **通さない**こと（fail-closed）
 *
 * 🚨 **この検査が見ていない形**（2026-08-16・見逃す入力を作って確かめた。推測ではない）:
 *   **長さの上限なし** ／ **改行を含む名前** ／ **タグを含む名前** ／ **制御文字を含む名前**
 *   → どれも**そのまま保存されます**。画面に出すのは React なので**スクリプトは実行されません**が、
 *     **1 行に収まらない名前・見えない文字を含む名前**は通ります。
 *   （通ってしまうことを、実行のたびに末尾で表示します）
 *
 * 🚨 **「検出されてはいけないもの」も入れてある**（正しい形が通ること）。
 *    逆方向が無いと過検出を捕まえられない。
 */
import { fieldLabel, parseFieldTranslations } from "../lib/schema/labels";
let ok=0, ng=0;
const t=(名:string, 実:unknown, 期待:unknown)=>{ const p=JSON.stringify(実)===JSON.stringify(期待);
  console.log(`  ${p?"✅":"🚨"} ${名}  実際=${JSON.stringify(実)} 期待=${JSON.stringify(期待)}`); p?ok++:ng++; };
const f=(tr:unknown)=>({ field:"body_rich", meta:{ translations: tr } } as never);

console.log("■ fieldLabel（表示側）");
t("辞書が null → 生の識別子", fieldLabel(f(null),"ja"), "body_rich");
t("meta ごと無い → 生の識別子", fieldLabel({field:"body_rich"} as never,"ja"), "body_rich");
t("ja が在る", fieldLabel(f({ja:"本文",en:"Body"}),"ja"), "本文");
t("en が在る", fieldLabel(f({ja:"本文",en:"Body"}),"en"), "Body");
t("🚨 ja-JP は ja へ落ちる", fieldLabel(f({ja:"本文"}),"ja-JP"), "本文");
t("🚨 無い言語は fallback(ja) へ", fieldLabel(f({ja:"本文"}),"fr"), "本文");
t("🚨 fallback も無ければ識別子", fieldLabel(f({en:"Body"}),"fr","ja"), "body_rich");
t("🚨 空白だけは名前が無い扱い", fieldLabel(f({ja:"   ",en:"Body"}),"ja","en"), "Body");

console.log("■ parseFieldTranslations（書き込み側・fail closed）");
t("正しい形", parseFieldTranslations({ja:"本文"}), {ja:"本文"});
t("前後の空白は落とす", parseFieldTranslations({ja:"  本文  "}), {ja:"本文"});
t("空文字は鍵ごと落とす", parseFieldTranslations({ja:"",en:"Body"}), {en:"Body"});
t("全部空なら null", parseFieldTranslations({ja:""}), null);
t("null は null（消す指示）", parseFieldTranslations(null), null);
t("🚨 配列は undefined（壊れた入力）", parseFieldTranslations(["本文"]), undefined);
t("🚨 数値の値は undefined", parseFieldTranslations({ja:1}), undefined);
t("🚨 入れ子は undefined", parseFieldTranslations({ja:{x:"本文"}}), undefined);
t("🚨 変なロケール鍵は undefined", parseFieldTranslations({"../etc":"本文"}), undefined);
t("🚨 文字列そのものは undefined", parseFieldTranslations("本文"), undefined);
// 🚨 鍵は**小文字へ正規化**される（2026-08-16）。BCP 47 は `pt-BR` と書くのが慣習だが、
//    引く側も小文字に寄せるので、保存は小文字に揃える（両側で揃っていないと引けない）。
t("pt-BR のような鍵は小文字で保存される", parseFieldTranslations({"pt-BR":"Corpo"}), {"pt-br":"Corpo"});
t("🚨 大文字の鍵でも引ける（読む側も小文字に寄せる）", fieldLabel(f({JA:"本文"}),"ja"), "本文");

// ── 🚨 この検査が「見逃す入力」を、自分で作って通す ──────────────
// （2026-08-16・配られた形。**在るかを探す**のではなく、**作れば必ず在る**）
// 取りこぼしの「数」は出せないが、「取りこぼす」ことは確実に示せる。
{
  const CTRL = String.fromCharCode(7);
  const 見逃す: [string, unknown][] = [
    ["極端に長い名前（2000 字）", { ja: "あ".repeat(2000) }],
    ["改行を含む名前", { ja: "本文\n二行目" }],
    ["タグを含む名前", { ja: "<script>alert(1)</script>" }],
    ["制御文字を含む名前", { ja: `本${CTRL}文` }],
  ];
  console.log("■ 🚨 この検査が見逃す形（通ってしまうことを、毎回その場で示す）");
  for (const [名, 入力] of 見逃す) {
    const r = parseFieldTranslations(入力);
    console.log(`  ${r === undefined ? "🟢 拾う" : "🚨 見逃す"}  ${名}`);
  }
  // 🟢 対照(+): 拾う入力も 1 つ通す（＝検出器が動いていることの確認）
  const 対照 = parseFieldTranslations(["x"]);
  console.log(`  🟢 対照(+) 配列 → ${対照 === undefined ? "拾う（正常）" : "🚨 拾えていない＝この節は何も言っていない"}`);
  if (対照 !== undefined) { console.error("  ✗ 対照が落ちました。見逃しの一覧は信用できません"); ng += 1; }
}

console.log(`判定: OK ${ok} / NG ${ng}`);
process.exit(ng>0?1:0);
