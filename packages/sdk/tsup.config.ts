import { defineConfig } from "tsup";

// CLI (Node ESM) と MCP サーバの双方から使うため ESM/CJS の両方を出す。
// 実行時依存はゼロ（HTTP は Node 標準の fetch）なので bundle 対象は自分のソースだけ。
export default defineConfig({
  // 🚨 `src/next/richtext.tsx` を独立した出力にもしている。
  //   `next/image` を引かないので、**素の Node からも読める**
  //   （描画の検査 scripts/richtext-smoke.mjs がこれを使う。barrel 経由だと
  //     next/image の解決に Next の実行環境が要って測れない）。
  entry: ["src/index.ts", "src/next/index.ts", "src/next/richtext.tsx"],
  format: ["esm", "cjs"],
  target: "node22",
  platform: "node",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
