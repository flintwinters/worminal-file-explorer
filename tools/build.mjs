import { readFile } from "node:fs/promises";
import { build } from "vite";

if (process.env.WORMINAL_PALETTE)
  process.env.WORMINAL_PALETTE_JSON = await readFile(process.env.WORMINAL_PALETTE, "utf8");
await build();
