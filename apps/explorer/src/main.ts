import { FileTree, sortEntries, parentDirectory, entryMetadata, formatSize, formatModified, entryColor, type Entry, type SortOrder, type FileColors } from "@worminal/files";
declare const __HOST_FONT__: { family: string; size: number } | null;
declare const __FILE_COLORS__: FileColors;
declare global {
  interface Window {
    worminal?: { readDirectory(path: string): Promise<[string, boolean, number?, number?][]> };
  }
}
import "./style.css";

if (__HOST_FONT__) {
  document.documentElement.style.fontFamily = `${JSON.stringify(__HOST_FONT__.family)}, monospace`;
  document.documentElement.style.fontSize = `${__HOST_FONT__.size}pt`;
}

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
const native = Boolean(window.worminal);
let currentDirectory = "";
let tree: FileTree<File> | undefined;
let urls: string[] = [];
let preview: HTMLImageElement | undefined;

function hidePreview(): void {
  preview?.remove();
  preview = undefined;
}

function imagePreview(link: HTMLAnchorElement, entry: Entry<File>): void {
  if (entry.directory || !(entry.file?.type.startsWith("image/") ||
      /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(entry.name))) return;
  link.addEventListener("pointerenter", () => {
    hidePreview();
    const image = document.createElement("img");
    image.className = "image-preview";
    image.alt = entry.name;
    // Each hover owns its image so a late load/error cannot affect another preview.
    image.hidden = true;
    image.addEventListener("load", () => { image.hidden = false; });
    image.addEventListener("error", () => image.remove());
    image.src = link.href;
    preview = image;
    document.body.append(image);
  });
  link.addEventListener("pointerleave", hidePreview);
}

window.addEventListener("blur", hidePreview);
document.addEventListener("scroll", hidePreview, true);

function directoryURL(destination: string): string {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ path: destination, sort: order, desc: descending ? "1" : "0" }).toString();
  return url.href;
}

function showDirectory(destination: string): void {
  currentDirectory = destination;
  path.textContent = native ? destination : [tree!.rootName, destination].filter(Boolean).join("/");
  if (native) void directory(destination);
  else render(tree!.list(destination, "", "none"));
}

function render(list: Entry<File>[]): void {
  hidePreview();
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
        ? directoryURL(entry.path)
        : `file://${entry.path.split("/").map(encodeURIComponent).join("/")}`;
    } else if (entry.directory) {
      link.href = `#${encodeURIComponent(entry.path)}`;
      link.addEventListener("click", event => {
        event.preventDefault();
        showDirectory(entry.path);
      });
    } else {
      const url = URL.createObjectURL(entry.file!);
      urls.push(url);
      link.href = url;
    }
    imagePreview(link, entry);
    const metadata = entryMetadata(entry);
    const size = document.createElement("span");
    size.className = "size";
    size.textContent = entry.directory ? "" : formatSize(metadata.size);
    const modified = document.createElement("span");
    modified.className = "modified";
    modified.textContent = formatModified(metadata.modified);
    const row = document.createElement("div");
    row.className = "entry";
    row.append(link, size, modified);
    fragment.append(row);
  }
  entries.replaceChildren(fragment);
}

async function directory(destination: string): Promise<void> {
  try {
    const rows = await window.worminal!.readDirectory(destination);
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
    showDirectory("");
  } catch (error) {
    entries.textContent = error instanceof Error ? error.message : "Could not open folder.";
  } finally {
    picker.value = "";
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "ArrowUp" || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!native && !tree) return;
  event.preventDefault();
  const parent = parentDirectory(currentDirectory);
  if (parent === currentDirectory) return;
  if (native) location.assign(directoryURL(parent));
  else showDirectory(parent);
});

if (native) showDirectory(query.get("path") || query.get("cwd") || "/");
