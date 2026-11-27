import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/ui/index.ts",
    "core/index": "src/core/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  treeshake: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  external: ["react", "react-dom", "exceljs"],
  banner: {
    js: '"use client";',
  },
});
