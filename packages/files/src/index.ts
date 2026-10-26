export { entryColor, type FileColors } from "./colors";

export interface SourceFile {
  readonly name: string;
  readonly webkitRelativePath: string;
  readonly size: number;
  readonly lastModified: number;
}

export interface Entry<T extends SourceFile> {
  name: string;
  path: string;
  directory: boolean;
  file?: T;
  size?: number;
  modified?: number;
}

export function entryMetadata<T extends SourceFile>(entry: Entry<T>): { size?: number; modified?: number } {
  return { size: entry.size ?? entry.file?.size, modified: entry.modified ?? entry.file?.lastModified };
}

/** Binary units with at most one decimal and no redundant byte suffix. */
export function formatSize(size?: number): string {
  if (size === undefined || !Number.isFinite(size) || size < 0) return "";
  const unit = Math.min(6, Math.floor(Math.log2(Math.max(1, size)) / 10));
  const value = size / 1024 ** unit;
  return `${Number(value.toFixed(unit && value < 10 ? 1 : 0))}${["", "K", "M", "G", "T", "P", "E"][unit]}`;
}

/** Local time to the minute, with a fixed-width two-digit date. */
export function formatModified(modified?: number): string {
  if (modified === undefined || !Number.isFinite(modified)) return "";
  const date = new Date(modified);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getFullYear() % 100)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type SortOrder = "name" | "extension" | "modified" | "size" | "none";
const names = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

export function sortEntries<T extends SourceFile>(entries: Entry<T>[], order: SortOrder = "name",
                                                  descending = false): Entry<T>[] {
  const result = [...entries];
  if (order === "none") return result;
  const direction = descending ? -1 : 1;
  const name = (a: Entry<T>, b: Entry<T>) => names.compare(a.name, b.name) || a.name.localeCompare(b.name);
  return result.sort((a, b) => {
    const folders = Number(b.directory) - Number(a.directory);
    if (folders) return folders;
    if (order === "name") return direction * name(a, b);
    if (order === "extension") {
      return direction * (a.directory ? 0 : names.compare(extension(a.name), extension(b.name))) || name(a, b);
    }
    const field = order === "size" ? "size" : "modified";
    const left = entryMetadata(a)[field], right = entryMetadata(b)[field];
    // Missing metadata stays last in either direction; never invent directory timestamps or sizes.
    if (left === undefined || right === undefined) return Number(left === undefined) - Number(right === undefined) || name(a, b);
    return direction * (left - right) || name(a, b);
  });
}

export class FileTree<T extends SourceFile> {
  private readonly directories = new Map<string, Map<string, Entry<T>>>([["", new Map()]]);
  readonly rootName: string;
  readonly count: number;

  constructor(files: Iterable<T>) {
    const input = [...files];
    const first = input[0];
    this.rootName = first?.webkitRelativePath.split("/")[0] || "Files";
    this.count = input.length;
    for (const file of input) {
      const parts = (file.webkitRelativePath || file.name).split("/");
      // Picker paths share one root. Reject ambiguous paths at the ingestion boundary.
      if (parts.some(part => !part || part === "." || part === "..") ||
          (file.webkitRelativePath && parts[0] !== this.rootName)) {
        throw new Error("Files must have relative paths beneath one folder.");
      }
      if (file.webkitRelativePath) parts.shift();
      if (!parts.length) throw new Error("A file path must include a name beneath its root.");
      let parent = "";
      for (const [index, name] of parts.entries()) {
        const path = parent ? `${parent}/${name}` : name;
        const directory = index < parts.length - 1;
        const children = this.directories.get(parent)!;
        const existing = children.get(name);
        if (existing && (!existing.directory || !directory)) {
          throw new Error(`Conflicting file path: ${path}`);
        }
        if (!existing) children.set(name, { name, path, directory, file: directory ? undefined : file });
        if (directory && !this.directories.has(path)) this.directories.set(path, new Map());
        parent = path;
      }
    }
  }

  list(path = "", query = "", order: SortOrder = "name", descending = false): Entry<T>[] {
    const children = this.directories.get(path);
    if (!children) throw new Error("Folder does not exist.");
    const needle = query.toLocaleLowerCase();
    return sortEntries([...children.values()]
      .filter(entry => entry.name.toLocaleLowerCase().includes(needle)), order, descending);
  }
}

/** Keep absolute paths at / and picker-relative paths inside their granted root. */
export function parentDirectory(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const parent = trimmed.slice(0, Math.max(0, trimmed.lastIndexOf("/")));
  return parent || (path.startsWith("/") ? "/" : "");
}
