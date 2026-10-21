#!/usr/bin/env python3
"""Single entrypoint: python3 manage.py build|check. Run npm ci first."""
import argparse
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "check"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    if not (root / "node_modules").exists():
        parser.exit(1, "Dependencies missing: run npm ci in file-explorer, then retry.\n")
    raise SystemExit(subprocess.call(["npm", "run", args.command], cwd=root))


if __name__ == "__main__":
    main()
