#!/usr/bin/env python3
"""Run the canonical product installed by the bundle's dependency lock."""
from pathlib import Path
import sys

for parent in Path(__file__).resolve().parents:
    product = parent / "node_modules" / "repo-graph-agent"
    if (product / "repo_graph" / "cli.py").is_file():
        sys.path.insert(0, str(product))
        break
else:
    raise SystemExit("Repo Graph dependency is missing; reinstall the pinned Anvil bundle.")

from repo_graph.cli import main
raise SystemExit(main())
