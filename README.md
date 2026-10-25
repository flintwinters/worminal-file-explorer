# Worminal file explorer

A TypeScript npm workspace producing one offline, dark, deliberately plain HTML file.
No framework, server, CDN, fonts, or runtime dependencies.

```sh
npm ci
python3 manage.py check
python3 manage.py build
```

Open `dist/index.html` in a browser and choose a folder. Browse directories, filter the current
directory, preview UTF-8 text, and download files. Files stay local and are never modified.
The folder picker requires browser support for `webkitdirectory` and omits empty folders.
Standalone pages cannot read arbitrary filesystem paths. Inside Worminal, the page opens the calling
shell directory through host-owned read-only endpoints, including empty folders. Text previews read
at most 1 MiB; Open folder accepts an absolute path in this embedded mode.

`apps/explorer` owns the DOM interface. `packages/files` owns path validation and directory indexing.
Vite with `vite-plugin-singlefile` bundles TypeScript and embeds the script and CSS in `dist/index.html`.

Hyperlinter is pinned as the `tools/hyperlint` submodule. Initialize and run it from this repository:

```sh
git submodule update --init --recursive
npm --prefix tools/hyperlint ci --include=dev
python3 manage.py lint
```

Lint reports architecture and style policy separately from build/type/behavior checks. It records
local evidence and checks upstream for updates; it does not automatically fix or baseline findings.
