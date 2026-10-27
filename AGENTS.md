# File explorer

Keep the explorer plain, dark, small, and local. Match the original native directory listing:
directory links, explicit file open actions, normal browser navigation, and the current path above plain text sorting links.
Default to modified time descending; explicit URL sort choices override it.
Alt+Up opens the parent directory, stopping at filesystem or folder-picker roots. Avoid decorative styling.
Clicking the current path copies it. Clicking a file selects its row; sorting preserves selection.
File names do not navigate; a gray open link before size appears on row hover or keyboard focus.
Names, compact sizes, and local modification times share aligned columns; missing metadata stays blank.
Links reveal underlines on hover. Compile LS_COLORS into the artifact; browser code only matches the baked rules.
Images, videos, and PDF first pages load bounded hover previews on demand from their file URLs.
PDF.js and its worker are bundled offline; leaving a preview cancels its loading and playback.
An optional WORMINAL_PALETTE JSON build input supplies host colors; standalone defaults live in palette.json.
Explicit LS_COLORS rules take precedence. Use text-safe DOM operations; filenames are never markup.

This independent npm workspace exports one self-contained dist/index.html, opened as an ordinary local file.
Rebuild and normally reload (Ctrl+R) or reopen the document; the running Worminal frontend stays.
Launch through worminal --new-browser-tab with the compiled HTML target explicitly.
manage.py is internal build/test tooling, never a user launcher. Do not introduce live updates without a request.
Selected local documents use the host's generic read-only directory metadata API; file links use file://.
Metadata includes directory status, size and modification time; executable and symlink status remain unavailable.
Do not infer those attributes from names. Standalone browsers retain a folder picker and the shared FileTree index.

Use python3 manage.py build or check after npm ci. Keep build outputs and dependencies untracked.
Hyperlinter is pinned in tools/hyperlint; run python3 manage.py lint after installing its locked
dependencies. Preserve reported policy; do not write baselines merely to make findings pass.

WORMINAL_FONT_JSON optionally supplies the host font family, point size, and measured pixel line height at build time.
