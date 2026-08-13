/**
 * `@ohmycms/sdk/next` — **Next.js 特化の入口。**
 *
 * 🚨 **ここから下だけが `react` / `next` に依存してよい。**
 *   基礎（`@ohmycms/sdk`）は素の HTML からも使う約束なので、あちらへ持ち込まない。
 *   （オーナー指示: 「nextjs 特化したモジュールと HTML などで使える基礎的なモジュールを用意する。
 *     分けるというより、基本的な sdk のなかで nextjs 特化したものがある」）
 *
 * いまあるもの: `<Image>`。次は `<RichText>`（tiptap と形を合わせてから）。
 * 🚨 **使われない機能は負債**なので、要ると分かったものから足す。
 */

export { Image, type ImageFile, type ImageProps } from "./image.js";
