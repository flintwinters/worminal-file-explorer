import { readFile, writeFile } from "node:fs/promises";
import { build } from "vite";
import { build as bundle } from "esbuild";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = name => readFile(new URL(name, root), "utf8");
const palette = await read("apps/explorer/src/palette.css");
const colors = [...palette.matchAll(/--browser-background:\s*([^;]+);/g)];
const background = colors[0]?.[1]?.trim();
if (colors.length !== 1 || !/^#[0-9a-f]{6}$/i.test(background || ""))
  throw new Error("Define --browser-background as one six-digit hex color in palette.css.");
const template = await read("apps/explorer/error.html");
if (template.split("{{message}}").length !== 2 || template.split("{{style}}").length !== 2)
  throw new Error("The error page requires exactly one message slot and one style slot.");
await build();
const css = await bundle({ absWorkingDir: fileURLToPath(root), entryPoints: ["apps/explorer/src/style.css"],
                          bundle: true, write: false });
await writeFile(new URL("dist/error.html", root), template.replace("{{style}}", css.outputFiles[0].text));
await writeFile(new URL("dist/theme.json", root), JSON.stringify({ background, message_slot: "{{message}}" }));
