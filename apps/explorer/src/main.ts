import { FileTree, sortEntries, entryColor, type Entry, type SortOrder, type FileColors } from "@worminal/files";
declare const __FILE_COLORS__: FileColors;
import "./style.css";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

const entries = element<HTMLElement>("entries");
const picker = element<HTMLInputElement>("picker");
const open = element<HTMLButtonElement>("open");
const controls = [...element("sort").querySelectorAll<HTMLAnchorElement>("a")]
  .map(link => ({ link, label: link.textContent!, order: link.dataset.sort as SortOrder }));
const query = new URLSearchParams(location.search);
let order = controls.find(control => control.order === query.get("sort"))?.order || "name";
const defaultDescending = (sort: SortOrder) => sort === "modified" || sort === "size";
let descending = query.has("desc") ? query.get("desc") === "1" : defaultDescending(order);
let current: Entry<File>[] = [];
const path = element("path");
const native = location.protocol === "worminal:";
let tree: FileTree<File> | undefined;
let urls: string[] = [];

function render(list: Entry<File>[]): void {
  current = list;
  for (const control of controls) {
    const active = control.order === order;
    control.link.setAttribute("aria-current", String(active));
    control.link.textContent = control.label + (active && order !== "none" ? descending ? " ↓" : " ↑" : "");
  }
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
  const fragment = document.createDocumentFragment();
  for (const entry of sortEntries(list, order, descending)) {
    const link = document.createElement("a");
    link.textContent = entry.name;
    link.style.cssText = entryColor(__FILE_COLORS__, entry.name, entry.directory);
    if (native) {
      link.href = entry.directory
        ? `worminal:///files?${new URLSearchParams({ path: entry.path, sort: order, desc: descending ? "1" : "0" })}`
        : `worminal://${entry.path.split("/").map(encodeURIComponent).join("/")}`;
    } else if (entry.directory) {
      link.href = `#${encodeURIComponent(entry.path)}`;
      link.addEventListener("click", event => {
        event.preventDefault();
        path.textContent = `${tree!.rootName}/${entry.path}`;
        render(tree!.list(entry.path, "", "none"));
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
  path.textContent = destination;
  try {
    const response = await fetch(`worminal:///list?path=${encodeURIComponent(destination)}`);
    if (!response.ok) throw new Error("Could not read folder.");
    const rows: [string, boolean, number?, number?][] = await response.json();
    render(rows.map(([encoded, directory, size, modified]) => {
      const name = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
      return { name, directory, size, modified, path: `${destination.replace(/\/$/, "")}/${name}` };
    }));
  } catch (error) {
    entries.textContent = error instanceof Error ? error.message : "Could not read folder.";
  }
}

for (const control of controls) control.link.addEventListener("click", event => {
  event.preventDefault();
  descending = control.order === order ? !descending : defaultDescending(control.order);
  order = control.order;
  if (order === "none") descending = false;
  render(current);
});
render(current);
open.hidden = native;
open.addEventListener("click", () => picker.click());
picker.addEventListener("change", () => {
  if (!picker.files?.length) return;
  try {
    tree = new FileTree(picker.files);
    path.textContent = tree.rootName;
    render(tree.list("", "", "none"));
  } catch (error) {
    entries.textContent = error instanceof Error ? error.message : "Could not open folder.";
  } finally {
    picker.value = "";
  }
});

if (native) void directory(query.get("path") ||
                          (location.pathname === "/files" ? "/" : decodeURIComponent(location.pathname)));
