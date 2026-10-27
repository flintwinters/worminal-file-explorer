import buildMeta from "../../../build-meta.json";
const BUILD_META = buildMeta.versionTag;

export function watchBuild(): void {
  const bridge = window.worminal;
  const version = document.querySelector<HTMLMetaElement>(`meta[name="${BUILD_META}"]`)?.content;
  if (!bridge?.readFile || !version || location.protocol !== "file:") return;
  const file = decodeURIComponent(location.pathname);
  const directory = file.slice(0, file.lastIndexOf("/")) || "/";
  const name = file.slice(file.lastIndexOf("/") + 1);
  let observed = "";
  let checking = false;
  async function check(): Promise<void> {
    if (checking || document.hidden) return;
    checking = true;
    try {
      const rows = await bridge!.readDirectory(directory);
      const row = rows.find(([encoded]) => new TextDecoder().decode(
        Uint8Array.from(atob(encoded), char => char.charCodeAt(0))) === name);
      if (!row) return;
      const stamp = `${row[2]}:${row[3]}`;
      if (stamp === observed) return;
      const source = new TextDecoder().decode(await bridge!.readFile!(file));
      const next = new DOMParser().parseFromString(source, "text/html")
        .querySelector<HTMLMetaElement>(`meta[name="${BUILD_META}"]`)?.content;
      if (!next) return;
      observed = stamp;
      if (next !== version) {
        const url = new URL(location.href);
        url.searchParams.set("build", next);
        location.replace(url.href);
      }
    } catch {
      // Failed or temporarily unavailable builds leave the working document intact; retry later.
    } finally {
      checking = false;
    }
  }
  void check();
  window.setInterval(() => { void check(); }, 1500);
  document.addEventListener("visibilitychange", () => { void check(); });
}
