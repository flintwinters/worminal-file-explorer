import { FileTree, type Entry } from "@worminal/files";
import "./style.css";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

const picker = element<HTMLInputElement>("picker");
const filter = element<HTMLInputElement>("filter");
const entries = element<HTMLTableSectionElement>("entries");
const path = element<HTMLElement>("path");
const notice = element<HTMLElement>("notice");
const dialog = element<HTMLDialogElement>("preview");
const previewText = element<HTMLElement>("preview-text");
const previewNote = element<HTMLElement>("preview-note");
const download = element<HTMLAnchorElement>("download");
const native = location.protocol === "worminal:";
let nativeEntries: Entry<File>[] = [];
let navigationGeneration = 0;
const folder = document.createElement("input");
folder.setAttribute("aria-label", "Folder path");
folder.placeholder = "Absolute folder path";
folder.hidden = true;
element("open").after(folder);
let tree: FileTree<File> | undefined;
let current = "";
let previewUrl: string | undefined;
let previewGeneration = 0;

function button(label: string, action: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", action);
  return node;
}

function navigate(destination: string): void {
  if (native) { void openNative(destination); return; }
  current = destination;
  filter.value = "";
  render();
}

function render(): void {
  if (!native && !tree) return;
  path.replaceChildren(button(native ? "/" : tree!.rootName, () => navigate(native ? "/" : "")));
  let prefix = "";
  for (const part of current.split("/").filter(Boolean)) {
    prefix = prefix || native ? `${prefix}/${part}` : part;
    const destination = prefix;
    path.append("/", button(part, () => navigate(destination)));
  }
  const visible = native
    ? nativeEntries.filter(entry => entry.name.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()))
    : tree!.list(current, filter.value);
  const fragment = document.createDocumentFragment();
  for (const entry of visible) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.append(button(entry.name + (entry.directory ? "/" : ""), () => {
      if (entry.directory) navigate(entry.path);
      else if (native) void previewNative(entry);
      else void preview(entry);
    }));
    const size = document.createElement("td");
    size.textContent = !entry.directory && entry.file ? `${entry.file.size.toLocaleString()} B` : "—";
    const modified = document.createElement("td");
    modified.textContent = entry.file ? new Date(entry.file.lastModified).toLocaleString() : "—";
    row.append(name, size, modified);
    fragment.append(row);
  }
  entries.replaceChildren(fragment);
  notice.textContent = visible.length ? "" : native ? "No matching files."
    : "No matching files. Empty folders are not exposed by the folder picker.";
  element("summary").textContent = native ? `${visible.length} entries · read only`
    : `${visible.length} entries · ${tree!.count} files in folder · read only`;
}

async function preview(entry: Entry<File>): Promise<void> {
  const file = entry.file;
  if (!file) return;
  const generation = ++previewGeneration;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  download.hidden = false;
  download.href = previewUrl;
  download.download = file.name;
  element("preview-name").textContent = file.name;
  previewText.textContent = "";
  previewNote.textContent = "Loading preview…";
  dialog.showModal();
  try {
    // Bound reads before decoding; never render file content as HTML or execute it.
    const bytes = new Uint8Array(await file.slice(0, 1_048_576).arrayBuffer());
    if (generation !== previewGeneration) return;
    if (bytes.includes(0)) {
      previewNote.textContent = "Binary file. Download to open with another application.";
      return;
    }
    previewText.textContent = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    previewNote.textContent = file.size > bytes.length ? "Preview limited to the first 1 MiB." : "Text preview";
  } catch {
    if (generation === previewGeneration) previewNote.textContent = "Text preview unavailable. You can download the file.";
  }
}

dialog.addEventListener("close", () => {
  ++previewGeneration;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  download.removeAttribute("href");
  previewText.textContent = "";
});
element("open").addEventListener("click", () => {
  if (!native) { picker.click(); return; }
  folder.hidden = false;
  folder.value = current;
  folder.focus();
  folder.select();
});
folder.addEventListener("keydown", event => {
  if (event.key === "Enter") void openNative(folder.value);
  if (event.key === "Escape") folder.hidden = true;
});
filter.addEventListener("input", render);
picker.addEventListener("change", () => {
  if (!picker.files?.length) return;
  try {
    const next = new FileTree(picker.files);
    tree = next;
    filter.disabled = false;
    navigate("");
    filter.focus();
  } catch (error) {
    notice.textContent = error instanceof Error ? error.message : "Could not open folder.";
  } finally {
    picker.value = "";
  }
});

function nativeUrl(route: string, destination: string): string {
  return `worminal:///${route}?path=${encodeURIComponent(destination)}`;
}

async function openNative(destination: string): Promise<void> {
  const generation = ++navigationGeneration;
  try {
    if (!destination.startsWith("/")) throw new Error("Enter an absolute folder path.");
    const parts: string[] = [];
    for (const part of destination.split("/")) {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part);
    }
    destination = `/${parts.join("/")}`;
    const response = await fetch(nativeUrl("list", destination));
    if (!response.ok) throw new Error("Could not read folder.");
    const rows: [string, boolean, number, number][] = await response.json();
    if (generation !== navigationGeneration) return;
    nativeEntries = rows.map(([encoded, directory, size, modified]) => {
      const name = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
      const file = new File([], name, { lastModified: modified });
      Object.defineProperty(file, "size", { value: size });
      return { name, directory, path: `${destination.replace(/\/$/, "")}/${name}`, file };
    }).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    current = destination;
    folder.hidden = true;
    filter.disabled = false;
    filter.value = "";
    render();
  } catch (error) {
    if (generation === navigationGeneration)
      notice.textContent = error instanceof Error ? error.message : "Could not read folder.";
  }
}

async function previewNative(entry: Entry<File>): Promise<void> {
  const generation = ++previewGeneration;
  try {
    const response = await fetch(nativeUrl("read", entry.path));
    if (!response.ok) throw new Error("Could not read file.");
    const file = new File([await response.blob()], entry.name);
    if (generation !== previewGeneration) return;
    await preview({ ...entry, file });
    download.hidden = true;
    if (entry.file!.size > file.size) previewNote.textContent = "Preview limited to the first 1 MiB.";
  } catch {
    if (generation === previewGeneration) notice.textContent = "Could not read file.";
  }
}

if (native) void openNative(new URLSearchParams(location.search).get("path") || (location.pathname === "/files" ? "/" : decodeURIComponent(location.pathname)));
