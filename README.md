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
The page cannot read arbitrary filesystem paths; native Worminal integration is separate work.

`apps/explorer` owns the DOM interface. `packages/files` owns path validation and directory indexing.
Vite with `vite-plugin-singlefile` bundles TypeScript and embeds the script and CSS in `dist/index.html`.
