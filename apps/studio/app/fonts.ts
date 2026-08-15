import localFont from "next/font/local";

/**
 * 書体の定義。**ここが唯一の出どころ（SoT）。**
 *
 * 🚨 なぜ `app/layout.tsx` から出したか（2026-08-15）:
 * Storybook（:3104）が **product の書体で描いていなかった**。実測:
 * ```
 * Storybook  html のクラス **無し**  → 書体 **Times**
 * アプリ     html のクラス notosans…variable / notosansjp…variable / geistmono…variable → 違反なし
 * ```
 * `.storybook/preview.tsx` は `globals.css` を読んでいたが、**variable クラスを付けていなかった**ので
 * `--font-sans-latin` が未定義 → `app/globals.css` の
 * `--font-sans: var(--font-sans-latin), …` が**宣言ごと無効**になり、既定のセリフ体に落ちていた。
 * ＝ **Storybook で行われた日本語まわりの目視判断は、すべて別の書体で見たものだった。**
 *
 * 🚨 preview.tsx に `localFont` を**書き写して**直さないこと。
 * 書き写すと、フォントを差し替えた日に **Storybook だけ古い書体のまま黙ってズレる**
 * （どちらも「正しく」動くので、誰も気づかない）。**両方がこのファイルを import する。**
 *
 * ## 書体が実際に変わったことの確かめ方（2026-08-15 実測）
 *
 * Vite 側の next/font は**ファミリ名をハッシュにする**ので、**名前では判定できない**。
 * 同じ story の同じ要素で A/B した:
 * ```
 * 和文 h2「コレクション」  文字の高さ 18px → **22px**
 * 欧文まじり p             文字の高さ 17px → **19px** ／ 幅 302.8px → **305.5px**
 * ```
 * ⚠️ **和文の「幅」は使えない**——全角なので**どの書体でも 1em ちょうど**（96px で変化なし）。
 * **高さか、欧文まじりの幅**で見ること。
 *
 * 🚨 **この A/B は、計測器に端末の切替（hover / pointer / touch の模擬）を入れる前のもの。**
 * **測り直していないが、有効。** 理由: **変えたのは媒体条件（hover / pointer / touch）で、
 * 測ったのは書体の字面の高さ**。`@media (hover)` で書体を切り替えてはいないので、
 * **両者は独立している**。
 * （「独立だと言えるなら測り直さない。言えないなら測る」——2026-08-15 に決めた判断の仕方）
 *
 * 🚨 `localFont` の `path` は **この関数を呼んだファイルからの相対**。
 * このファイルは `app/` 直下なので `./fonts/…` がそのまま効く。**移動するときは path も直す。**
 */
// 🚨 英数字と日本語を「同じ設計の兄弟」で混植する。
// Geist は英字専用で、日本語は OS のフォールバックに落ちる（= 環境ごとに字面が変わる）。
// 並び順は **英数字を先、日本語を後**。ブラウザは前から字を探すので、英数字が Noto Sans で出る。
const notoSans = localFont({
  src: [
    {
      path: "./fonts/noto-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/noto-sans-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/noto-sans-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sans-latin",
  display: "swap",
});

const notoSansJP = localFont({
  src: [
    {
      path: "./fonts/noto-sans-jp-japanese-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/noto-sans-jp-japanese-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/noto-sans-jp-japanese-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sans-jp",
  display: "swap",
});

const geistMono = localFont({
  src: [
    {
      path: "./fonts/geist-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-geist-mono",
});

/**
 * `<html>` に付ける variable クラス。**並び順は変えないこと**——
 * `--font-sans` は「英数字 → 日本語」の順で解決される前提で書かれている
 * （`app/globals.css`: `--font-sans: var(--font-sans-latin), var(--font-sans-jp), …`）。
 */
export const fontVariables = `${notoSans.variable} ${notoSansJP.variable} ${geistMono.variable}`;
