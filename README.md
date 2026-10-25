# Worminal file explorer

The submodule owns Worminal's plain dark directory page, error-page template, and palette.
The embedded page reproduces the original native listing: file/folder links in host enumeration
order, with ordinary browser navigation. Filenames are text, never HTML.

```sh
npm ci
python3 manage.py check
python3 manage.py build
```

`dist/index.html` is one offline page. Inside Worminal it uses the host's read-only directory
metadata endpoint; file links use the browser's normal file handling. Outside Worminal an
Open folder picker grants read access and omits empty folders. No files are uploaded or modified.
`dist/error.html` is the host error template; its declared message slot accepts escaped text only.
`dist/theme.json` exports the native initial background and message-slot contract.
`apps/explorer/src/palette.css` is the single source of colors for all three outputs.

`apps/explorer` owns the DOM interface and templates; `packages/files` owns standalone path validation
and indexing. Native builds embed the outputs without authoring HTML or CSS in C.

Hyperlinter is pinned at `tools/hyperlint`. Initialize submodules and install its dependencies before linting:

```sh
git submodule update --init --recursive
npm --prefix tools/hyperlint ci --include=dev
python3 manage.py lint
```
