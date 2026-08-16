#!/usr/bin/env node
/**
 * app/** と components/** の .ts/.tsx に、辞書を通していない表示文言が残っていないか検出する。
 * 受入基準6 用。
 *
 * 素の grep より厳しくしている点:
 *   1. コメントを除去してから探す（コメントの日本語は UI 文言ではないので誤検出しない）
 *   2. 日本語だけでなく、**英語のハードコード**も検出する
 *      （「日本語が無い」だけ見ると Save / Cancel の英語残りを見逃す。
 *        Keystone が脱落したのはまさにここ）
 *
 *   node scripts/check-i18n-hardcoded.mjs
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const JAPANESE = /[ぁ-んァ-ヶ一-龠]/;

/** 人が読む文言が入る属性。ここに英語リテラルがあれば辞書漏れ。 */
const HUMAN_ATTRS = ["placeholder", "title", "aria-label", "alt"];

/** 文言ではない英語（識別子・型名・技術語彙）。検出から除く。 */
const ALLOWED_LITERALS = new Set([
  // HTML/技術語彙（画面に出るが翻訳対象ではない識別子）
  "id", "type", "size", "dimensions", "uuid", "json", "csv", "url", "api",
  "application/octet-stream", "utf-8",
]);

/**
 * 行コメント・ブロックコメント・JSX コメントを空白へ潰す。
 * 文字列リテラル内の "//" を誤って消さないよう、簡易的に文字列を先に飛ばす。
 */
function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    // 文字列 / テンプレートリテラル
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // 行コメント
    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        i += 1;
      }
      continue;
    }

    // ブロックコメント（JSX の {/* */} もここで潰れる）
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/** JSX のテキストノード（>ここ<）を拾う。 */
function findJsxText(source) {
  const hits = [];
  const re = />([^<>{}]+)</g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const text = m[1].trim();
    if (text) hits.push({ index: m.index, text });
  }
  return hits;
}

/** 人が読む属性の文字列リテラルを拾う。 */
function findHumanAttrs(source) {
  const hits = [];
  const re = new RegExp(`(${HUMAN_ATTRS.join("|")})="([^"]+)"`, "g");
  let m;
  while ((m = re.exec(source)) !== null) {
    hits.push({ index: m.index, text: m[2].trim(), attr: m[1] });
  }
  return hits;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

/** 英語の「文言らしさ」判定: 英字を含み、識別子/技術語彙でない。 */
function looksLikeUiEnglish(text) {
  if (!/[A-Za-z]/.test(text)) return false;
  // `useState<Foo>(null)` のようなジェネリクスは `>...<` に見えてしまう。
  // コード片に必ず現れる記号を含むものは JSX テキストではないと判断する。
  if (/[;(){}=]/.test(text)) return false;
  // 🚨 型の交差（`A<X> &\n  Pick<Y, "z">`）も `>...<` に見える。
  //    実例: shadcn の `components/ui/message-scroller.tsx` を入れた途端に落ちた（2026-08-15）。
  //    **`&` を含むもの全部を除くと "Terms & Conditions" のような本物を見逃す**ので、
  //    **`&` で始まるものだけ**にする（画面に出す文が `&` で始まることは無い）。
  if (/^&[\s\w]/.test(text)) return false;
  const normalized = text.toLowerCase();
  if (ALLOWED_LITERALS.has(normalized)) return false;
  // 変数展開・式のみ、記号のみ、数値のみは対象外
  if (/^[\d\s\-x×/.,:%]+$/.test(text)) return false;
  // 単一の識別子っぽいもの（スネーク/キャメル/ケバブ1語）は技術語彙とみなす
  if (/^[a-z][a-z0-9_-]*$/.test(text) && !text.includes(" ")) return false;
  return true;
}

const files = trackedGlob("{app,components}/**/*.{ts,tsx}", { cwd: root })
  // 🚨 app/api/** は**意図して外している。しかし「画面に出ない」からではない。**
  // API のエラー文言は実際に画面へ出る（例: folders-manager.tsx の messageFrom が
  // payload.error.message をそのまま表示する）。**ここは既知の穴**であり、
  // サーバ側の文言をどう多言語化するか（locale をどこから取るか）が未決なため、
  // この検査の対象からいったん外している。**決まったら外し、この filter を消すこと。**
  // ❌ 「JSON だから画面に出ない」と書かないこと（事実ではない）。
  .filter((file) => !file.startsWith("app/api/"))
  .sort();

const japaneseHits = [];
const englishHits = [];

for (const file of files) {
  // 🚨 **中身も索引から読む**（2026-08-16・toast）。`trackedGlob` は「**どのファイルを見るか**」
  //    しか索引にしておらず、**中身は作業ツリー**のままだった。
  //    実測: 追跡済みのファイルを **staged にせず**書き換えると exit=1
  //    ＝ **他ペインの、まだ add していない編集で、全員のコミットが止まる**。
  //    `readTracked` は索引と中身が同じファイルはディスクから読む（`git show` を起動しない）ので、
  //    速度は変わらない。
  const raw = readTracked(resolve(root, file)) ?? "";
  const source = stripComments(raw);

  for (const hit of findJsxText(source)) {
    if (JAPANESE.test(hit.text)) {
      japaneseHits.push({ file, line: lineOf(source, hit.index), text: hit.text });
    } else if (looksLikeUiEnglish(hit.text)) {
      englishHits.push({ file, line: lineOf(source, hit.index), text: hit.text, where: "JSXテキスト" });
    }
  }

  for (const hit of findHumanAttrs(source)) {
    if (JAPANESE.test(hit.text)) {
      japaneseHits.push({ file, line: lineOf(source, hit.index), text: hit.text });
    } else if (looksLikeUiEnglish(hit.text)) {
      englishHits.push({ file, line: lineOf(source, hit.index), text: hit.text, where: `${hit.attr}属性` });
    }
  }

  // JSX の外（アラート文言・状態メッセージなど）に残った日本語の文字列リテラル
  const stringLiterals = source.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g);
  for (const m of stringLiterals) {
    if (JAPANESE.test(m[2])) {
      japaneseHits.push({ file, line: lineOf(source, m.index), text: m[2].trim() });
    }
  }
}

console.log(`対象ファイル: ${files.length} 本 (app/**, components/** の .ts/.tsx; app/api/** を除く)`);
console.log(`日本語のハードコード: ${japaneseHits.length} 件`);
console.log(`英語のハードコード候補: ${englishHits.length} 件`);

if (japaneseHits.length > 0) {
  console.error("\n■ 日本語のハードコード（辞書へ移すこと）");
  for (const h of japaneseHits) {
    console.error(`  ${h.file}:${h.line}  ${JSON.stringify(h.text)}`);
  }
}
if (englishHits.length > 0) {
  console.error("\n■ 英語のハードコード候補（辞書へ移すか、技術語彙なら ALLOWED_LITERALS へ）");
  for (const h of englishHits) {
    console.error(`  ${h.file}:${h.line}  [${h.where}] ${JSON.stringify(h.text)}`);
  }
}

process.exit(japaneseHits.length === 0 && englishHits.length === 0 ? 0 : 1);
