#!/usr/bin/env python3
"""Opt-in live qualification for the pinned, standalone Serena read surface.

This creates two disposable Git worktrees and a disposable SERENA_HOME. It
never reads a host Serena configuration and fails if the server advertises a
tool outside the five reviewed semantic reads.
"""

from __future__ import annotations

import json
import os
import select
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

SERENA_COMMIT = "701e7c843f46c6a649203a488cece1bf19f1df90"
TOOLS = [
    "get_symbols_overview",
    "find_symbol",
    "find_referencing_symbols",
    "find_implementations",
    "find_declaration",
]


def git(directory: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(directory), *args], check=True, stdout=subprocess.DEVNULL)


def prepare_worktrees(root: Path) -> tuple[Path, Path]:
    repository = root / "repository"
    repository.mkdir()
    git(repository, "init", "-q", "-b", "main")
    git(repository, "config", "user.name", "fixture")
    git(repository, "config", "user.email", "fixture@example.invalid")
    (repository / "README.md").write_text("fixture\n", encoding="utf-8")
    git(repository, "add", "README.md")
    git(repository, "commit", "-qm", "initial")
    typescript, python = root / "typescript-worktree", root / "python-worktree"
    git(repository, "worktree", "add", "-q", "-b", "typescript", str(typescript), "main")
    git(repository, "worktree", "add", "-q", "-b", "python", str(python), "main")
    (typescript / "tsconfig.json").write_text('{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler"}}\n')
    (typescript / "a.ts").write_text("export function sharedSymbol(value: number) { return value + 1; }\n")
    (typescript / "b.ts").write_text("import { sharedSymbol } from './a';\nexport const result = sharedSymbol(1);\n")
    (python / "a.py").write_text("def shared_symbol(value: int) -> int:\n    return value + 1\n")
    (python / "b.py").write_text("from a import shared_symbol\nresult = shared_symbol(1)\n")
    return typescript, python


class McpProcess:
    def __init__(self, project: Path, home: Path):
        environment = {**os.environ, "SERENA_HOME": str(home)}
        command = [
            "uvx", "--from", f"git+https://github.com/oraios/serena.git@{SERENA_COMMIT}",
            "serena", "start-mcp-server", "--project", str(project), "--context", "codex",
            "--enable-web-dashboard", "false", "--open-web-dashboard", "false",
            "--enable-gui-log-window", "false", "--log-level", "ERROR",
        ]
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1, env=environment)
        self.identifier = 0
        self.request("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "anvil-candidate-fixture", "version": "1"}})
        self.send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    def send(self, payload: dict[str, Any]) -> None:
        assert self.process.stdin is not None
        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self.identifier += 1
        identifier = self.identifier
        self.send({"jsonrpc": "2.0", "id": identifier, "method": method, "params": params})
        assert self.process.stdout is not None
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            ready, _, _ = select.select([self.process.stdout], [], [], 0.25)
            if not ready:
                continue
            line = self.process.stdout.readline().strip()
            if line:
                response = json.loads(line)
                if response.get("id") == identifier:
                    return response
        raise RuntimeError(f"timed out waiting for {method}")

    def close(self) -> None:
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()


def tool_text(response: dict[str, Any]) -> str:
    if response.get("error") or response.get("result", {}).get("isError"):
        raise AssertionError(f"unexpected MCP error: {response}")
    return "\n".join(part.get("text", "") for part in response["result"]["content"])


def run_project(project: Path, source: str, symbol: str, reference: str, changed_line: str, changed_marker: str) -> None:
    home = Path(tempfile.mkdtemp(prefix="serena-readonly-home-"))
    try:
        (home / "serena_config.yml").write_text(
            "\n".join([
                "language_backend: LSP", "web_dashboard: false", "web_dashboard_open_on_launch: false", "gui_log_window: false",
                "base_modes: []", "default_modes: []", "fixed_tools:", *[f"  - {tool}" for tool in TOOLS],
                f'project_serena_folder_location: "{home}/project-cache/$projectFolderName"', "projects: []", "",
            ]), encoding="utf-8")
        for state in ("initial", "changed", "deleted"):
            server = McpProcess(project, home)
            try:
                listed = server.request("tools/list", {})
                names = [tool["name"] for tool in listed["result"]["tools"]]
                if names != TOOLS:
                    raise AssertionError(f"unexpected exposed tools: {names}")
                overview = tool_text(server.request("tools/call", {"name": "get_symbols_overview", "arguments": {"relative_path": source, "max_answer_chars": 2000}}))
                if symbol not in overview:
                    raise AssertionError(f"overview did not contain {symbol}: {overview}")
                refs = tool_text(server.request("tools/call", {"name": "find_referencing_symbols", "arguments": {"name_path": symbol, "relative_path": source, "max_answer_chars": 4000}}))
                if state == "deleted":
                    if reference in refs:
                        raise AssertionError(f"deleted reference still returned: {refs}")
                elif reference not in refs:
                    raise AssertionError(f"reference missing: {refs}")
                if state == "changed" and changed_marker not in refs:
                    raise AssertionError(f"changed reference missing: {refs}")
                rejected = server.request("tools/call", {"name": "activate_project", "arguments": {"project": "/outside"}})
                if "error" not in rejected and not rejected.get("result", {}).get("isError"):
                    raise AssertionError(f"excluded activation was accepted: {rejected}")
                escaped = server.request("tools/call", {"name": "get_symbols_overview", "arguments": {"relative_path": "../outside.py", "max_answer_chars": 2000}})
                if "error" not in escaped and not escaped.get("result", {}).get("isError"):
                    raise AssertionError(f"external path was accepted: {escaped}")
            finally:
                server.close()
            if state == "initial":
                target = project / reference
                existing = target.read_text(encoding="utf-8")
                target.write_text(existing + changed_line, encoding="utf-8")
            elif state == "changed":
                (project / reference).unlink()
    finally:
        shutil.rmtree(home)


def main() -> None:
    fixture = Path(tempfile.mkdtemp(prefix="serena-readonly-fixture-"))
    try:
        typescript, python = prepare_worktrees(fixture)
        run_project(typescript, "a.ts", "sharedSymbol", "b.ts", "\nexport const changed = sharedSymbol(2);\n", "changed")
        run_project(python, "a.py", "shared_symbol", "b.py", "\nchanged = shared_symbol(2)\n", "changed")
        print("Serena read-only integration passed for TypeScript and Python worktrees")
    finally:
        shutil.rmtree(fixture)


if __name__ == "__main__":
    main()
