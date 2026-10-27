import { FileTree, sortEntries, parentDirectory, entryMetadata, formatSize, formatModified, entryColor, type Entry, type SortOrder, type FileColors } from "@worminal/files";
declare const __HOST_FONT__: { family: string; size: number; lineHeight?: number } | null;
declare const __FILE_COLORS__: FileColors;
declare global {
  interface Window {
    worminal?: {
      readDirectory(path: string): Promise<[string, boolean, number?, number?][]>;
      readFile?(path: string, signal?: AbortSignal): Promise<ArrayBuffer>;
    };
  }
}
import "./style.css";
import { watchBuild } from "./live-reload";
watchBuild();

if (__HOST_FONT__) {
  document.documentElement.style.fontFamily = `${JSON.stringify(__HOST_FONT__.family)}, monospace`;
  document.documentElement.style.fontSize = `${__HOST_FONT__.size}pt`;
  if (__HOST_FONT__.lineHeight !== undefined)
    document.documentElement.style.lineHeight = `${__HOST_FONT__.lineHeight}px`;
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

async function copyPath(node: HTMLElement, value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      // Local-file documents may lack the Clipboard API. Copy within the activation gesture.
      const input = document.createElement("textarea");
      input.value = value;
      input.className = "clipboard-copy";
      document.body.append(input);
      const focused = document.activeElement as HTMLElement | null;
      try {
        input.select();
        if (!document.execCommand("copy")) throw new Error("Copy failed");
      } finally {
        input.remove();
        focused?.focus();
      }
    }
    node.title = "Copied path";
  } catch {
    node.title = "Could not copy path";
  }
}

function onActivate(node: HTMLElement, action: () => void, title: string): void {
  node.setAttribute("role", "button");
  node.tabIndex = 0;
  node.title = title;
  node.addEventListener("click", action);
  node.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    node.click();
  });
}

const entries = element<HTMLElement>("entries");
const picker = element<HTMLInputElement>("picker");
const open = element<HTMLButtonElement>("open");
const controls = [...element("sort").querySelectorAll<HTMLAnchorElement>("a")]
  .map(link => ({ link, label: link.textContent!, order: link.dataset.sort as SortOrder }));
const query = new URLSearchParams(location.search);
let order = controls.find(control => control.order === query.get("sort"))?.order || "modified";
const defaultDescending = (sort: SortOrder) => sort === "modified" || sort === "size";
let descending = query.has("desc") ? query.get("desc") === "1" : defaultDescending(order);
let current: Entry<File>[] = [];
let selectedPath: string | null = null;
const path = element("path");
onActivate(path, () => { void copyPath(path, path.textContent || ""); }, "Copy path");
const native = Boolean(window.worminal);
let currentDirectory = "";
let tree: FileTree<File> | undefined;
let urls: string[] = [];
let preview: HTMLElement | undefined;
let stopPreview: (() => void) | undefined;

function hidePreview(): void {
  stopPreview?.();
  stopPreview = undefined;
  preview?.remove();
  preview = undefined;
}

function mediaPreview(link: HTMLElement, entry: Entry<File>, target: string): void {
  if (entry.directory) return;
  const type = entry.file?.type || "";
  const kind = type === "application/pdf" || /\.pdf$/i.test(entry.name) ? "pdf"
    : type.startsWith("video/") || /\.(mp4|m4v|webm|ogv|ogg|mov|mkv)$/i.test(entry.name) ? "video"
    : type.startsWith("image/") || /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(entry.name) ? "image" : undefined;
  if (!kind) return;
  link.addEventListener("pointerenter", () => {
    hidePreview();
    const node = document.createElement(kind === "pdf" ? "canvas" : kind === "video" ? "video" : "img");
    node.className = "image-preview";
    node.setAttribute("aria-label", entry.name);
    node.hidden = true;
    preview = node;
    document.body.append(node);
    // Each hover owns its callbacks: late completions never replace the next preview.
    const ready = () => { if (preview === node) node.hidden = false; };
    node.addEventListener("error", () => { if (preview === node) hidePreview(); });
    if (node instanceof HTMLImageElement) {
      node.alt = entry.name;
      node.addEventListener("load", ready);
      node.src = target;
    } else if (node instanceof HTMLVideoElement) {
      node.muted = true;
      node.autoplay = true;
      node.loop = true;
      node.playsInline = true;
      node.preload = "metadata";
      node.addEventListener("loadeddata", ready);
      node.src = target;
      stopPreview = () => { node.pause(); node.removeAttribute("src"); node.load(); };
    } else {
      const abort = new AbortController();
      stopPreview = () => abort.abort();
      void import("./pdf-preview").then(module =>
        module.renderPDF(node, target, abort.signal, entry.file, native ? entry.path : undefined)).then(ready).catch(() => {
          if (preview === node) hidePreview();
        });
    }
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

function selectFile(path: string | null): void {
  selectedPath = path;
  for (const row of entries.querySelectorAll<HTMLElement>(".entry")) {
    const selected = path !== null && row.dataset.path === path;
    row.classList.toggle("selected", selected);
    row.querySelector(".entry-name[role=button]")?.setAttribute("aria-pressed", String(selected));
  }
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
    link.className = "entry-name";
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
    const action = document.createElement("span");
    action.className = "action";
    if (!entry.directory) {
      const openFile = document.createElement("a");
      openFile.className = "open-file";
      openFile.textContent = "open";
      openFile.href = link.href;
      openFile.setAttribute("aria-label", `Open ${entry.name}`);
      mediaPreview(link, entry, openFile.href);
      link.removeAttribute("href");
      onActivate(link, () => selectFile(entry.path), "Select file");
      action.append(openFile);
    }
    const metadata = entryMetadata(entry);
    const size = document.createElement("span");
    size.className = "size";
    size.textContent = entry.directory ? "" : formatSize(metadata.size);
    const modified = document.createElement("span");
    modified.className = "modified";
    modified.textContent = formatModified(metadata.modified);
    const row = document.createElement("div");
    row.className = "entry";
    row.dataset.path = entry.path;
    if (!entry.directory) row.addEventListener("click", event => {
      if (!(event.target as Element).closest(".entry-name, a[href]")) selectFile(entry.path);
    });
    row.append(link, action, size, modified);
    fragment.append(row);
  }
  entries.replaceChildren(fragment);
  selectFile(list.some(entry => !entry.directory && entry.path === selectedPath) ? selectedPath : null);
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
