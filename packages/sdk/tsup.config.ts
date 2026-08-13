import { defineConfig } from "tsup";

// CLI (Node ESM) と MCP サーバの双方から使うため ESM/CJS の両方を出す。
// 実行時依存はゼロ（HTTP は Node 標準の fetch）なので bundle 対象は自分のソースだけ。
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "node22",
  platform: "node",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
