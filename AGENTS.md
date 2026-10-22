# File explorer

Keep the explorer plain, dark, small, and local. The distributable is one offline HTML file,
with no runtime services or external assets. Use native HTML controls and text-safe DOM operations.

This npm workspace has a DOM app in apps/explorer and an authoritative file tree in packages/files.
The folder picker grants read access only; it omits empty directories. Native filesystem integration
belongs to the embedding host and is not implemented. Do not imply arbitrary path access.

Use python3 manage.py build or check after npm ci. Keep build outputs and dependencies untracked.
Hyperlinter is pinned in tools/hyperlint; run python3 manage.py lint after installing its locked
dependencies. Preserve reported policy; do not write baselines merely to make existing findings pass.
Current work: establish a standalone explorer artifact for future Worminal embedding.
