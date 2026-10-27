import buildMeta from "./build-meta.json";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { compileLSColors } from "./packages/files/src/colors";

// The build config needs only this Node API; browser sources have no process dependency.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  root: "apps/explorer",
  define: { __HOST_FONT__: process.env.WORMINAL_FONT_JSON || "null",
    __FILE_COLORS__: JSON.stringify(compileLSColors(process.env.LS_COLORS || "",
    process.env.WORMINAL_PALETTE_JSON ? JSON.parse(process.env.WORMINAL_PALETTE_JSON) : undefined)) },
  plugins: [{ name: "explorer-build-version", transformIndexHtml: () => [{
    tag: "meta", attrs: { name: buildMeta.versionTag, content: crypto.randomUUID() }, injectTo: "head",
  }] }, viteSingleFile()],
  build: { outDir: "../../dist", emptyOutDir: true },
});
