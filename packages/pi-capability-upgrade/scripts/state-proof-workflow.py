#!/usr/bin/env python3
"""Create canonical State command-proof artifacts from explicit CLI metadata.

This is deliberately an artifact generator, never a submitter. It obtains task,
project, and active-claim data solely from `anvil status --json` and `anvil show
TASK --json`, accepts an externally approved gate policy, and re-reads State
before writing artifacts.
"""
from __future__ import annotations

import argparse, base64, datetime as dt, hashlib, json, subprocess, sys, uuid
from pathlib import Path

MAX_OUTPUT = 131072

def cli(anvil: str, cwd: Path, state_layout: str, *args: str) -> dict:
    environment = {**__import__("os").environ, "ANVIL_STATE_LAYOUT": state_layout}
    result = subprocess.run([anvil, *args, "--json"], cwd=cwd, text=True, capture_output=True, env=environment)
    if result.returncode:
        raise RuntimeError(f"State CLI failed: {result.stderr.strip()}")
    value = json.loads(result.stdout)
    if value.get("ok") is not True: raise RuntimeError("State CLI returned failure")
    return value["data"]

def canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()

def utc() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")

def active_claim(show: dict, task: str, actor: str) -> dict:
    matches = [c for c in show.get("active_claims", []) if c.get("task_id") == task and c.get("claimed_by") == actor and c.get("status") == "active"]
    if len(matches) != 1: raise RuntimeError("exactly one active claim for task and actor is required")
    return matches[0]

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--anvil", required=True, help="explicit Anvil CLI path")
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--task", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--state-layout", choices=("local", "workspace"), required=True, help="explicit State layout; never inferred")
    parser.add_argument("--approved-gates", required=True, type=Path, help="external JSON policy, not discovered")
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    root = args.project.resolve(strict=True)
    policy = json.loads(args.approved_gates.read_text(encoding="utf-8"))
    if not isinstance(policy.get("gates"), list) or not policy["gates"]: raise RuntimeError("approved gate policy needs a nonempty gates list")
    status = cli(args.anvil, root, args.state_layout, "status")
    show = cli(args.anvil, root, args.state_layout, "show", args.task)
    task, claim = show["task"], active_claim(show, args.task, args.actor)
    required = {proof["command"] for proof in task["verification"].get("required_proofs", []) if proof.get("kind") == "command" and 0 in proof.get("passing_exit_codes", [])}
    gates = policy["gates"]
    if any(not isinstance(g.get("argv"), list) or not g["argv"] or not all(isinstance(item, str) and item for item in g["argv"]) for g in gates): raise RuntimeError("approved gates must provide nonempty argv arrays")
    commands = [" ".join(g["argv"]) for g in gates]
    if set(commands) != required: raise RuntimeError("approved gates must exactly equal passing task command-proof requirements")
    context = claim.get("attestation_context")
    if not isinstance(context, dict): raise RuntimeError("active claim lacks immutable attestation context")
    try:
        from anvil.claims.command_proof_artifact import claim_command_cwd_identity
    except ImportError as exc: raise RuntimeError("run this with the pinned Anvil Python environment") from exc
    cwd_identity = claim_command_cwd_identity(root, context["repository_id"], ".")
    results = []
    for gate, command in zip(gates, commands, strict=True):
        started = utc()
        run = subprocess.run(gate["argv"], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        ended = utc(); output = run.stdout
        if len(output) > MAX_OUTPUT: raise RuntimeError("gate output exceeds canonical proof limit")
        if run.returncode != 0: raise RuntimeError(f"gate failed: {command}")
        results.append((command, started, ended, output))
    # Fresh State read rejects a released/renewed/reassigned claim before output.
    fresh = cli(args.anvil, root, args.state_layout, "show", args.task)
    fresh_claim = active_claim(fresh, args.task, args.actor)
    for field in ("id", "generation", "lease_expires_at"):
        if fresh_claim.get(field) != claim.get(field): raise RuntimeError("claim changed during gate execution")
    if fresh["task"].get("verification") != task.get("verification") or fresh_claim.get("attestation_context") != context: raise RuntimeError("task or immutable claim context changed during gate execution")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for number, (command, started, ended, output) in enumerate(results, 1):
        core = {"schema_version":1,"project_id":status["project"]["id"],"claim_id":claim["id"],"generation":claim["generation"],"claimed_by":args.actor,"task_id":args.task,"task_revision":context["task_revision"],"prd_id":context["prd_id"],"prd_revision":context["prd_revision"],"repository_id":context["repository_id"],"claim_start_sha":context["claim_start_sha"],"cwd_relative":".","cwd_identity":cwd_identity,"command_base64":base64.b64encode(command.encode()).decode(),"started_at":started,"ended_at":ended,"exit_code":0,"output_base64":base64.b64encode(output).decode(),"output_sha256":hashlib.sha256(output).hexdigest()}
        artifact = {"envelope_id":f"pi-capability-{uuid.uuid4()}","payload":core}
        target = args.output_dir / f"claim-command-proof-{number}.json"
        target.write_bytes(canonical(artifact))
        print(target)

if __name__ == "__main__": main()
