/**
 * 欄名の辞書（設問286 A）の検査。`bun run check:field-labels`
 *
 * 🚨 **表示側と書き込み側の両方を見る。**
 *   表示 … 辞書が無いとき **生の識別子に落ちる**こと（＝既存の画面が変わらないこと）
 *   書込 … 壊れた形を **通さない**こと（fail-closed）
 *
 * 🚨 **この検査が見ていない形は、ここに書きません。**（2026-08-16）
 *   **実行のたびに末尾で一覧を出し、【鳴る】形にしてあります**——
 *   「見逃す」と書いたものが**拾えるようになったら失敗**します。
 *   🚨 **散文でも同じことを書くと、片方が必ず腐ります**（今日ずっと出ている「本文と要約の食い違い」）。
 *   **正は毎回の出力です。**
 *
 * 🚨 **固定の説明**（毎回の出力では言えないので、ここに置く。**古くなっても鳴りません**）:
 *   見逃す形はどれも**そのまま保存されます**。描くのは React なので**スクリプトは実行されません**が、
 *   **1 行に収まらない名前**と**見えない文字を含む名前**は通ります。
 *
 * 🚨 **「検出されてはいけないもの」も入れてある**（正しい形が通ること）。
 *    逆方向が無いと過検出を捕まえられない。
 */
import { readFileSync } from "node:fs";
import { fieldLabel, parseFieldTranslations } from "../lib/schema/labels";
let ok=0, ng=0;
const 読んだ = { labels: 0, service: 0 };
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

// ── 🚨 **外側の門が生きているか**（2026-08-16・「囮は実物より内側に入りたがる」への対処）──
// この検査の囮は `parseFieldTranslations()` を直接呼ぶ。**入口と結果が一致することは実測した**が、
// 🚨 **その関数を「呼ぶ側」が消えても、囮は緑のまま**になる。
// 実測: この検査は `service.ts` に **1 箇所も触れていなかった**（`service` の一致 0 件 /
// 🟢 対照 `labels` は 2 件）。＝ **書き込み経路から検査が外れても気づけない状態だった。**
// → **呼ぶ側の存在を、ここで見る**（中身の正しさではなく、**経路に居ること**）。
{
  const service = readFileSync(new URL("../lib/schema/service.ts", import.meta.url), "utf8");
  読んだ.service = service.length;
  読んだ.labels = readFileSync(new URL("../lib/schema/labels.ts", import.meta.url), "utf8").length;
  // 🚨 コメントを落としてから見る（「コメントに書いただけ」を実装として数えない）
  const 実 = service.split("\n").map((l) => l.split("//")[0]).join("\n");
  // 🚨 **ファイル全体で探さない**（2026-08-16 実測）。`assertFieldMetaShape` の中に
  //    `"translations" in meta` が在るので、**許可リストから外しても素通りした**。
  //    → **FIELD_META_COLUMNS の中だけ**を切り出して見る。
  const 許可リスト = (() => {
    const i = 実.indexOf("const FIELD_META_COLUMNS");
    if (i < 0) return "";
    const j = 実.indexOf("]);", i);
    return j < 0 ? "" : 実.slice(i, j);
  })();
  t("🟢 対照(+) 許可リストを切り出せている", 許可リスト.includes('"note"'), true);
  t("service.ts の許可リストに translations が在る", 許可リスト.includes('"translations"'), true);
  t(
    "service.ts が assertFieldMetaShape を呼んでいる（定義 1 + 呼び出し 2）",
    (実.match(/assertFieldMetaShape\(/g) ?? []).length >= 3,
    true,
  );
  // 🟢 対照(+): 同じ読み方で必ず在るものが見つかる（＝ service.ts を読めている）
  t("🟢 対照(+) service.ts を読めている", 実.includes("FIELD_META_COLUMNS"), true);
}

// ── 🚨 この検査が「見逃す入力」を、自分で作って通す ──────────────
// 🚨 **囮は実物と同じ道を通っているか**（2026-08-16・配られた規律）。
//    ここは `parseFieldTranslations()` を**直接**呼んでいる。実物の道は
//    HTTP → `pickAllowed` → `assertFieldMetaShape` → `parseFieldTranslations` で、**1 段多い**。
//    → 🚨 **本物の入口（PATCH /api/fields/<c>/<f>）でも同じ結果になることを実測した**:
//      ① 2000 字 **200** ／ ② 改行 **200** ／ ③ タグ **200** ／ ④ 制御文字 **200**
//      ⑤ `{"JA":…}` → **`{"ja":…}`** で保存（小文字化が入口でも効く）
//      🟢 対照 配列 → **400**（＝入口でも拾う）
//    ＝ **直接呼びと入口で結果が一致**。だからこの囮は「本物も通る」の証拠になる。
//    🚨 `pickAllowed` を挟んでも値が素通りすることを、**推論ではなく実測で**確かめてある。
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
  console.log("■ 【鳴る】この検査が見逃す形（拾えるようになったら失敗します）");
  for (const [名, 入力] of 見逃す) {
    const r = parseFieldTranslations(入力);
    // 🚨 **判定だけでなく、返ってきた実物を出す**（2026-08-16）。
    //    判定しか出さないと、「**届いて通した**」と「**届かずに undefined**」が
    //    同じ `🟢 拾う` に見える（＝「違反なし」の意味が 2 通りになる）。
    //    実物が出ていれば、**届いたことが読む人に見える**。
    const 実物 = r === undefined ? "undefined（＝拾った）" : JSON.stringify(r).slice(0, 46);
    console.log(`  ${r === undefined ? "🟢 拾う" : "🚨 見逃す"}  ${名}  → ${実物}`);
    // 🚨 **記述が古くなったら鳴る**（2026-08-16）。
    //    「見逃す」と書いたものが**拾えるようになったら**、ヘッダの記述が嘘になる。
    //    そのとき黙って通ると、次に読む人は「まだ見ていない」と読み続ける。
    //    ＝ **書いただけ**と**鳴る**の差。ここは鳴る側にしてある。
    if (r !== undefined) continue;
    console.error(`  ✗ 「${名}」は**拾えるようになりました**。ヘッダの「見ていない形」が古いので直してください`);
    ng += 1;
  }
  // 🟢 対照(+): 拾う入力も 1 つ通す（＝検出器が動いていることの確認）
  const 対照 = parseFieldTranslations(["x"]);
  console.log(`  🟢 対照(+) 配列 → ${対照 === undefined ? "拾う（正常）" : "🚨 拾えていない＝この節は何も言っていない"}`);
  if (対照 !== undefined) { console.error("  ✗ 対照が落ちました。見逃しの一覧は信用できません"); ng += 1; }
}

// 🚨 **数に正しい名前を付ける**（2026-08-16）。`OK/NG` は**走った assert の回数**であって、
//    「何を読んだか」ではない。読んだ量も出す（0 なら**読めていない**とその場で分かる）。
console.log(
  `読んだ: labels.ts ${読んだ.labels} 文字 / service.ts ${読んだ.service} 文字`
  + `（🚨 どちらかが 0 なら、この検査は何も見ていません）`,
);
console.log(`判定: OK ${ok} / NG ${ng}（＝走った assert の回数。候補でも当たりの数でもない）`);

// 🚨 **assert の本数にも下限を置く**（2026-08-16・自分で壊して見つけた）。
//    それまでは **24 本のうち 12 本をコメントアウトしても exit 0** だった——
//    ＝ **検査が痩せても、緑のまま**。「全部通った」と「そもそも走っていない」が同じ見た目になる。
//    読んだ**量**の下限（上の `読んだ`）は「ファイルを読めたか」しか見ておらず、
//    **読んだあと何本試したか**は見ていなかった。**別の穴だった。**
// 🚨 この下限は【書いただけ】＝ 自動では追随しない。
//    **assert を足したらこの数も上げる**（下げるときは、なぜ減らしたかをコミット本文に書く）。
const 本数の下限 = 22;
if (ok + ng < 本数の下限) {
  console.error(
    `✖ 走った assert が ${ok + ng} 本しかありません（下限 ${本数の下限}）`
    + `\n   ＝ **検査が痩せています**。通ったのではなく、試していません。`,
  );
  process.exit(2);
}
process.exit(ng>0?1:0);
