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
/**
 * 直前の意味のある文字から、ここで**正規表現が始まりうるか**を決める。
 * 🚨 識別子・`)`・`]`・数字の直後の `/` は**割り算**（`a / b`、`foo() / 2`、`arr[0] / n`）。
 */
function regexCanStart(before) {
  const m = before.replace(/\s+$/, "");
  if (m === "") return true;
  const last = m[m.length - 1];
  if (/[\w$)\]]/.test(last)) {
    // `return /…/` `typeof /…/` のようにキーワードの直後は正規表現
    return /\b(return|typeof|case|in|of|instanceof|new|delete|void|throw|do|else|yield|await)$/.test(m);
  }
  return true;
}

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
    // 🚨 **正規表現リテラルを読み飛ばす**（2026-08-16・実際に 4 本の検査が壊れていた）。
    //    これが無いと `/[^"]*/` の `"` を**文字列の開始**と読み、**そこから先が丸ごと「文字列の中」**に
    //    なって、**コメントを 1 行も潰さなくなる**。実測: `check-surface-nesting` は
    //    36 行目付近の `SURFACE_PATTERNS`（`[^"']*` を含む）以降、**139 行中 129 行が残っていた**。
    //    ＝ **コメントに書いた語が、検査の対象に混ざる**（`check-i18n-usage` では
    //    コメントの `t("…")` が「使われている」と数えられ、**死んだ鍵が掃除候補から消える**）。
    // 🚨 割り算と見分ける: 直前の意味のある文字が **識別子・`)`・`]`・数値**なら**割り算**。
    //    それ以外（`=` `(` `,` `:` `[` `!` `&` `|` `?` `{` `}` `;` `return` の後など）なら正規表現。
    //    🚨 **見分けを間違えると、逆に「正規表現でないもの」を読み飛ばして壊す**ので、
    //    受入では**割り算の次の行のコメントが潰れること**も必ず測る。
    if (c === "/" && next !== "/" && next !== "*" && regexCanStart(out)) {
      out += c; i += 1;
      let inClass = false;
      while (i < source.length) {
        const r = source[i];
        if (r === "\\") { out += source.slice(i, i + 2); i += 2; continue; }
        if (r === "\n") break; // 正規表現は行を跨がない。跨いだら見分けを誤っている
        out += r; i += 1;
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
      }
      continue;
    }
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
