import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { transform } from "esbuild";

async function runPage(dom: JSDOM): Promise<void> {
  // JSDOM has no module-script runner; preserve the page URL when evaluating its bundle.
  const script = dom.window.document.querySelector("script")!.textContent!;
  const result = await transform(script, { define: { "import.meta.url": JSON.stringify(dom.window.location.href) } });
  dom.window.eval(result.code);
}
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
  await runPage(dom);
  const { document, Event, MouseEvent } = dom.window;
  if (process.env.WORMINAL_FONT_JSON) {
    const font = JSON.parse(process.env.WORMINAL_FONT_JSON);
    assert.equal(document.documentElement.style.lineHeight, `${font.lineHeight}px`);
  }
  const picker = document.querySelector<HTMLInputElement>("#picker")!;
  assert.equal(document.querySelector<HTMLButtonElement>("#open")!.hidden, false);
  const name = "<img onerror=alert(1)>.txt";
  Object.defineProperty(picker, "files", { value: [file(`root/${name}`), file("root/sub/a.txt")] });
  picker.dispatchEvent(new Event("change"));
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name").length, 2);
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name")[1]!.textContent, name);
  assert.equal(document.querySelectorAll("#entries img, table, dialog, script[src], link[href]").length, 0);
  document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name")[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(document.querySelector("#path")!.textContent, "root/sub");
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name").length, 1);
  assert.equal(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name")[0]!.textContent, "a.txt");
  assert.equal(document.querySelector("#entries .entry-name")!.hasAttribute("href"), false);
  assert.equal(document.querySelector<HTMLAnchorElement>(".open-file")!.href, "blob:local-a.txt");
  assert.equal(document.querySelector(".open-file")!.textContent, "open");
  const up = () => {
    const event = new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, cancelable: true });
    document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  };
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, shiftKey: true }));
  assert.equal(document.querySelector("#path")!.textContent, "root/sub");
  up();
  assert.equal(document.querySelector("#path")!.textContent, "root");
  assert.equal(document.querySelectorAll("#entries .entry-name").length, 2);
  up();
  assert.equal(document.querySelector("#path")!.textContent, "root");
  dom.window.close();
});

test("embedded sorting retains original order on request and keeps literal links", async () => {
  const html = await readFile("dist/index.html", "utf8");
  for (const url of ["file:///explorer/index.html?path=%2Fwork%20tree", "file:///explorer/index.html?cwd=%2Fwork%20tree"]) {
    const requests: string[] = [];
    const dom = new JSDOM(html, { runScripts: "outside-only", url,
      beforeParse(window) {
        window.TextDecoder = TextDecoder;
        (window as unknown as { worminal: object }).worminal = { readDirectory: async (path: string) => {
          requests.push(path);
          return [
            [Buffer.from("literal <#?% ü>.txt").toString("base64"), false, 14, 1000],
            [Buffer.from("empty").toString("base64"), true, 0, 2000],
          ];
        } };
      },
    });
    await runPage(dom);
    await new Promise(resolve => setTimeout(resolve, 0));
    const { document } = dom.window;
    assert.deepEqual(requests, ["/work tree"]);
    assert.equal(document.querySelector("#path")!.textContent, "/work tree");
    assert.equal(document.body.firstElementChild!.id, "path");
    assert.equal(document.querySelectorAll("#sort button").length, 0);
    assert.equal(document.querySelectorAll("#sort a").length, 5);
    assert.equal(document.querySelector<HTMLButtonElement>("#open")!.hidden, true);
    assert.deepEqual(Array.from(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name"), link => link.textContent), ["empty", "literal <#?% ü>.txt"]);
    assert.equal(dom.window.getComputedStyle(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name")[0]!).textDecoration, "none");
    assert.equal(document.querySelectorAll("select").length, 0);
    const click = (key: string) => document.querySelector<HTMLAnchorElement>(`[data-sort="${key}"]`)!.click();
    assert.equal(document.querySelector('[data-sort="modified"]')!.textContent, "Modified ↓");
    click("modified");
    assert.equal(document.querySelector('[data-sort="modified"]')!.textContent, "Modified ↑");
    click("extension");
    const folder = new URL(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name")[0]!.href);
    assert.equal(folder.searchParams.get("path"), "/work tree/empty");
    assert.equal(folder.searchParams.get("sort"), "extension");
    assert.equal(folder.searchParams.get("desc"), "0");
    click("none");
    assert.deepEqual(Array.from(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name"), link => link.textContent), ["literal <#?% ü>.txt", "empty"]);
    assert.equal(document.querySelectorAll(".open-file").length, 1);
    assert.equal(document.querySelector("#entries .entry-name")!.hasAttribute("href"), false);
    assert.equal(document.querySelector<HTMLAnchorElement>(".open-file")!.href, "file:///work%20tree/literal%20%3C%23%3F%25%20%C3%BC%3E.txt");
    assert.equal(document.querySelector(".open-file")!.getAttribute("aria-label"), "Open literal <#?% ü>.txt");
    assert.equal(dom.window.getComputedStyle(document.querySelector(".open-file")!).opacity, "0");
    assert.equal(new URL(document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name")[1]!.href).searchParams.get("path"), "/work tree/empty");
    assert.equal(document.querySelectorAll("#entries .entry").length, 2);
    const cells = [...document.querySelectorAll("#entries .entry")].map(row =>
      [...row.children].map(cell => cell.textContent));
    assert.deepEqual(cells, [["literal <#?% ü>.txt", "open", "14", formatModified(1000)],
                             ["empty", "", "", formatModified(2000)]]);
    assert.equal(document.querySelectorAll("#entries img, table, dialog").length, 0);
    dom.window.close();
  }
});

test("build exports only the runtime HTML document", async () => {
  assert.deepEqual(await readdir("dist"), ["index.html"]);
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

test("image hover previews load on demand and clear on leave, failure, scroll, and rerender", async () => {
  const html = await readFile("dist/index.html", "utf8");
  for (const native of [false, true]) {
    const names = ["photo <#%>.PNG", "animation.gif", "vector.svg", "note.txt", "folder.png"];
    const dom = new JSDOM(html, { runScripts: "outside-only", url: "file:///explorer/index.html?path=/pictures",
      beforeParse(window) {
        window.TextDecoder = TextDecoder;
        window.URL.createObjectURL = file => `blob:local-${encodeURIComponent((file as File).name)}`;
        window.URL.revokeObjectURL = () => {};
        if (native) (window as unknown as { worminal: object }).worminal = {
          readDirectory: async () => names.map(name => [Buffer.from(name).toString("base64"), name === "folder.png"]),
        };
      },
    });
    await runPage(dom);
    const { document, Event } = dom.window;
    if (native) await new Promise(resolve => setTimeout(resolve, 0));
    else {
      const picker = document.querySelector<HTMLInputElement>("#picker")!;
      Object.defineProperty(picker, "files", { value: names.map(name => file(`root/${name === "folder.png" ? `${name}/child.txt` : name}`)) });
      picker.dispatchEvent(new Event("change"));
    }
    const links = [...document.querySelectorAll<HTMLAnchorElement>("#entries .entry-name")];
    const link = (name: string) => links.find(value => value.textContent === name)!;
    const preview = () => document.querySelector<HTMLImageElement>(".image-preview");
    const hover = (name: string) => link(name).dispatchEvent(new Event("pointerenter"));
    assert.equal(preview(), null);
    for (const name of ["note.txt", "folder.png"]) {
      hover(name);
      assert.equal(preview(), null);
    }
    hover(names[0]!);
    const first = preview()!;
    assert.equal(first.src, link(names[0]!).parentElement!.querySelector<HTMLAnchorElement>(".open-file")!.href);
    assert.equal(first.alt, names[0]);
    assert.equal(first.hidden, true);
    first.dispatchEvent(new Event("load"));
    assert.equal(first.hidden, false);
    hover("animation.gif");
    const second = preview()!;
    first.dispatchEvent(new Event("error"));
    assert.equal(preview(), second);
    second.dispatchEvent(new Event("error"));
    assert.equal(preview(), null);
    hover("vector.svg");
    link("vector.svg").dispatchEvent(new Event("pointerleave"));
    assert.equal(preview(), null);
    hover("vector.svg");
    document.dispatchEvent(new Event("scroll"));
    assert.equal(preview(), null);
    hover("vector.svg");
    dom.window.dispatchEvent(new Event("blur"));
    assert.equal(preview(), null);
    hover("vector.svg");
    document.querySelector<HTMLAnchorElement>('[data-sort="size"]')!.click();
    assert.equal(preview(), null);
    dom.window.close();
  }
});


test("video previews are lazy, muted, and release playback on leave and replacement", async () => {
  const html = await readFile("dist/index.html", "utf8");
  for (const native of [false, true]) {
    const names = ["clip.mp4", "movie.webm", "film.ogv", "folder.mp4", "document.pdf", "note.txt"];
    let pauses = 0;
    let loads = 0;
    const dom = new JSDOM(html, { runScripts: "outside-only", url: "file:///explorer/index.html?path=/media",
      beforeParse(window) {
        window.TextDecoder = TextDecoder;
        window.HTMLMediaElement.prototype.pause = () => { pauses++; };
        window.HTMLMediaElement.prototype.load = () => { loads++; };
        window.URL.createObjectURL = file => `blob:local-${(file as File).name}`;
        window.URL.revokeObjectURL = () => {};
        if (native) (window as unknown as { worminal: object }).worminal = {
          readDirectory: async () => names.map(name => [Buffer.from(name).toString("base64"), name === "folder.mp4"]),
        };
      },
    });
    await runPage(dom);
    const { document, Event } = dom.window;
    if (native) await new Promise(resolve => setTimeout(resolve, 0));
    else {
      const picker = document.querySelector<HTMLInputElement>("#picker")!;
      Object.defineProperty(picker, "files", { value: names.map(name =>
        file(`root/${name === "folder.mp4" ? `${name}/child.txt` : name}`)) });
      picker.dispatchEvent(new Event("change"));
    }
    const link = (name: string) => [...document.querySelectorAll(".entry-name")].find(node => node.textContent === name)!;
    const hover = (name: string) => link(name).dispatchEvent(new Event("pointerenter"));
    assert.equal(document.querySelector("video, canvas"), null);
    hover("folder.mp4");
    hover("note.txt");
    assert.equal(document.querySelector(".image-preview"), null);
    hover("clip.mp4");
    const first = document.querySelector("video")!;
    assert.equal(first.src, link("clip.mp4").parentElement!.querySelector<HTMLAnchorElement>(".open-file")!.href);
    assert.equal(first.muted, true);
    assert.equal(first.autoplay, true);
    assert.equal(first.loop, true);
    assert.equal(first.playsInline, true);
    assert.equal(first.hidden, true);
    first.dispatchEvent(new Event("loadeddata"));
    assert.equal(first.hidden, false);
    hover("movie.webm");
    const second = document.querySelector("video")!;
    assert.notEqual(second, first);
    assert.equal(first.hasAttribute("src"), false);
    assert.equal(pauses, 1);
    assert.equal(loads, 1);
    first.dispatchEvent(new Event("error"));
    assert.equal(document.querySelector("video"), second);
    link("movie.webm").dispatchEvent(new Event("pointerleave"));
    assert.equal(document.querySelector("video"), null);
    assert.equal(pauses, 2);
    hover("film.ogv");
    document.querySelector("video")!.dispatchEvent(new Event("error"));
    assert.equal(document.querySelector("video"), null);
    hover("document.pdf");
    assert.equal(document.querySelector("canvas")!.hidden, true);
    link("document.pdf").dispatchEvent(new Event("pointerleave"));
    assert.equal(document.querySelector("canvas"), null);
    // Let the deferred PDF import observe its aborted signal before closing the document.
    await new Promise(resolve => setTimeout(resolve, 0));
    dom.window.close();
  }
});


test("bundled PDF engine renders the first page into pixels", async () => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile("tests/fixtures/preview.pdf"));
  const loading = getDocument({ data, isEvalSupported: false });
  try {
    const pdf = await loading.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const factory = pdf.canvasFactory as { create(width: number, height: number): {
      canvas: HTMLCanvasElement; context: CanvasRenderingContext2D;
    } };
    const { context } = factory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    assert.deepEqual([...context.getImageData(50, 50, 1, 1).data], [255, 0, 0, 255]);
  } finally {
    await loading.destroy();
  }
});


test("path and file-name activation copy literal paths while directories retain navigation", async () => {
  const html = await readFile("dist/index.html", "utf8");
  for (const clipboardAPI of [false, true]) {
    const copied: string[] = [];
    const name = "literal <#?% ü>.txt";
    const dom = new JSDOM(html, { runScripts: "outside-only", url: "file:///explorer/index.html?path=/work%20tree",
      beforeParse(window) {
        window.TextDecoder = TextDecoder;
        (window as unknown as { worminal: object }).worminal = {
          readDirectory: async () => [[Buffer.from(name).toString("base64"), false],
                                     [Buffer.from("folder").toString("base64"), true]],
        };
        if (clipboardAPI) Object.defineProperty(window.navigator, "clipboard", {
          value: { writeText: async (text: string) => { copied.push(text); } },
        });
        else window.document.execCommand = command => {
          assert.equal(command, "copy");
          copied.push(window.document.querySelector("textarea")!.value);
          return true;
        };
      },
    });
    await runPage(dom);
    await new Promise(resolve => setTimeout(resolve, 0));
    const { document, KeyboardEvent } = dom.window;
    const path = document.querySelector<HTMLElement>("#path")!;
    const file = [...document.querySelectorAll<HTMLElement>(".entry-name")].find(node => node.textContent === name)!;
    const directory = [...document.querySelectorAll<HTMLElement>(".entry-name")].find(node => node.textContent === "folder")!;
    path.click();
    file.click();
    file.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    file.dispatchEvent(new KeyboardEvent("keydown", { key: " ", cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(copied, ["/work tree", ...Array(3).fill(`/work tree/${name}`)]);
    assert.equal(file.hasAttribute("href"), false);
    assert.equal(directory.hasAttribute("href"), true);
    assert.equal(directory.hasAttribute("role"), false);
    assert.equal(file.title, "Copied path");
    assert.equal(document.querySelector("textarea"), null);
    assert.equal(document.querySelector<HTMLAnchorElement>(".open-file")!.href,
      "file:///work%20tree/literal%20%3C%23%3F%25%20%C3%BC%3E.txt");
    dom.window.close();
  }
});
