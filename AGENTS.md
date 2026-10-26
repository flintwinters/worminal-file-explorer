# File explorer

Keep the explorer plain, dark, small, and local. Match the original native directory listing:
file/folder links, normal browser navigation, and the current path above plain text sorting links.
Alt+Up opens the parent directory, stopping at filesystem or folder-picker roots. Avoid decorative styling.
Names, compact sizes, and local modification times share aligned columns; missing metadata stays blank.
Links are never underlined. Compile LS_COLORS into the artifact; browser code only matches the baked rules. The shared palette.json owns Worminal built-in ANSI colors
and directory fallbacks; explicit LS_COLORS rules take precedence.
Use native HTML controls and text-safe DOM operations; never interpret filenames as markup.

This npm workspace owns the directory page, error template, and shared palette. Its build exports
self-contained HTML, the native background/message-slot contract, and the isolated-world find helper.
WebKit owns matching; the helper presents the current selection and focuses its link on Escape. Error messages belong only
in the template's text-content slot. Worminal supplies read-only directory metadata and normal file
streams, not HTML or styling. Metadata includes directory status, size, and modified time; executable and symlink status remain unavailable;
do not infer executable or symlink status from names. Standalone use retains a folder picker and the shared FileTree index.

Use python3 manage.py build or check after npm ci. Keep build outputs and dependencies untracked.
Hyperlinter is pinned in tools/hyperlint; run python3 manage.py lint after installing its locked
dependencies. Preserve reported policy; do not write baselines merely to make findings pass.
