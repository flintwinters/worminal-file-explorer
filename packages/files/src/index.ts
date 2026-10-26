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
}

export type SortOrder = "name" | "name-desc" | "type" | "none";
const names = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

export function sortEntries<T extends SourceFile>(entries: Entry<T>[], order: SortOrder = "name"): Entry<T>[] {
  const result = [...entries];
  if (order === "none") return result;
  return result.sort((a, b) => Number(b.directory) - Number(a.directory) ||
    (order === "type" && !a.directory ? names.compare(extension(a.name), extension(b.name)) : 0) ||
    (order === "name-desc" ? -1 : 1) * (names.compare(a.name, b.name) || a.name.localeCompare(b.name)));
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

  list(path = "", query = "", order: SortOrder = "name"): Entry<T>[] {
    const children = this.directories.get(path);
    if (!children) throw new Error("Folder does not exist.");
    const needle = query.toLocaleLowerCase();
    return sortEntries([...children.values()]
      .filter(entry => entry.name.toLocaleLowerCase().includes(needle)), order);
  }
}
