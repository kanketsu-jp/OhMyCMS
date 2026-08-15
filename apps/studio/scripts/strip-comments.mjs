/**
 * ソースからコメントを潰す（位置は保つ＝行番号がずれない）。
 *
 * 🚨 なぜ要るか（2026-08-15 実測・この日 4 回出た形）:
 *   **コメントに書いたコードは、コードに見える。**
 *     ① `active:` の規約コメントを実装として計上した（「同居 28」の誤り）
 *     ② 棚卸しの弱い語が、無関係な一致で「在る」に見えた
 *     ③ JSDoc の使用例 `<Tabs defaultValue="open">` を、実際の使用として数えた
 *     ④ 🚨 **私の検査**: `form="collection-delete-form"` を**コメントが供給**していた
 *
 *   ④ の実測（ファイルを書き換えずに、メモリ上で実装行だけ消した）:
 *     いま        … collection-delete-form を検出
 *     実装を消す  … 🚨 **まだ検出する**（＝コメントが隠している）
 *     両方消す    … 🟢 検出せず（＝検出器そのものは生きている）
 *   ＝ **実装を消しても検査が緑のまま**という穴が、実在していた。
 *
 * 🚨 **この関数が見ていない範囲**:
 *   ・**文字列の中の `//`** は消さない（URL などを壊さないため）。逆に言うと
 *     **文字列に書いたコード片は残る**ので、そこを数える検査は別途考えること。
 *   ・JSX の `{/* … *\/}` は、中身が `/* … *\/` なのでコメントとして潰れる。
 *   ・**行数は保つ**が、桁位置は空白で埋めるだけなので、
 *     コメント内の引用符が消える結果、**後続の引用符の対応は生ソースと変わりうる**。
 *     文字列リテラルを取り出す用途では、この関数を通した後の結果で一貫させること。
 *
 * @param {string} source
 * @returns {string} コメントを空白に置き換えたソース（改行は保つ）
 */
export function stripComments(source) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i += 1; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i += 1; continue; }
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (c === "/" && next === "*") {
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  "; i += 2; continue;
    }
    out += c; i += 1;
  }
  return out;
}
