import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { normalizeImage, ImageError } from "./src/images.ts";
import { Type } from "typebox";
import { getAgentDir, sessionEntryToContextMessages, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createObservationOwner, reopenObservationOwner } from "@anvil-serving/observations/owner";
import { createVisionInspector, VisionError } from "./src/vision.ts";

const MARKER = "pi-observations-marker/v1";
const BLOCKED = "pi-observations-blocked/v1";
const CONFIG = "pi-observations.json";
const bytes = (value: string) => Buffer.byteLength(value, "utf8");
const opaque = (value: unknown) => typeof value === "string" && bytes(value) > 0 && bytes(value) <= 64 && /^[A-Za-z0-9._:-]+$/.test(value);
const identity = (prefix: string, value: string) => `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 48)}`;

type Config = { provider: string; model: string; profile?: string };
type State = { owner: any; enabled: boolean; blocked?: boolean; marker?: Marker; controller: AbortController };
type Marker = { schema: typeof MARKER; session: string; authority: string; model: string; profile: string };

function fail(ctx: ExtensionContext, code: string): never { ctx.abort(); throw new Error(`pi-observations:${code}`); }
function config(): Config {
  let value: unknown;
  try {
    const root = getAgentDir(), rootMetadata = lstatSync(root), file = path.join(root, CONFIG), metadata = lstatSync(file);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || (rootMetadata.mode & 0o022) !== 0 || (typeof process.getuid === "function" && (rootMetadata.uid !== process.getuid() || metadata.uid !== process.getuid())) || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024 || (metadata.mode & 0o022) !== 0) throw new Error();
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch { throw new Error("pi-observations:config_required"); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some((key) => key !== "provider" && key !== "model" && key !== "profile")) throw new Error("pi-observations:config_invalid");
  const item = value as Config;
  if (!opaque(item.provider) || !opaque(item.model) || (item.profile !== undefined && !opaque(item.profile))) throw new Error("pi-observations:config_invalid");
  return item;
}
function marker(entry: any): Marker | null {
  const value = entry?.type === "custom" && entry.customType === MARKER ? entry.data : null;
  return value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 5 && ["schema", "session", "authority", "model", "profile"].every((key) => key in value) && (value as Marker).schema === MARKER && opaque((value as Marker).session) && opaque((value as Marker).authority) && opaque((value as Marker).model) && opaque((value as Marker).profile) ? value as Marker : null;
}
function noMedia(value: unknown): boolean {
  const pending: unknown[] = [value], seen = new WeakSet<object>();
  let inspected = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") { if (/data:image\//i.test(current)) return false; continue; }
    if (!current || typeof current !== "object") continue;
    if (++inspected > 8192 || seen.has(current)) return false;
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (record.type === "image" || record.type === "image_url" || record.type === "input_image" || record.type === "media" || (typeof record.mimeType === "string" && record.mimeType.toLowerCase().startsWith("image/")) || (typeof record.mime_type === "string" && record.mime_type.toLowerCase().startsWith("image/")) || "image_url" in record || "inlineData" in record || "inline_data" in record) return false;
    pending.push(...Object.values(record));
  }
  return true;
}
function ownerDirectory(session: string): string {
  const root = getAgentDir(), parent = path.join(root, "pi-observations"), directory = path.join(parent, session);
  const rootMetadata = lstatSync(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || (statSync(root).mode & 0o022) !== 0 || (typeof process.getuid === "function" && rootMetadata.uid !== process.getuid())) throw new Error("pi-observations:state_directory");
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentMetadata = lstatSync(parent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() || (statSync(parent).mode & 0o077) !== 0 || (typeof process.getuid === "function" && parentMetadata.uid !== process.getuid())) throw new Error("pi-observations:state_directory");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryMetadata = lstatSync(directory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink() || (statSync(directory).mode & 0o077) !== 0 || (typeof process.getuid === "function" && directoryMetadata.uid !== process.getuid())) throw new Error("pi-observations:state_directory");
  return directory;
}
function imageProjection(ctx: ExtensionContext, messages: any[]): Map<number, string> {
  const source = ctx.sessionManager.buildContextEntries() as any[];
  if (source.some((entry) => entry?.type === "compaction" || entry?.type === "branch_summary")) throw new Error("unsupported_history");
  const hasImage = (message: any) => Array.isArray(message?.content) && message.content.some((part: any) => part?.type === "image");
  const projected = source.flatMap((entry) => sessionEntryToContextMessages(entry as any).map((message) => ({ entryId: entry.id, message }))).filter((item) => hasImage(item.message));
  const matched = new Map<number, string>();
  let previous = -1;
  for (const [index, message] of messages.entries()) {
    if (!hasImage(message)) continue;
    // Text-only transforms are independent; image-bearing messages keep their exact question and provenance.
    const candidates = projected.map((item, position) => ({ ...item, position })).filter((item) => isDeepStrictEqual(item.message, message));
    if (candidates.length !== 1 || candidates[0].position <= previous || !opaque(candidates[0].entryId)) throw new Error("image_source_mismatch");
    previous = candidates[0].position;
    matched.set(index, candidates[0].entryId);
  }
  if (matched.size !== projected.length) throw new Error("image_source_mismatch");
  return matched;
}

export default function (pi: ExtensionAPI): void {
  let state: State | null = null;
  pi.registerFlag("observation", { description: "Enable bounded local image observations for this fresh session", type: "boolean", default: false });
  const setInspectionTool = (active: boolean) => {
    const tools = pi.getActiveTools().filter((name) => name !== "observation_inspect");
    pi.setActiveTools(active ? [...tools, "observation_inspect"] : tools);
  };

  function close(): Promise<void> { const current = state; state = null; current?.controller.abort(); return current?.owner?.close?.() ?? Promise.resolve(); }
  function ready(ctx: ExtensionContext): State { if (!state?.enabled || state.blocked) return fail(ctx, "disabled"); return state; }

  pi.on("session_start", async (event, ctx) => {
    let header: any, blocked = false;
    try {
      await close();
      header = ctx.sessionManager.getHeader();
      if (!opaque(header?.id)) return fail(ctx, "unsupported_history");
      const entries = ctx.sessionManager.getEntries() as any[];
      const flagged = pi.getFlag("observation") === true;
      blocked = entries.some((entry) => entry?.type === "custom" && entry.customType === BLOCKED);
      if (blocked) return fail(ctx, "startup_failed");
      const rawMarkers = entries.filter((entry) => entry?.type === "custom" && entry.customType === MARKER);
      if (!flagged && rawMarkers.length === 0) { setInspectionTool(false); return; }
      const settings = config();
      const authority = identity("authority", `pi-observations/v1:${header.id}`);
      const modelId = identity("model", `${settings.provider}/${settings.model}`);
      const profileId = settings.profile ? identity("profile", settings.profile) : identity("profile", `${settings.provider}/${settings.model}`);
      const found = entries.map(marker).filter(Boolean) as Marker[];
      const expected = (candidate: Marker) => candidate.session === header.id && candidate.authority === authority && candidate.model === modelId && candidate.profile === profileId;
      if (found.length > 1 || found.some((candidate) => !expected(candidate))) return fail(ctx, "unsupported_history");
      let active = found[0];
      if (rawMarkers.length !== found.length) return fail(ctx, "unsupported_history");
      if (!active) {
        const branch = ctx.sessionManager.getBranch() as any[];
        if (!flagged || (event.reason !== "startup" && event.reason !== "new") || branch.some((entry: any) => sessionEntryToContextMessages(entry as any).length > 0)) return fail(ctx, "unsupported_history");
        active = { schema: MARKER, session: header.id, authority, model: modelId, profile: profileId };
        pi.appendEntry(MARKER, active);
        const persisted = (ctx.sessionManager.getEntries() as any[]).map(marker).filter(Boolean) as Marker[];
        if (persisted.length !== 1 || JSON.stringify(persisted[0]) !== JSON.stringify(active)) return fail(ctx, "unsupported_history");
      }
      const model = ctx.modelRegistry.find(settings.provider, settings.model);
      if (!model || model.provider !== settings.provider || model.id !== settings.model || !model.input.includes("image")) return fail(ctx, "endpoint_unavailable");
      const directory = ownerDirectory(identity("session", header.id));
      const owner = found.length === 0
        ? createObservationOwner({ stateDirectory: directory, authorityId: authority, sessionId: header.id, modelId, profileId, inspector: createVisionInspector(ctx.modelRegistry, settings), priorSession: false })
        : reopenObservationOwner({ stateDirectory: directory, authorityId: authority, sessionId: header.id, modelId, profileId, inspector: createVisionInspector(ctx.modelRegistry, settings), priorSession: true });
      state = { owner, enabled: true, marker: active, controller: new AbortController() };
      setInspectionTool(true);
    } catch {
      state = { owner: null, enabled: true, blocked: true, controller: new AbortController() };
      setInspectionTool(false);
      if (!blocked && opaque(header?.id)) pi.appendEntry(BLOCKED, { session: header.id });
      fail(ctx, "startup_failed");
    }
  });

  pi.on("session_before_compact", (_event, ctx) => { if (state?.enabled) { ctx.abort(); return { cancel: true }; } });
  pi.on("session_before_fork", (_event, ctx) => { if (state?.enabled) { ctx.abort(); return { cancel: true }; } });
  pi.on("session_before_tree", (_event, ctx) => { if (state?.enabled) { ctx.abort(); return { cancel: true }; } });
  pi.on("session_shutdown", async () => { await close(); });

  pi.on("context", async (event, ctx) => {
    if (!state?.enabled) return;
    try {
      const current = ready(ctx);
      const projection = imageProjection(ctx, event.messages as any[]);
      const signal = AbortSignal.any([current.controller.signal, ctx.signal].filter((candidate): candidate is AbortSignal => candidate !== undefined));
      const next: any[] = [];
      for (const [index, message] of event.messages.entries()) {
        if (!Array.isArray(message.content)) { next.push(message); continue; }
        const parts: any[] = [];
        const images = message.content.map((part: any, partIndex: number) => ({ part, partIndex })).filter(({ part }: any) => part?.type === "image");
        const text = message.content.filter((part: any) => part?.type === "text" && typeof part.text === "string").map((part: any) => part.text).join("\n");
        for (const [partIndex, part] of message.content.entries()) {
          if (part?.type !== "image") { parts.push(part); continue; }
          let image;
          try { image = await normalizeImage({ mimeType: part.mimeType, data: part.data }, signal); }
          catch (error) {
            if (!(error instanceof ImageError)) throw error;
            parts.push({ type: "text", text: JSON.stringify({ schema: "observation-input-error/v1", error: error.code, message: error.message }) });
            continue;
          }
          const bound = current.owner.bind({ entryId: projection.get(index), imagePart: partIndex, image: { mimeType: image.mimeType, data: image.data } });
          if (image.notice) parts.push({ type: "text", text: image.notice });
          let envelope = bound;
          if (message.role === "user" && images.length === 1 && text && bytes(text) <= 512 && bound.status === "question_required") envelope = await current.owner.inspect({ observationId: bound.observation_id, question: text }, { signal });
          parts.push({ type: "text", text: JSON.stringify(envelope) });
        }
        next.push({ ...message, content: parts });
      }
      if (!noMedia(next)) return fail(ctx, "media_guard");
      return { messages: next };
    } catch (error) {
      if (error instanceof Error && error.message === "unsupported_history") return fail(ctx, "unsupported_history: compacted or branched image history cannot be mediated");
      if (error instanceof Error && error.message === "image_source_mismatch") return fail(ctx, "image_source_mismatch: an image message was altered, duplicated or cannot be matched to its saved source");
      return fail(ctx, "context_failed: image context could not be prepared safely");
    }
  });

  pi.on("before_provider_request", (event, ctx) => { try { if (state?.enabled && !noMedia(event.payload)) fail(ctx, "media_guard"); } catch { fail(ctx, "media_guard"); } });

  pi.registerTool({
    name: "observation_inspect",
    description: "Inspect one retained image reference with a specific question.",
    parameters: Type.Object({ observation_id: Type.String(), question: Type.String(), follow_up: Type.Optional(Type.Boolean()) }),
    async execute(_id, input: any, signal, _update, ctx) {
      try {
        const current = ready(ctx);
        const combined = AbortSignal.any([signal, ctx.signal, current.controller.signal].filter((candidate): candidate is AbortSignal => candidate !== undefined));
        const result = await current.owner.inspect({ observationId: input.observation_id, question: input.question }, { signal: combined, followUp: input.follow_up === true });
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: undefined };
      } catch (error) {
        if (error instanceof VisionError) return { content: [{ type: "text", text: JSON.stringify({ error: error.code }) }], isError: true };
        return fail(ctx, "inspection_failed");
      }
    },
  });
}
