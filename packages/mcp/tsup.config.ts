import { defineConfig } from "tsup";

// SDK は取り込む。MCP SDK と zod は node_modules から解決させる（bundle すると重いだけ）。
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
