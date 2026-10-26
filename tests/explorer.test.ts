import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { FileTree, sortEntries, parentDirectory, entryMetadata, formatSize, formatModified } from "../packages/files/src/index";
import { compileLSColors, entryColor } from "../packages/files/src/colors";

function file(path: string, text = "hello"): File {
  const value = new File([text], path.split("/").at(-1)!, { lastModified: 1000 });
  Object.defineProperty(value, "webkitRelativePath", { value: path });
  return value;
}

test("folder indexing preserves hierarchy, orders folders first, and filters locally", () => {
  const tree = new FileTree([file("root/z.txt"), file("root/src/b.ts"), file("root/src/a.ts")]);
  assert.equal(tree.rootName, "root");
  assert.equal(tree.count, 3);
  assert.deepEqual(tree.list().map(entry => entry.name), ["src", "z.txt"]);
  assert.deepEqual(tree.list("src", "A.T").map(entry => entry.name), ["a.ts"]);
  assert.equal(tree.list("", "a.ts").length, 0);
  assert.throws(() => tree.list("missing"), /does not exist/);
  assert.deepEqual(new FileTree([]).list(), []);
});

test("ingestion rejects traversal, mixed roots, duplicate files and file-directory collisions", () => {
  for (const path of ["root/../secret", "root/./a", "root//a", "/root/a", "root/"]) {
    assert.throws(() => new FileTree([file(path)]));
  }
  assert.throws(() => new FileTree([file("one/a"), file("two/b")]));
  assert.throws(() => new FileTree([file("root/a"), file("root/a")]));
  for (const paths of [["root/a", "root/a/b"], ["root/a/b", "root/a"]]) {
    assert.throws(() => new FileTree(paths.map(path => file(path))), /Conflicting/);
  }
});

test("standalone page uses plain links and a read-only folder picker", async () => {
  const html = await readFile("dist/index.html", "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "file:///explorer/index.html",
    beforeParse(window) {
      window.URL.createObjectURL = file => `blob:local-${(file as File).name}`;
      window.URL.revokeObjectURL = () => {};
    },
  });
  dom.window.eval(dom.window.document.querySelector("script")!.textContent!);
  const { document, Event, MouseEvent } = dom.window;
  const picker = document.querySelector<HTMLInputElement>("#picker")!;
  assert.equal(document.querySelector<HTMLButtonElement>("#open")!.hidden, false);
  const name = "<img onerror=alert(1)>.txt";
  Object.defineProperty(picker, "files", { value: [file(`root/${name}`), file("root/sub/a.txt")] });
  picker.dispatchEvent(new Event("change"));
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries a").length, 2);
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries a")[1]!.textContent, name);
  assert.equal(document.querySelectorAll("#entries img, table, dialog, script[src], link[href]").length, 0);
  document.querySelectorAll<HTMLAnchorElement>("#entries a")[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(document.querySelector("#path")!.textContent, "root/sub");
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries a").length, 1);
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries a")[0]!.textContent, "a.txt");
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries a")[0]!.href, "blob:local-a.txt");
  const up = () => {
    const event = new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, cancelable: true });
    document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  };
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, shiftKey: true }));
  assert.equal(document.querySelector("#path")!.textContent, "root/sub");
  up();
  assert.equal(document.querySelector("#path")!.textContent, "root");
  assert.equal(document.querySelectorAll("#entries a").length, 2);
  up();
  assert.equal(document.querySelector("#path")!.textContent, "root");
  dom.window.close();
});

test("embedded sorting retains original order on request and keeps literal links", async () => {
  const html = await readFile("dist/index.html", "utf8");
  for (const url of ["worminal:///work%20tree", "worminal:///files?path=%2Fwork%20tree"]) {
    const requests: string[] = [];
    const dom = new JSDOM(html, { runScripts: "outside-only", url,
      beforeParse(window) {
        window.TextDecoder = TextDecoder;
        window.fetch = async (input: string) => {
          requests.push(new URL(input).searchParams.get("path")!);
          return { ok: true, json: async () => [
            [Buffer.from("literal <#?% ü>.txt").toString("base64"), false, 14, 1000],
            [Buffer.from("empty").toString("base64"), true, 0, 2000],
          ] } as Response;
        };
      },
    });
    dom.window.eval(dom.window.document.querySelector("script")!.textContent!);
    await new Promise(resolve => setTimeout(resolve, 0));
    const { document } = dom.window;
    assert.deepEqual(requests, ["/work tree"]);
    assert.equal(document.querySelector("#path")!.textContent, "/work tree");
    assert.equal(document.body.firstElementChild!.id, "path");
    assert.equal(document.querySelectorAll("#sort button").length, 0);
    assert.equal(document.querySelectorAll("#sort a").length, 5);
    assert.equal(document.querySelector<HTMLButtonElement>("#open")!.hidden, true);
    assert.deepEqual(Array.from(document.querySelectorAll<HTMLAnchorElement>("#entries a"), link => link.textContent), ["empty", "literal <#?% ü>.txt"]);
    assert.equal(dom.window.getComputedStyle(document.querySelectorAll<HTMLAnchorElement>("#entries a")[0]!).textDecoration, "none");
    assert.equal(document.querySelectorAll("select").length, 0);
    const click = (key: string) => document.querySelector<HTMLAnchorElement>(`[data-sort="${key}"]`)!.click();
    click("modified");
    assert.equal(document.querySelector('[data-sort="modified"]')!.textContent, "Modified ↓");
    click("modified");
    assert.equal(document.querySelector('[data-sort="modified"]')!.textContent, "Modified ↑");
    click("extension");
    const folder = new URL(document.querySelectorAll<HTMLAnchorElement>("#entries a")[0]!.href);
    assert.equal(folder.searchParams.get("path"), "/work tree/empty");
    assert.equal(folder.searchParams.get("sort"), "extension");
    assert.equal(folder.searchParams.get("desc"), "0");
    click("none");
    assert.deepEqual(Array.from(document.querySelectorAll<HTMLAnchorElement>("#entries a"), link => link.textContent), ["literal <#?% ü>.txt", "empty"]);
    assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries a")[0]!.href, "worminal:///work%20tree/literal%20%3C%23%3F%25%20%C3%BC%3E.txt");
    assert.equal(new URL(document.querySelectorAll<HTMLAnchorElement>("#entries a")[1]!.href).searchParams.get("path"), "/work tree/empty");
    assert.equal(document.querySelectorAll("#entries .entry").length, 2);
    const cells = [...document.querySelectorAll("#entries .entry")].map(row =>
      [...row.children].map(cell => cell.textContent));
    assert.deepEqual(cells, [["literal <#?% ü>.txt", "14", formatModified(1000)],
                             ["empty", "", formatModified(2000)]]);
    assert.equal(document.querySelectorAll("#entries img, table, dialog").length, 0);
    dom.window.close();
  }
});

test("error template and native initial background use the page palette", async () => {
  assert.deepEqual((await readdir("dist")).sort(), ["error.html", "find.js", "index.html", "theme.json"]);
  const error = await readFile("dist/error.html", "utf8");
  const theme = JSON.parse(await readFile("dist/theme.json", "utf8"));
  assert.equal(error.split(theme.message_slot).length, 2);
  assert.ok(error.includes(`--browser-background: ${theme.background};`));
  assert.equal(error.includes("{{style}}"), false);
  const dom = new JSDOM(error);
  assert.equal(dom.window.document.querySelectorAll("script, link, iframe").length, 0);
  dom.window.close();
});

test("LS_COLORS compiles validated ANSI, indexed, and RGB rules without underlines", () => {
  const colors = compileLSColors("di=01;04;34:fi=0:*.zip=38;5;196:*.txt=38;2;12;34;56;48;5;232");
  assert.equal(entryColor(colors, "folder.txt", true), "color:#6a9fb5;font-weight:bold");
  assert.equal(entryColor(colors, "FILE.ZIP", false), "color:rgb(255,0,0)");
  assert.equal(entryColor(colors, "note.txt", false), "color:rgb(12,34,56);background-color:rgb(8,8,8)");
  assert.equal(entryColor(colors, "plain", false), "");
  assert.equal(entryColor(compileLSColors("di=31;0;32"), "dir", true), "color:#90a959");
  for (const value of ["38;5;256", "38;2;1;2", "red;background:url(unsafe)"]) {
    assert.equal(entryColor(compileLSColors(`di=${value}`), "dir", true), "");
  }
});

test("LS_COLORS suffix precedence, case distinctions, and escaped separators match names literally", () => {
  assert.equal(entryColor(compileLSColors("*.tar.gz=31:*.gz=32"), "archive.tar.gz", false), "color:#90a959");
  const colors = compileLSColors("*.C=31:*.c=32:*.c=33:*.a\\:b=35:*.a\\=b=36");
  assert.equal(entryColor(colors, "source.C", false), "color:#ac4242");
  assert.equal(entryColor(colors, "source.c", false), "color:#f4bf75");
  assert.equal(entryColor(colors, "file.a:b", false), "color:#aa759f");
  assert.equal(entryColor(colors, "file.a=b", false), "color:#75b5aa");
});

test("sorting is natural, reversible, folders-first, and does not mutate enumeration order", () => {
  const entries = [
    { name: "file10.txt", path: "file10.txt", directory: false },
    { name: "file2.py", path: "file2.py", directory: false },
    { name: "folder", path: "folder", directory: true },
    { name: "file1.txt", path: "file1.txt", directory: false },
  ];
  assert.deepEqual(sortEntries(entries).map(entry => entry.name), ["folder", "file1.txt", "file2.py", "file10.txt"]);
  assert.deepEqual(sortEntries(entries, "name", true).map(entry => entry.name),
                   ["folder", "file10.txt", "file2.py", "file1.txt"]);
  assert.deepEqual(sortEntries(entries, "extension").map(entry => entry.name),
                   ["folder", "file2.py", "file1.txt", "file10.txt"]);
  assert.deepEqual(sortEntries(entries, "none"), entries);
  assert.equal(entries[0]!.name, "file10.txt");
  assert.deepEqual(sortEntries([
    { name: "b", path: "b", directory: true }, { name: "a.z", path: "a.z", directory: true },
  ], "extension").map(entry => entry.name), ["a.z", "b"]);
});

test("time and size sorting use real metadata, reverse both ways, and leave unknown values last", () => {
  const entries = [
    { name: "old", path: "old", directory: false, size: 100, modified: 0 },
    { name: "new", path: "new", directory: false, size: 0, modified: 2000 },
    { name: "folder", path: "folder", directory: true },
    { name: "unknown", path: "unknown", directory: false },
  ];
  for (const [order, descending, expected] of [
    ["modified", true, ["folder", "new", "old", "unknown"]],
    ["modified", false, ["folder", "old", "new", "unknown"]],
    ["size", true, ["folder", "old", "new", "unknown"]],
    ["size", false, ["folder", "new", "old", "unknown"]],
  ] as const) {
    assert.deepEqual(sortEntries(entries, order, descending).map(entry => entry.name), expected);
  }
  const picker = new FileTree([file("root/small", "x"), file("root/large", "long")]);
  assert.deepEqual(picker.list("", "", "size", true).map(entry => entry.name), ["large", "small"]);
});

test("missing LS_COLORS rules use Worminal defaults while explicit resets remain plain", () => {
  assert.equal(entryColor(compileLSColors(""), "folder", true), "color:#6a9fb5");
  assert.equal(entryColor(compileLSColors("*.txt=31"), "folder.txt", true), "color:#6a9fb5");
  assert.equal(entryColor(compileLSColors("di=0"), "folder", true), "");
  assert.equal(entryColor(compileLSColors("no=33"), "folder", true), "color:#f4bf75");
  assert.equal(entryColor(compileLSColors(""), "plain", false), "color:#d8d8d8");
});

test("parent navigation handles absolute, relative, trailing-slash, and literal paths", () => {
  for (const [path, parent] of [["/", "/"], ["/home/", "/"], ["/home/user", "/home"],
    ["", ""], ["sub", ""], ["sub/deep/", "sub"], ["/a <#?% ü>/child", "/a <#?% ü>"]]) {
    assert.equal(parentDirectory(path!), parent);
  }
});

test("metadata columns use compact sizes and local minute timestamps without inventing values", () => {
  for (const [size, text] of [[0, "0"], [14, "14"], [1024, "1K"], [1536, "1.5K"], [3 * 1024 ** 2, "3M"]] as const)
    assert.equal(formatSize(size), text);
  for (const size of [undefined, -1, NaN, Infinity]) assert.equal(formatSize(size), "");
  assert.equal(formatModified(new Date(2026, 9, 25, 14, 3).getTime()), "26-10-25 14:03");
  for (const time of [undefined, NaN, Infinity, 1e20]) assert.equal(formatModified(time), "");
  const leaf = file("root/a", "hello");
  assert.deepEqual(entryMetadata({ name: "a", path: "a", directory: false, file: leaf }),
                   { size: 5, modified: 1000 });
  assert.deepEqual(entryMetadata({ name: "dir", path: "dir", directory: true }),
                   { size: undefined, modified: undefined });
});

test("native find presentation preserves the selection and focuses its containing link on accept", async () => {
  const dom = new JSDOM('<a href="/target"><span>match</span></a>', { runScripts: "outside-only" });
  const script = await readFile("dist/find.js", "utf8");
  const present = (action: string) => dom.window.eval(script + `\nWorminalFind.update('${action}')`);
  const { document } = dom.window;
  const selection = document.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(document.querySelector("span")!);
  selection.addRange(range);
  present("show");
  assert.equal(selection.toString(), "match");
  assert.ok(document.querySelector("[data-worminal-find]")!.textContent!.includes("#ffdd00"));
  present("accept");
  assert.equal(document.activeElement, document.querySelector("a"));
  assert.equal(selection.toString(), "match");
  present("clear");
  assert.equal(document.querySelectorAll("[data-worminal-find]").length, 0);
  dom.window.close();
});
