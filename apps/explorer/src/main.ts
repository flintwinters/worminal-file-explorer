import { FileTree, type Entry } from "@worminal/files";
import "./style.css";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

const entries = element<HTMLElement>("entries");
const picker = element<HTMLInputElement>("picker");
const open = element<HTMLButtonElement>("open");
const native = location.protocol === "worminal:";
let tree: FileTree<File> | undefined;
let urls: string[] = [];

function render(list: Entry<File>[]): void {
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
  const fragment = document.createDocumentFragment();
  for (const entry of list) {
    const link = document.createElement("a");
    link.textContent = entry.name;
    if (native) {
      link.href = `worminal://${entry.path.split("/").map(encodeURIComponent).join("/")}`;
    } else if (entry.directory) {
      link.href = `#${encodeURIComponent(entry.path)}`;
      link.addEventListener("click", event => {
        event.preventDefault();
        render(tree!.list(entry.path));
      });
    } else {
      const url = URL.createObjectURL(entry.file!);
      urls.push(url);
      link.href = url;
    }
    fragment.append(link, document.createElement("br"));
  }
  entries.replaceChildren(fragment);
}

async function directory(destination: string): Promise<void> {
  try {
    const response = await fetch(`worminal:///list?path=${encodeURIComponent(destination)}`);
    if (!response.ok) throw new Error("Could not read folder.");
    const rows: [string, boolean][] = await response.json();
    render(rows.map(([encoded, directory]) => {
      const name = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
      return { name, directory, path: `${destination.replace(/\/$/, "")}/${name}` };
    }));
  } catch (error) {
    entries.textContent = error instanceof Error ? error.message : "Could not read folder.";
  }
}

open.hidden = native;
open.addEventListener("click", () => picker.click());
picker.addEventListener("change", () => {
  if (!picker.files?.length) return;
  try {
    tree = new FileTree(picker.files);
    render(tree.list());
  } catch (error) {
    entries.textContent = error instanceof Error ? error.message : "Could not open folder.";
  } finally {
    picker.value = "";
  }
});

if (native) void directory(new URLSearchParams(location.search).get("path") ||
                          (location.pathname === "/files" ? "/" : decodeURIComponent(location.pathname)));
