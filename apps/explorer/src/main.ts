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
  current = destination;
  filter.value = "";
  render();
}

function render(): void {
  if (!tree) return;
  path.replaceChildren(button(tree.rootName, () => navigate("")));
  let prefix = "";
  for (const part of current.split("/").filter(Boolean)) {
    prefix = prefix ? `${prefix}/${part}` : part;
    const destination = prefix;
    path.append("/", button(part, () => navigate(destination)));
  }
  const visible = tree.list(current, filter.value);
  const fragment = document.createDocumentFragment();
  for (const entry of visible) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.append(button(entry.name + (entry.directory ? "/" : ""), () => {
      if (entry.directory) navigate(entry.path);
      else void preview(entry);
    }));
    const size = document.createElement("td");
    size.textContent = entry.file ? `${entry.file.size.toLocaleString()} B` : "—";
    const modified = document.createElement("td");
    modified.textContent = entry.file ? new Date(entry.file.lastModified).toLocaleString() : "—";
    row.append(name, size, modified);
    fragment.append(row);
  }
  entries.replaceChildren(fragment);
  notice.textContent = visible.length ? "" : "No matching files. Empty folders are not exposed by the folder picker.";
  element("summary").textContent = `${visible.length} entries · ${tree.count} files in folder · read only`;
}

async function preview(entry: Entry<File>): Promise<void> {
  const file = entry.file;
  if (!file) return;
  const generation = ++previewGeneration;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
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
element("open").addEventListener("click", () => picker.click());
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
