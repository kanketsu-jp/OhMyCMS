/**
 * 欄名の辞書（設問286 A）の検査。`bun run check:field-labels`
 *
 * 🚨 **表示側と書き込み側の両方を見る。**
 *   表示 … 辞書が無いとき **生の識別子に落ちる**こと（＝既存の画面が変わらないこと）
 *   書込 … 壊れた形を **通さない**こと（fail-closed）
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
t("pt-BR のような鍵は通る", parseFieldTranslations({"pt-BR":"Corpo"}), {"pt-BR":"Corpo"});
console.log(`判定: OK ${ok} / NG ${ng}`);
process.exit(ng>0?1:0);
