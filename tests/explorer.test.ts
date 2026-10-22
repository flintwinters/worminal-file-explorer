import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { FileTree } from "../packages/files/src/index";

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

test("single HTML works offline: navigation, filtering, literal names and bounded safe previews", async () => {
  const html = await readFile("dist/index.html", "utf8");
  assert.deepEqual(await readdir("dist"), ["index.html"]);
  const dom = new JSDOM(html, {
    runScripts: "outside-only", url: "file:///explorer/index.html",
    beforeParse(window) {
      window.TextDecoder = TextDecoder;
      window.URL.createObjectURL = () => "blob:local-file";
      window.URL.revokeObjectURL = () => {};
      window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    },
  });
  // jsdom has no module loader; evaluate the bundled module after the DOM is parsed.
  dom.window.eval(dom.window.document.querySelector("script")!.textContent!);
  const { document, Event } = dom.window;
  const picker = document.querySelector<HTMLInputElement>("#picker")!;
  const query = document.querySelector<HTMLInputElement>("#filter")!;
  assert.equal(document.querySelectorAll("script[src], link[href], img[src], iframe").length, 0);
  const unsafeName = "<img onerror=alert(1)>.txt";
  const files = [file(`root/${unsafeName}`, "<script>alert('no')</script>"), file("root/sub/a.txt")];
  Object.defineProperty(picker, "files", { configurable: true, value: files });
  picker.dispatchEvent(new Event("change"));
  assert.equal(query.disabled, false);
  assert.equal(document.querySelectorAll("#entries tr").length, 2);
  assert.equal(document.querySelectorAll("#entries img").length, 0);
  (document.querySelector("#entries button") as HTMLButtonElement).click();
  assert.match(document.querySelector("#path")!.textContent!, /sub/);
  assert.match(document.querySelector("#entries")!.textContent!, /a.txt/);
  (document.querySelector("#path button") as HTMLButtonElement).click();
  query.value = "onerror";
  query.dispatchEvent(new Event("input"));
  assert.equal(document.querySelectorAll("#entries tr").length, 1);
  (document.querySelector("#entries button") as HTMLButtonElement).click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(document.querySelector("#preview-text")!.textContent, "<script>alert('no')</script>");
  assert.equal(document.querySelectorAll("#preview-text script").length, 0);
  assert.equal(document.querySelector("#download")!.getAttribute("download"), unsafeName);

  const big = file("next/large.txt", "a".repeat(1_048_577));
  Object.defineProperty(picker, "files", { configurable: true, value: [big] });
  picker.dispatchEvent(new Event("change"));
  (document.querySelector("#entries button") as HTMLButtonElement).click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(document.querySelector("#preview-text")!.textContent!.length, 1_048_576);
  assert.match(document.querySelector("#preview-note")!.textContent!, /limited/);
  dom.window.close();
});

test("embedded explorer starts at the supplied path and opens folders in page", async () => {
  const html = await readFile("dist/index.html", "utf8");
  const requests: string[] = [];
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "worminal:///files?path=/work%20tree",
    beforeParse(window) {
      window.TextDecoder = TextDecoder;
      window.fetch = async (input: string) => {
        const destination = new URL(input).searchParams.get("path")!;
        requests.push(destination);
        if (destination === "/denied") throw new window.Error("Permission denied");
        return { ok: true, json: async () => destination === "/empty" ? [] : [
          [Buffer.from("empty").toString("base64"), true, 0, 1000],
          [Buffer.from("<literal>.txt").toString("base64"), false, 12, 1000],
        ] } as Response;
      };
    },
  });
  dom.window.eval(dom.window.document.querySelector("script")!.textContent!);
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  await tick();
  const { document, KeyboardEvent } = dom.window;
  assert.deepEqual(requests, ["/work tree"]);
  assert.match(document.querySelector("#entries")!.textContent!, /<literal>.txt/);
  assert.equal(document.querySelectorAll("#entries literal").length, 0);
  (document.querySelector("#open") as HTMLButtonElement).click();
  const folder = document.querySelector<HTMLInputElement>('input[aria-label="Folder path"]')!;
  assert.equal(folder.hidden, false);
  assert.equal(folder.value, "/work tree");
  folder.value = "/empty";
  folder.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await tick();
  assert.equal(folder.hidden, true);
  assert.equal(document.querySelectorAll("#entries tr").length, 0);
  assert.match(document.querySelector("#path")!.textContent!, /empty/);
  folder.value = "/denied";
  folder.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await tick();
  assert.match(document.querySelector("#notice")!.textContent!, /Permission denied/);
  assert.match(document.querySelector("#path")!.textContent!, /empty/);
  dom.window.close();
});
