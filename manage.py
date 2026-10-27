#!/usr/bin/env python3
"""Single entrypoint: python3 manage.py build|check|lint. Run npm ci first."""
import argparse
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "check", "lint", "open"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    if args.command == "open":
        from urllib.parse import urlencode
        page = root / "dist/index.html"
        if not page.is_file():
            parser.exit(1, "Build the HTML first: python3 manage.py build\n")
        target = page.as_uri() + "?" + urlencode({"path": str(Path.cwd())})
        raise SystemExit(subprocess.call(["worminal", "--new-browser-tab", target]))
    if args.command == "lint" and not (root / "tools/hyperlint/node_modules/.bin/tsx").exists():
        parser.exit(1, "Initialize submodules, then run npm --prefix tools/hyperlint ci --include=dev.\n")
    if not (root / "node_modules").exists():
        parser.exit(1, "Dependencies missing: run npm ci in file-explorer, then retry.\n")
    environment = os.environ.copy()
    if args.command == "lint":
        temporary = root / ".checks/tmp"
        temporary.mkdir(parents=True, exist_ok=True)
        environment["TMPDIR"] = str(temporary)
    raise SystemExit(subprocess.call(["npm", "run", args.command], cwd=root, env=environment))


if __name__ == "__main__":
    main()
