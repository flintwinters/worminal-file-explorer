# File explorer

Keep the explorer plain, dark, small, and local. The distributable is one offline HTML file,
with no runtime services or external assets. Use native HTML controls and text-safe DOM operations.

This npm workspace has a DOM app in apps/explorer and an authoritative file tree in packages/files.
The folder picker grants read access only; it omits empty directories. Native filesystem integration
belongs to the embedding host: worminal pages use its read-only list/read endpoints and initial path.
Open folder uses an in-page path field when embedded; standalone HTML retains the picker.

Use python3 manage.py build or check after npm ci. Keep build outputs and dependencies untracked.
Hyperlinter is pinned in tools/hyperlint; run python3 manage.py lint after installing its locked
dependencies. Preserve reported policy; do not write baselines merely to make existing findings pass.
Current work: preserve the standalone artifact and embedded directory navigation.
