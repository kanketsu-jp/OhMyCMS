import { defineConfig } from "tsup";

// SDK は bundle に取り込む（グローバル install しても workspace 解決に依存しないようにするため）。
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  dts: false,
  sourcemap: true,
  clean: true,
  noExternal: ["@ohmycms/sdk"],
  banner: { js: "#!/usr/bin/env node" },
});
