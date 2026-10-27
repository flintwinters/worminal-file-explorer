import { readFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";

if (process.env.WORMINAL_PALETTE)
  process.env.WORMINAL_PALETTE_JSON = await readFile(process.env.WORMINAL_PALETTE, "utf8");
await mkdir(".checks", { recursive: true });
await mkdir("dist", { recursive: true });
const staging = await mkdtemp(resolve(".checks/build-"));
try {
  await build({ build: { outDir: staging } });
  // Readers keep the complete previous version until the new standalone document is ready.
  await rename(resolve(staging, "index.html"), resolve("dist/index.html"));
} finally {
  await rm(staging, { recursive: true, force: true });
}
