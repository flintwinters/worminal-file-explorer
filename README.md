# Worminal file explorer

The submodule owns Worminal's plain dark directory page, error-page template, and palette.
The page reproduces the original native listing: file/folder links in host enumeration
order when Original is selected, with ordinary browser navigation. Plain text links sort by Name,
Extension, Modified, or Size in one click. Click the active link to reverse it; Modified starts
newest-first and Size largest-first. Sorted modes keep folders first. Folder navigation retains
the chosen sort. Listing columns show names, compact binary sizes (14, 1.2K, 3M), and local modification
times (YY-MM-DD HH:mm); directory sizes and unavailable metadata stay blank. Filenames are text, never HTML; links reveal underlines on hover.

```sh
npm ci
python3 manage.py check
python3 manage.py build
```

`dist/index.html` is a single offline HTML application. Open it directly with
`worminal --new-browser-tab /absolute/path/to/dist/index.html`, or run this workspace's
`python3 manage.py open` inside a Worminal terminal to open the caller's directory.
Rebuild and reopen or reload the page to use the latest output; Worminal is not rebuilt or reinstalled.
Worminal provides `window.worminal.readDirectory(path)` to explicitly selected local HTML documents.
Other browsers retain a folder picker; no files are uploaded or modified.

The build compiles LS_COLORS into directory and filename-suffix styles. An optional WORMINAL_PALETTE
JSON file supplies host ANSI colors; standalone defaults live in packages/files/src/palette.json.
Missing rules use blue for directories and foreground for files; explicit resets remain plain.
Indexed colors above 15 retain the standard color cube and gray ramp.
The current path appears above plain text sorting links. Alt+Up opens the parent directory while
retaining sorting, stopping at the filesystem or folder-picker root. Names and metadata stay text-safe.
Executable, symlink and permission colors require unavailable metadata; names never imply those attributes.

`apps/explorer` owns the DOM interface; `packages/files` owns path validation, indexing and metadata formatting.

Hyperlinter is pinned at `tools/hyperlint`. Initialize submodules and install its dependencies before linting:

```sh
git submodule update --init --recursive
npm --prefix tools/hyperlint ci --include=dev
python3 manage.py lint
```

WORMINAL_FONT_JSON optionally supplies the host font family, point size, and measured pixel line height at build time.

File names do not open files. Hover a row to reveal its gray open action before the size column; keyboard focus reveals it too.

Hover previews support images, PDF first pages, and browser-supported video codecs (MP4, WebM, Ogg, MOV, and MKV). Videos are muted. Native PDF previews accept regular files up to 32 MiB.

Click the current path or a file name to copy its full path; Enter and Space work with keyboard focus.
