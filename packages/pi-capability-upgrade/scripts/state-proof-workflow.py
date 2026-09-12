#!/usr/bin/env python3
"""Bounded verification artifacts and guarded submission through the State CLI.

The external manifest is evidence, never an acceptance database. State retains
claim ownership and human acceptance. Direct State calls can bypass this local
freshness guard; these unsigned proofs are claim-owner self-attestations.
"""
from __future__ import annotations
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import selectors
import shlex
import signal
import stat
import subprocess
import tempfile
import time
import uuid

MAX_OUTPUT = 128 * 1024
MAX_POLICY = 64 * 1024
MAX_MANIFEST = 256 * 1024
MAX_PROOF = 256 * 1024


def read_limited(path, maximum):
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > maximum:
        raise ValueError("evidence/configuration file exceeds its size limit or is not regular")
    with path.open("rb") as stream:
        value = stream.read(maximum + 1)
    if len(value) > maximum:
        raise ValueError("evidence/configuration file exceeds its size limit")
    return value


def gate_environment():
    allowed = {"HOME", "PATH", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "WINDIR", "LANG", "LC_ALL"}
    return {**{k: v for k, v in os.environ.items() if k in allowed}, "PYTHONDONTWRITEBYTECODE": "1"}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def utc():
    return dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")


def run(argv, cwd, *, timeout=30, env=None):
    """Only candidate-owned process groups are terminated; bound before buffering."""
    if not argv or any(not isinstance(v, str) or not v or "\0" in v for v in argv):
        raise ValueError("invalid command argv")
    proc = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, start_new_session=True)
    deadline = time.monotonic() + timeout
    output = bytearray()
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not selector.select(remaining):
                raise RuntimeError("command deadline exceeded")
            chunk = os.read(proc.stdout.fileno(), 4096)
            if not chunk:
                break
            if len(output) + len(chunk) > MAX_OUTPUT:
                raise RuntimeError("command output exceeded limit")
            output.extend(chunk)
        code = proc.wait(timeout=max(.01, deadline - time.monotonic()))
        if code:
            raise RuntimeError(f"command failed with exit {code}: {argv[0]}")
        return bytes(output)
    finally:
        selector.close()
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()
        proc.stdout.close()


def git(root, *args, env=None):
    return run(["git", "-c", "core.filemode=true", *args], root, env=env).decode().strip()


def content_identity(root):
    with tempfile.TemporaryDirectory(prefix="pi-proof-index-") as tmp:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(tmp) / "index"))
        git(root, "read-tree", "HEAD", env=env)
        git(root, "add", "-A", "--", env=env)
        return git(root, "write-tree", env=env)


def changed_paths(root):
    values = set()
    for argv in (["git", "diff", "--name-only", "--no-renames", "-z", "HEAD", "--"],
                 ["git", "ls-files", "--others", "--exclude-standard", "-z"]):
        values.update(x.decode("utf-8") for x in run(argv, root).split(b"\0") if x)
    if not 1 <= len(values) <= 64 or any("," in x for x in values):
        raise ValueError("submission requires 1–64 changed paths without commas (State CLI compatibility)")
    return sorted(values)


def cli(anvil, root, layout, *args):
    output = run([anvil, *args, "--json"], root,
                 env=dict(os.environ, ANVIL_STATE_LAYOUT=layout))
    value = json.loads(output)
    if value.get("ok") is not True:
        raise RuntimeError("State CLI returned failure")
    return value["data"]


def snapshot(anvil, root, layout, task_id, actor):
    status = cli(anvil, root, layout, "status")
    show = cli(anvil, root, layout, "show", task_id)
    claims = [c for c in show.get("active_claims", []) if c.get("task_id") == task_id
              and c.get("claimed_by") == actor and c.get("status") == "active"]
    if len(claims) != 1:
        raise RuntimeError("exactly one active claim for task and actor is required")
    claim = claims[0]
    if dt.datetime.fromisoformat(claim["lease_expires_at"].replace("Z", "+00:00")) <= dt.datetime.now(dt.UTC):
        raise RuntimeError("claim lease expired")
    context = claim.get("attestation_context")
    if not isinstance(context, dict):
        raise RuntimeError("claim lacks immutable attestation context")
    return {"project_id": status["project"]["id"], "task": show["task"],
            "claim": {k: claim[k] for k in ("id", "generation", "claimed_by", "task_id", "lease_expires_at", "attestation_context")}}


def approved_commands(policy, state):
    gates = policy.get("gates")
    if not isinstance(gates, list) or not 1 <= len(gates) <= 16:
        raise ValueError("approved policy requires 1–16 gates")
    required = [p["command"] for p in state["task"]["verification"].get("required_proofs", [])
                if p.get("kind") == "command" and 0 in p.get("passing_exit_codes", [])]
    result = []
    for gate in gates:
        argv = gate.get("argv")
        if not isinstance(argv, list) or not argv or any(not isinstance(v, str) or not v or "\0" in v for v in argv):
            raise ValueError("approved gate needs argv")
        matched = [command for command in required if shlex.split(command) == argv]
        if len(matched) != 1:
            raise ValueError("gate must exactly match a task-declared command argv")
        timeout = gate.get("timeout_seconds", 30)
        if type(timeout) is not int or not 1 <= timeout <= 300:
            raise ValueError("gate timeout must be 1–300 seconds")
        result.append((matched[0], argv, timeout))
    if len(set(c for c, _, _ in result)) != len(result) or set(c for c, _, _ in result) != set(required):
        raise ValueError("gates must cover all task command-proof requirements exactly once")
    return result


def outside(root, path):
    path = path.resolve()
    if path.is_relative_to(root):
        raise ValueError("approval policy and proof output must be outside the mutable project")
    return path


def verify_current(manifest, args, root, policy_bytes):
    if manifest.get("version") != "pi-state-command-evidence/v1":
        raise ValueError("unsupported evidence manifest")
    if manifest.get("policy_sha256") != digest(policy_bytes):
        raise RuntimeError("approved policy changed since verification")
    if manifest.get("root") != str(root) or manifest.get("actor") != args.actor or manifest.get("task_id") != args.task:
        raise RuntimeError("evidence belongs to a different project, actor or task")
    if manifest.get("head") != git(root, "rev-parse", "HEAD") or manifest.get("content") != content_identity(root):
        raise RuntimeError("project content changed since verification")
    current_state = snapshot(args.anvil, root, args.state_layout, args.task, args.actor)
    if manifest.get("commands") != [c for c, _, _ in approved_commands(json.loads(policy_bytes), current_state)]:
        raise RuntimeError("evidence commands differ from approved gates")
    if manifest.get("files") != changed_paths(root):
        raise RuntimeError("changed path set differs from verified evidence")
    if manifest.get("state") != current_state:
        raise RuntimeError("State task or claim changed since verification")
    entries = manifest.get("artifacts")
    if not isinstance(entries, list) or not 1 <= len(entries) <= 16:
        raise ValueError("missing command evidence")
    for entry in entries:
        name = entry.get("file", "")
        if not name or Path(name).name != name:
            raise ValueError("invalid evidence filename")
        if digest(read_limited(args.output_dir / name, MAX_PROOF)) != entry["sha256"]:
            raise RuntimeError("command evidence changed since verification")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--anvil", required=True)
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--task", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--state-layout", choices=("local", "workspace"), required=True)
    parser.add_argument("--approved-gates", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--submit-existing", action="store_true", help="check existing evidence freshness, then submit; never approve")
    args = parser.parse_args(argv)
    root = args.project.resolve(strict=True)
    if Path(git(root, "rev-parse", "--show-toplevel")).resolve() != root:
        raise ValueError("project must be the Git working-tree root")
    policy_path = outside(root, args.approved_gates)
    args.output_dir = outside(root, args.output_dir)
    policy_bytes = read_limited(policy_path, MAX_POLICY)
    manifest_path = args.output_dir / "verification.json"
    if args.submit_existing:
        manifest = json.loads(read_limited(manifest_path, MAX_MANIFEST))
        verify_current(manifest, args, root, policy_bytes)
        submit = ["submit", args.task, "--actor", args.actor]
        for command in manifest["commands"]:
            submit.append("--commands=" + command)
        for path in manifest["files"]:
            submit.append("--files-changed=" + path)
        for entry in manifest["artifacts"]:
            submit.extend(["--command-proof-file", str(args.output_dir / entry["file"])])
        print(json.dumps(cli(args.anvil, root, args.state_layout, *submit)))
        return
    if manifest_path.exists():
        raise ValueError("output already has evidence; select a fresh output directory")
    before = snapshot(args.anvil, root, args.state_layout, args.task, args.actor)
    commands = approved_commands(json.loads(policy_bytes), before)
    head, content = git(root, "rev-parse", "HEAD"), content_identity(root)
    from anvil.claims.command_proof_artifact import claim_command_cwd_identity, load_claim_command_proof
    claim = before["claim"]; context = claim["attestation_context"]
    cwd_id = claim_command_cwd_identity(root, context["repository_id"], ".")
    artifacts = []
    for command, argv, timeout in commands:
        started = utc(); output = run(argv, root, timeout=timeout, env=gate_environment()); ended = utc()
        core = {"schema_version": 1, "project_id": before["project_id"], "claim_id": claim["id"],
                "generation": claim["generation"], "claimed_by": args.actor, "task_id": args.task,
                "task_revision": context["task_revision"], "prd_id": context["prd_id"],
                "prd_revision": context["prd_revision"], "repository_id": context["repository_id"],
                "claim_start_sha": context["claim_start_sha"], "cwd_relative": ".", "cwd_identity": cwd_id,
                "command_base64": base64.b64encode(command.encode()).decode(), "started_at": started,
                "ended_at": ended, "exit_code": 0, "output_base64": base64.b64encode(output).decode(),
                "output_sha256": digest(output)}
        artifact = canonical({"envelope_id": f"pi-capability-{uuid.uuid4()}", "payload": core})
        load_claim_command_proof(artifact)
        artifacts.append(artifact)
    if head != git(root, "rev-parse", "HEAD") or content != content_identity(root):
        raise RuntimeError("project content changed during verification")
    if policy_bytes != read_limited(policy_path, MAX_POLICY):
        raise RuntimeError("approved policy changed during verification")
    if before != snapshot(args.anvil, root, args.state_layout, args.task, args.actor):
        raise RuntimeError("State changed during verification")
    args.output_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
    entries = []
    for number, artifact in enumerate(artifacts, 1):
        name = f"claim-command-proof-{number}.json"
        target = args.output_dir / name
        with target.open("xb") as stream:
            stream.write(artifact)
        target.chmod(0o600)
        entries.append({"file": name, "sha256": digest(artifact)})
    manifest = {"version": "pi-state-command-evidence/v1", "root": str(root), "actor": args.actor,
                "task_id": args.task, "policy_sha256": digest(policy_bytes), "head": head,
                "content": content, "state": before, "commands": [c for c, _, _ in commands], "files": changed_paths(root), "artifacts": entries}
    manifest_path.write_bytes(canonical(manifest)); manifest_path.chmod(0o600)
    print(json.dumps({"verified": True, "manifest": str(manifest_path), "submitted": False}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        raise SystemExit(f"State verification refused: {exc}") from exc
