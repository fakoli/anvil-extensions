import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

export type GateResult = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  outputIdentity: string;
};

export type GateSpec = {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
};

export type VerificationReceipt = {
  version: "verification-receipt/v2";
  repository: string;
  taskId: string;
  claimId: string;
  baseline: string;
  contentIdentity: string;
  policyIdentity: string;
  gateIdentity: string;
  gateResultsIdentity: string;
  gates: GateResult[];
  createdAt: string;
};

type RunVerifiedGatesInput = {
  root: string;
  taskId: string;
  claimId: string;
  policyPath: string;
  trustedPolicyIdentity: string;
  approvedGates: GateSpec[];
  gates: GateSpec[];
  signal?: AbortSignal;
};

type ValidateReceiptInput = {
  root: string;
  taskId: string;
  claimId: string;
  baseline: string;
  policyPath: string;
  trustedPolicyIdentity: string;
  approvedGates: GateSpec[];
};

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_GATE_OUTPUT_BYTES = 256 * 1024;
const MAX_GATE_TIMEOUT_MS = 5 * 60 * 1000;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${name} must be a bounded identifier`);
  }
}

function requireIdentity(value: string, name: string): void {
  if (!SHA256.test(value)) {
    throw new Error(`${name} must be a sha256 identity`);
  }
}

function canonicalInstant(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return undefined;
  return milliseconds;
}

function git(root: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  // Force mode tracking: repository-local core.filemode may be false, but a mode
  // change is content for a verification receipt. The checkout is an explicit,
  // trusted input; Git filters configured by that checkout can execute here.
  const result = spawnSync("git", ["-C", root, "-c", "core.filemode=true", ...args], {
    encoding: "utf8",
    env,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function repositoryRoot(root: string): string {
  return realpathSync(resolve(root));
}

function requirePathWithin(root: string, candidate: string): string {
  const rootPath = repositoryRoot(root);
  const actualPath = realpathSync(isAbsolute(candidate) ? candidate : resolve(rootPath, candidate));
  const pathRelative = relative(rootPath, actualPath);
  if (pathRelative === "" || pathRelative === ".." || pathRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(pathRelative)) {
    throw new Error("policy path escapes the repository");
  }
  return actualPath;
}

export function baselineIdentity(root: string): string {
  return git(repositoryRoot(root), ["rev-parse", "HEAD"]);
}

export function candidateContentIdentity(root: string): string {
  const repository = repositoryRoot(root);
  const indexDirectory = mkdtempSync(resolve(tmpdir(), "pi-capability-index-"));
  const temporaryIndex = resolve(indexDirectory, "index");
  try {
    // Use a temporary index, so a receipt never mutates the caller's staging area.
    const env = { ...process.env, GIT_INDEX_FILE: temporaryIndex };
    git(repository, ["read-tree", "HEAD"], env);
    git(repository, ["add", "-A", "--"], env);
    return git(repository, ["write-tree"], env);
  } finally {
    rmSync(indexDirectory, { recursive: true, force: true });
  }
}

export function policyIdentity(root: string, policyPath: string): string {
  return sha256(readFileSync(requirePathWithin(root, policyPath)));
}

function normalizedGate(gate: GateSpec, root: string): Required<GateSpec> {
  if (!gate || typeof gate.command !== "string" || gate.command.length === 0 || gate.command.length > 256) {
    throw new Error("gate command must be a bounded non-empty string");
  }
  const args = gate.args ?? [];
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string" || arg.length > 4096)) {
    throw new Error("gate arguments must be bounded strings");
  }
  const cwd = realpathSync(resolve(root, gate.cwd ?? root));
  const rootRelative = relative(root, cwd);
  if (rootRelative === ".." || rootRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rootRelative)) {
    throw new Error("gate working directory escapes the repository");
  }
  const timeoutMs = gate.timeoutMs ?? MAX_GATE_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_GATE_TIMEOUT_MS) {
    throw new Error("gate timeout must be between 1 and 300000 milliseconds");
  }
  return { command: gate.command, args, cwd, timeoutMs };
}

/** Identity of the exact argv/cwd/timeout gate list approved outside the checkout. */
export function gateIdentity(root: string, gates: GateSpec[]): string {
  if (!Array.isArray(gates) || gates.length === 0 || gates.length > 32) {
    throw new Error("at least one and at most 32 gates are required");
  }
  return sha256(JSON.stringify(gates.map((gate) => normalizedGate(gate, repositoryRoot(root)))));
}

function makeReceipt(input: Omit<VerificationReceipt, "version" | "repository" | "createdAt"> & { root: string }): VerificationReceipt {
  return {
    version: "verification-receipt/v2",
    repository: basename(repositoryRoot(input.root)),
    taskId: input.taskId,
    claimId: input.claimId,
    baseline: input.baseline,
    contentIdentity: input.contentIdentity,
    policyIdentity: input.policyIdentity,
    gateIdentity: input.gateIdentity,
    gateResultsIdentity: input.gateResultsIdentity,
    gates: input.gates,
    createdAt: new Date().toISOString(),
  };
}

async function runGate(gate: Required<GateSpec>, signal?: AbortSignal): Promise<GateResult> {
  if (signal?.aborted) {
    throw new Error("gate cancelled before start");
  }

  const startedAt = new Date().toISOString();
  return new Promise((resolveGate, rejectGate) => {
    const child = spawn(gate.command, gate.args, {
      cwd: gate.cwd,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = createHash("sha256");
    let outputBytes = 0;
    let stopReason: string | undefined;
    let settled = false;
    let escalation: NodeJS.Timeout | undefined;
    const stop = (reason: string) => {
      if (stopReason) return;
      stopReason = reason;
      if (child.pid && process.platform !== "win32") {
        try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
      } else child.kill("SIGTERM");
      escalation = setTimeout(() => {
        if (child.pid && process.platform !== "win32") {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        } else child.kill("SIGKILL");
      }, 2_000);
    };
    const deadline = setTimeout(() => stop("gate timed out"), gate.timeoutMs);
    const cancel = () => stop("gate cancelled");
    signal?.addEventListener("abort", cancel, { once: true });
    const consume = (chunk: Buffer | string) => {
      const bytes = Buffer.from(chunk);
      output.update(bytes);
      outputBytes += bytes.length;
      if (outputBytes > MAX_GATE_OUTPUT_BYTES) stop("gate output exceeded 262144 bytes");
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); if (escalation) clearTimeout(escalation);
      signal?.removeEventListener("abort", cancel);
      rejectGate(error);
    });
    child.once("close", (code, closeSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); if (escalation) clearTimeout(escalation);
      signal?.removeEventListener("abort", cancel);
      if (stopReason || closeSignal) {
        rejectGate(new Error(stopReason ?? "gate cancelled"));
        return;
      }
      resolveGate({
        command: gate.command,
        args: gate.args,
        cwd: gate.cwd,
        timeoutMs: gate.timeoutMs,
        exitCode: code ?? 128,
        startedAt,
        finishedAt: new Date().toISOString(),
        outputIdentity: output.digest("hex"),
      });
    });
  });
}

/**
 * Runs declared verification gates while protecting a before/after repository
 * snapshot. trustedPolicyIdentity is supplied by an approved operator record
 * outside the mutable checkout; this function never treats a gate's own policy
 * input as approval.
 */
export async function runVerifiedGates(input: RunVerifiedGatesInput): Promise<VerificationReceipt> {
  requireIdentifier(input.taskId, "taskId");
  requireIdentifier(input.claimId, "claimId");
  requireIdentity(input.trustedPolicyIdentity, "trustedPolicyIdentity");
  const root = repositoryRoot(input.root);
  const approvedGateIdentity = gateIdentity(root, input.approvedGates);
  const requestedGateIdentity = gateIdentity(root, input.gates);
  if (requestedGateIdentity !== approvedGateIdentity) {
    throw new Error("requested gates do not match the externally approved gate policy");
  }
  const before = {
    baseline: baselineIdentity(root),
    contentIdentity: candidateContentIdentity(root),
    policyIdentity: policyIdentity(root, input.policyPath),
  };
  if (before.policyIdentity !== input.trustedPolicyIdentity) {
    throw new Error("policy identity does not match the externally trusted policy identity");
  }

  const gates: GateResult[] = [];
  for (const gate of input.gates) {
    const result = await runGate(normalizedGate(gate, root), input.signal);
    if (result.exitCode !== 0) {
      throw new Error(`gate failed: ${gate.command} exited ${result.exitCode}`);
    }
    gates.push(result);
  }

  const after = {
    baseline: baselineIdentity(root),
    contentIdentity: candidateContentIdentity(root),
    policyIdentity: policyIdentity(root, input.policyPath),
  };
  if (after.baseline !== before.baseline) {
    throw new Error("baseline changed during verification");
  }
  if (after.contentIdentity !== before.contentIdentity) {
    throw new Error("candidate content changed during verification");
  }
  if (after.policyIdentity !== before.policyIdentity) {
    throw new Error("policy changed during verification");
  }

  return makeReceipt({ root, taskId: input.taskId, claimId: input.claimId, ...before, gateIdentity: approvedGateIdentity, gateResultsIdentity: sha256(JSON.stringify(gates)), gates });
}

/** Validates a receipt against the caller's expected task, claim, baseline and independently pinned policy. */
export function validateReceipt(receipt: unknown, input: ValidateReceiptInput): { ok: boolean; reason?: string } {
  try {
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      return { ok: false, reason: "receipt must be an object" };
    }
    const candidate = receipt as Partial<VerificationReceipt>;
    if (candidate.version !== "verification-receipt/v2" || !Array.isArray(candidate.gates) || candidate.gates.length === 0) {
      return { ok: false, reason: "unsupported or malformed receipt" };
    }
    for (const field of ["taskId", "claimId", "baseline", "contentIdentity", "policyIdentity", "gateIdentity", "gateResultsIdentity", "repository", "createdAt"] as const) {
      if (typeof candidate[field] !== "string") {
        return { ok: false, reason: `receipt ${field} is malformed` };
      }
    }
    const createdAt = canonicalInstant(candidate.createdAt);
    if (createdAt === undefined || candidate.gates.some((gate) => {
      const startedAt = gate && canonicalInstant(gate.startedAt);
      const finishedAt = gate && canonicalInstant(gate.finishedAt);
      return !gate || typeof gate.command !== "string" || !Array.isArray(gate.args) || typeof gate.cwd !== "string" || !Number.isInteger(gate.timeoutMs) || typeof gate.exitCode !== "number" || gate.exitCode !== 0 || startedAt === undefined || finishedAt === undefined || startedAt > finishedAt || finishedAt > createdAt || typeof gate.outputIdentity !== "string" || !SHA256.test(gate.outputIdentity);
    })) {
      return { ok: false, reason: "receipt gates are malformed or unsuccessful" };
    }
    requireIdentifier(input.taskId, "taskId");
    requireIdentifier(input.claimId, "claimId");
    requireIdentity(input.trustedPolicyIdentity, "trustedPolicyIdentity");
    const approvedGateIdentity = gateIdentity(input.root, input.approvedGates);
    const approvedGates = input.approvedGates.map((gate) => normalizedGate(gate, repositoryRoot(input.root)));
    if (candidate.taskId !== input.taskId || candidate.claimId !== input.claimId || candidate.baseline !== input.baseline) {
      return { ok: false, reason: "receipt task, claim, or baseline does not match the expected verification" };
    }
    if (candidate.policyIdentity !== input.trustedPolicyIdentity || policyIdentity(input.root, input.policyPath) !== input.trustedPolicyIdentity) {
      return { ok: false, reason: "receipt policy identity does not match the trusted policy" };
    }
    if (candidate.gateIdentity !== approvedGateIdentity) {
      return { ok: false, reason: "receipt gates do not match the approved gate policy" };
    }
    if (candidate.repository !== basename(repositoryRoot(input.root)) || candidate.gates.length !== approvedGates.length || candidate.gates.some((gate, index) => {
      const approved = approvedGates[index];
      return gate.command !== approved.command || gate.cwd !== approved.cwd || gate.timeoutMs !== approved.timeoutMs || JSON.stringify(gate.args) !== JSON.stringify(approved.args);
    })) {
      return { ok: false, reason: "receipt gate results do not match the approved gate specification" };
    }
    if (candidate.gateResultsIdentity !== sha256(JSON.stringify(candidate.gates))) {
      return { ok: false, reason: "receipt gate results were modified" };
    }
    if (baselineIdentity(input.root) !== input.baseline) {
      return { ok: false, reason: "repository baseline changed" };
    }
    if (candidateContentIdentity(input.root) !== candidate.contentIdentity) {
      return { ok: false, reason: "candidate content changed" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "receipt validation failed" };
  }
}
