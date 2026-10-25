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
  assert.equal(document.links.length, 2);
  assert.equal(document.links[1]!.textContent, name);
  assert.equal(document.querySelectorAll("#entries img, table, dialog, script[src], link[href]").length, 0);
  document.links[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(document.links.length, 1);
  assert.equal(document.links[0]!.textContent, "a.txt");
  assert.equal(document.links[0]!.href, "blob:local-a.txt");
  dom.window.close();
});

test("embedded page reproduces native links in enumeration order with literal encoded names", async () => {
  const html = await readFile("dist/index.html", "utf8");
  for (const url of ["worminal:///work%20tree", "worminal:///files?path=%2Fwork%20tree"]) {
    const requests: string[] = [];
    const dom = new JSDOM(html, { runScripts: "outside-only", url,
      beforeParse(window) {
        window.TextDecoder = TextDecoder;
        window.fetch = async (input: string) => {
          requests.push(new URL(input).searchParams.get("path")!);
          return { ok: true, json: async () => [
            [Buffer.from("literal <#?% ü>.txt").toString("base64"), false],
            [Buffer.from("empty").toString("base64"), true],
          ] } as Response;
        };
      },
    });
    dom.window.eval(dom.window.document.querySelector("script")!.textContent!);
    await new Promise(resolve => setTimeout(resolve, 0));
    const { document } = dom.window;
    assert.deepEqual(requests, ["/work tree"]);
    assert.equal(document.querySelector<HTMLButtonElement>("#open")!.hidden, true);
    assert.deepEqual(Array.from(document.links, link => link.textContent), ["literal <#?% ü>.txt", "empty"]);
    assert.equal(document.links[0]!.href, "worminal:///work%20tree/literal%20%3C%23%3F%25%20%C3%BC%3E.txt");
    assert.equal(document.links[1]!.href, "worminal:///work%20tree/empty");
    assert.equal(document.querySelectorAll("#entries br").length, 2);
    assert.equal(document.querySelectorAll("#entries img, table, dialog").length, 0);
    dom.window.close();
  }
});

test("error template and native initial background use the page palette", async () => {
  assert.deepEqual((await readdir("dist")).sort(), ["error.html", "index.html", "theme.json"]);
  const error = await readFile("dist/error.html", "utf8");
  const theme = JSON.parse(await readFile("dist/theme.json", "utf8"));
  assert.equal(error.split(theme.message_slot).length, 2);
  assert.ok(error.includes(`--browser-background: ${theme.background};`));
  assert.equal(error.includes("{{style}}"), false);
  const dom = new JSDOM(error);
  assert.equal(dom.window.document.querySelectorAll("script, link, iframe").length, 0);
  dom.window.close();
});
