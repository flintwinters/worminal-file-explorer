# File explorer

Keep the explorer plain, dark, small, and local. Match the original native directory listing:
file/folder links, normal browser navigation, and the current path above plain text sorting links.
Alt+Up opens the parent directory, stopping at filesystem or folder-picker roots. Avoid decorative styling.
Names, compact sizes, and local modification times share aligned columns; missing metadata stays blank.
Links reveal underlines on hover. Compile LS_COLORS into the artifact; browser code only matches the baked rules.
Image links load a bounded hover preview on demand, using the same native or picked-file URL as navigation.
An optional WORMINAL_PALETTE JSON build input supplies host colors; standalone defaults live in palette.json.
Explicit LS_COLORS rules take precedence. Use text-safe DOM operations; filenames are never markup.

This independent npm workspace exports one self-contained dist/index.html, opened as an ordinary local file.
Rebuild and reopen or reload the document; no Worminal rebuild or reinstall is involved.
Its manage.py open passes the compiled HTML and caller directory to worminal --new-browser-tab explicitly.
Selected local documents use the host's generic read-only directory metadata API; file links use file://.
Metadata includes directory status, size and modification time; executable and symlink status remain unavailable.
Do not infer those attributes from names. Standalone browsers retain a folder picker and the shared FileTree index.

Use python3 manage.py build or check after npm ci. Keep build outputs and dependencies untracked.
Hyperlinter is pinned in tools/hyperlint; run python3 manage.py lint after installing its locked
dependencies. Preserve reported policy; do not write baselines merely to make findings pass.

WORMINAL_FONT_JSON optionally supplies the host font family, point size, and measured pixel line height at build time.
