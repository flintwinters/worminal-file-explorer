import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir(".checks", { recursive: true });
await build({
  entryPoints: ["tests/explorer.test.ts"], outfile: ".checks/explorer.test.mjs",
  bundle: true, platform: "node", format: "esm", packages: "external",
});
await import("../.checks/explorer.test.mjs");
