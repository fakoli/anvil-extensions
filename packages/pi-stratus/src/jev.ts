// JEV advisory client (T009). JEV is strictly advisory-only: its verdict is
// attached to receipts as metadata, never as proof or action authority.
// `anvil jev bridge --json` is the boundary between engine evidence and JEV
// review: a stateless local bridge that reads one bounded JSON envelope from
// stdin and never loads or initializes an Anvil project.
//
// Envelope (verified against anvil's own validator):
//   { jev: JevConfig, allow_api: bool, allow_export: bool,
//     capability: string, input: unknown }
// Consent model: the selected input is only exported to the JEV provider when
// `allow_export` is explicitly true; `allow_api` explicitly permits API calls.

import { spawnSync } from "node:child_process";

export interface JevAssessment {
  advisory: true;
  schema: string;
  provider: string;
  model: string;
  capability: string;
  status: string;
  reason: string;
  requested: boolean;
  used: boolean;
  answers: Record<string, unknown>;
  elapsedMs: number;
}

export interface JevUnavailable {
  advisory: true;
  available: false;
  reason: string;
}

const ANVIL = process.env.STRATUS_ANVIL_PATH ?? "anvil";
const JEV_TIMEOUT_MS = 5_000;

export interface JevRequest {
  capability: "prd_review" | "evidence_triage";
  subject: string;
  payload: unknown;
  /** Explicit consent to export the selected payload to the JEV provider. Default false. */
  allowExport?: boolean;
  /** Explicit permission for API calls. Default true. */
  allowApi?: boolean;
}

const JEV_PAYLOAD_MAX_BYTES = 64_000;

/** Application-level payload bounding: the payload is serialized ONCE and
 *  measured in UTF-8 bytes. Oversized payloads are rejected structurally
 *  (never sliced — slicing serialized JSON corrupts it). Serialization
 *  failures (circular structures) are handled as advisory refusals. */
function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}
function boundPayload(payload: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  let text: string;
  try {
    text = JSON.stringify(payload ?? {});
  } catch (err) {
    return { ok: false, reason: `payload is not serializable: ${err instanceof Error ? err.message : String(err)}` };
  }
  const bytes = utf8Bytes(text);
  if (bytes > JEV_PAYLOAD_MAX_BYTES) {
    return { ok: false, reason: `payload exceeds the ${JEV_PAYLOAD_MAX_BYTES}-byte bound (${bytes} bytes)` };
  }
  return { ok: true, value: { bytes, json: JSON.parse(text) } };
}

/** Ask JEV for an advisory assessment. Never blocks the pipeline on failure. */
export function jevAssess(request: JevRequest): JevAssessment | JevUnavailable {
  const started = Date.now();
  // Bound the payload BEFORE serialization — oversized or unserializable
  // payloads are advisory refusals, never exceptions.
  const bound = boundPayload(request.payload);
  if (!bound.ok) {
    return { advisory: true, available: false, reason: bound.reason };
  }
  const envelope = {
    jev: {
      enabled: true,
      capabilities: ["prd_review", "evidence_triage"],
      model: "jev-1.13.0",
      timeout_seconds: 5,
      api_key_env: "TYPESAFE_API_KEY",
    },
    allow_api: request.allowApi !== false,
    allow_export: request.allowExport === true,
    capability: request.capability,
    input: { subject: request.subject, payload: bound.value },
  };
  const result = spawnSync(ANVIL, ["jev", "bridge", "--json"], {
    input: JSON.stringify(envelope),
    encoding: "utf8",
    timeout: JEV_TIMEOUT_MS,
  });
  const elapsedMs = Date.now() - started;
  if (result.error) {
    return { advisory: true, available: false, reason: String(result.error) };
  }
  if (result.status !== 0) {
    return { advisory: true, available: false, reason: `anvil jev bridge exited ${result.status}` };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      ok?: boolean;
      data?: {
        schema?: string;
        provider?: string;
        model?: string;
        capability?: string;
        status?: string;
        reason?: string;
        requested?: boolean;
        used?: boolean;
        answers?: Record<string, unknown>;
      };
      error?: { code?: string; message?: string };
    };
    if (!parsed.ok || !parsed.data) {
      return {
        advisory: true,
        available: false,
        reason: parsed.error?.message ?? "JEV bridge returned no data",
      };
    }
    const data = parsed.data;
    return {
      advisory: true,
      schema: data.schema ?? "unknown",
      provider: data.provider ?? "unknown",
      model: data.model ?? "unknown",
      capability: data.capability ?? request.capability,
      status: data.status ?? "unknown",
      reason: data.reason ?? "none",
      requested: data.requested === true,
      used: data.used === true,
      answers: data.answers ?? {},
      elapsedMs,
    };
  } catch {
    return { advisory: true, available: false, reason: "unparseable JEV response" };
  }
}

/** JEV status probe — advisory metadata only, never a gate. */
export function jevStatus(): { advisory: true; enabled: boolean; capabilities: readonly string[] } {
  const result = spawnSync(ANVIL, ["jev", "status", "--json"], { encoding: "utf8", timeout: JEV_TIMEOUT_MS });
  if (result.status !== 0) return { advisory: true, enabled: false, capabilities: [] };
  try {
    const parsed = JSON.parse(result.stdout) as { ok?: boolean; data?: { enabled?: boolean; capabilities?: string[] } };
    return {
      advisory: true,
      enabled: parsed.ok === true && (parsed.data?.enabled ?? false),
      capabilities: parsed.data?.capabilities ?? [],
    };
  } catch {
    return { advisory: true, enabled: false, capabilities: [] };
  }
}
