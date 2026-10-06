#!/usr/bin/env python3
"""Preserve the map-only entrypoint and caller working directory."""
from pathlib import Path
import runpy
import sys

sys.argv.insert(1, "map")
runpy.run_path(str(Path(__file__).with_name("repo_graph.py")), run_name="__main__")
