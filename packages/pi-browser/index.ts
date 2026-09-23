import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import { getAgentDir, sessionEntryToContextMessages, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createBrowserClient, BrowserClientError, type BrowserRequest } from "./client.ts";

const CONFIG = "pi-browser.json";
const TOOLS = ["browser_capture", "browser_resolve", "browser_release", "browser_jev_resolve"] as const;
const TOOL_SET = new Set<string>(TOOLS);
const PREDICATES = new Set(["exists", "in_viewport", "occluded", "enabled"]);
const opaque = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const observation = (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value);
const entity = (value: unknown) => typeof value === "string" && /^e-[1-9][0-9]*$/.test(value);
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value: unknown, keys: string[]) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const text = (value: unknown, maximum: number) => typeof value === "string" && Buffer.byteLength(value, "utf8") > 0 && Buffer.byteLength(value, "utf8") <= maximum;
const strict = { additionalProperties: false };
type Client = ReturnType<typeof createBrowserClient>;
type ClientFactory = (options: Parameters<typeof createBrowserClient>[0]) => Client;
type State = { client: Client; session: string; pageIds: string[]; closed: boolean };

function config() {
  let value: unknown;
  try {
    const root = getAgentDir(), file = path.join(root, CONFIG), directory = lstatSync(root), metadata = lstatSync(file);
    if (!directory.isDirectory() || directory.isSymbolicLink() || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024 || (directory.mode & 0o022) !== 0 || (metadata.mode & 0o022) !== 0 || (typeof process.getuid === "function" && (directory.uid !== process.getuid() || metadata.uid !== process.getuid()))) throw new Error();
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch { throw new Error("pi-browser:config_required"); }
  if (!plain(value) || Object.keys(value).length !== 4 || !["browser_executable", "pages", "jev", "timeout_ms"].every((key) => Object.hasOwn(value, key))) throw new Error("pi-browser:config_invalid");
  return value as Parameters<typeof createBrowserClient>[0]["trustedConfig"];
}
function pageIds(config: Parameters<typeof createBrowserClient>[0]["trustedConfig"]): string[] {
  if (!Array.isArray(config.pages) || config.pages.length < 1 || config.pages.length > 2) throw new Error("pi-browser:config_invalid");
  const ids = config.pages.map((page) => plain(page) ? page.id : undefined);
  if (!ids.every(opaque) || new Set(ids).size !== ids.length) throw new Error("pi-browser:config_invalid");
  return ids;
}
function failure(code: string) { return { content: [{ type: "text", text: JSON.stringify({ schema: "browser-owner-adapter/v1", status: "refused", code }) }], isError: true }; }
function capture(input: unknown): BrowserRequest | null {
  if (!plain(input) || !opaque(input.page_id) || !exact(input, ["page_id", "request"])) return null;
  const item = input.request, keys = plain(item) && Object.hasOwn(item, "entity_offset") ? ["schema", "request_id", "target", "predicates", "scope", "require_unique", "entity_offset"] : ["schema", "request_id", "target", "predicates", "scope", "require_unique"];
  if (!exact(item, keys) || item.schema !== "widget-resolution/v1" || !text(item.request_id, 64) || !exact(item.target, ["description", "qualifiers"]) || !text(item.target.description, 512) || !Array.isArray(item.target.qualifiers) || item.target.qualifiers.length > 8 || !item.target.qualifiers.every((value) => text(value, 128)) || !Array.isArray(item.predicates) || item.predicates.length > 4 || !item.predicates.every((value) => typeof value === "string" && PREDICATES.has(value)) || new Set(item.predicates).size !== item.predicates.length || !exact(item.scope, ["kind", "root"]) || (item.scope.kind !== "document" && item.scope.kind !== "subtree") || typeof item.scope.root !== "string" || (item.scope.kind === "document" && item.scope.root !== "document") || (item.scope.kind === "subtree" && !/^[0-9a-f-]{36}:e-[1-9][0-9]*$/.test(item.scope.root)) || typeof item.require_unique !== "boolean" || (Object.hasOwn(item, "entity_offset") && (!Number.isInteger(item.entity_offset) || item.entity_offset < 0 || item.entity_offset > 2047)) || bytes(input) > 8 * 1024) return null;
  return { operation: "capture", page_id: input.page_id, request: item };
}
function request(operation: string, input: unknown): BrowserRequest | null {
  if (operation === "capture") return capture(input);
  if (operation === "resolve") return exact(input, ["observation_id", "entity_id"]) && observation(input.observation_id) && entity(input.entity_id) ? { operation, observation_id: input.observation_id, entity_id: input.entity_id } : null;
  return exact(input, ["observation_id"]) && observation(input.observation_id) ? { operation, observation_id: input.observation_id } : null;
}
function rawMedia(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(rawMedia);
  if (!plain(value)) return typeof value === "string" && /^data:image\//i.test(value);
  if (value.type === "image" || value.type === "image_url" || value.type === "input_image" || value.type === "media" || Object.hasOwn(value, "image_url") || Object.hasOwn(value, "inlineData") || Object.hasOwn(value, "inline_data")) return true;
  return Object.values(value).some(rawMedia);
}

const captureParameters = Type.Object({
  page_id: Type.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }),
  request: Type.Object({
    schema: Type.Literal("widget-resolution/v1"), request_id: Type.String({ minLength: 1, maxLength: 64 }),
    target: Type.Object({ description: Type.String({ minLength: 1, maxLength: 512 }), qualifiers: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 8 }) }, strict),
    predicates: Type.Array(Type.Union([Type.Literal("exists"), Type.Literal("in_viewport"), Type.Literal("occluded"), Type.Literal("enabled")]), { maxItems: 4, uniqueItems: true }),
    scope: Type.Object({ kind: Type.Union([Type.Literal("document"), Type.Literal("subtree")]), root: Type.String({ minLength: 1, maxLength: 64 }) }, strict),
    require_unique: Type.Boolean(), entity_offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 2047 })),
  }, strict),
}, strict);
const resolveParameters = Type.Object({ observation_id: Type.String({ minLength: 36, maxLength: 36, pattern: "^[0-9a-f-]+$" }), entity_id: Type.String({ minLength: 3, maxLength: 64, pattern: "^e-[1-9][0-9]*$" }) }, strict);
const observationParameters = Type.Object({ observation_id: Type.String({ minLength: 36, maxLength: 36, pattern: "^[0-9a-f-]+$" }) }, strict);

export function createBrowserExtension(pi: ExtensionAPI, createClient: ClientFactory = createBrowserClient): void {
  let state: State | null = null, closing: Promise<void> = Promise.resolve();
  const setBrowserTools = (enabled: boolean) => pi.setActiveTools([...pi.getActiveTools().filter((name) => !TOOL_SET.has(name)), ...(enabled ? TOOLS : [])]);
  const close = () => {
    const current = state; state = null;
    if (!current || current.closed) return closing;
    current.closed = true;
    closing = closing.catch(() => {}).then(async () => { await current.client.close().catch(() => {}); });
    return closing;
  };
  pi.registerFlag("browser", { description: "Enable bounded read-only browser observations for this fresh session", type: "boolean", default: false });
  pi.on("session_start", async (_event, ctx) => {
    const header = ctx.sessionManager.getHeader();
    if (pi.getFlag("browser") !== true) { setBrowserTools(false); await close(); return; }
    if (state && !state.closed && state.session === header?.id) { setBrowserTools(true); return; }
    setBrowserTools(false); await close();
    try {
      if (!opaque(header?.id) || ctx.sessionManager.getBranch().some((entry) => sessionEntryToContextMessages(entry).length > 0)) throw new Error();
      const trustedConfig = config();
      state = { client: createClient({ piSessionId: header.id, trustedConfig }), session: header.id, pageIds: pageIds(trustedConfig), closed: false };
      setBrowserTools(true);
    } catch { setBrowserTools(false); await close(); ctx.abort(); throw new Error("pi-browser:startup_failed"); }
  });
  pi.on("session_before_switch", async () => { await close(); });
  pi.on("session_before_fork", async (_event, ctx) => { if (state) { setBrowserTools(false); await close(); ctx.abort(); return { cancel: true }; } });
  pi.on("session_before_tree", async (_event, ctx) => { if (state) { setBrowserTools(false); await close(); ctx.abort(); return { cancel: true }; } });
  pi.on("session_shutdown", async () => { setBrowserTools(false); await close(); });
  pi.on("before_agent_start", (event) => {
    if (!state || state.closed) return;
    return { systemPrompt: `${event.systemPrompt}\n\nBrowser observations are read-only. Available page_id values: ${state.pageIds.join(", ")}. browser_capture requires a target intent and may return a partial, paged observation; treat a partial result as incomplete. Follow-up tools accept only opaque observation_id and entity_id values returned by capture.` };
  });
  for (const [name, operation, parameters] of [
    ["browser_capture", "capture", captureParameters], ["browser_resolve", "resolve", resolveParameters], ["browser_release", "release", observationParameters], ["browser_jev_resolve", "jev_resolve", observationParameters],
  ] as const) pi.registerTool({
    name, label: name,
    description: operation === "capture"
      ? "Capture a bounded read-only observation from a configured page_id. Specify target intent, predicates, scope, and optional entity_offset for paging; a partial capture is incomplete."
      : operation === "resolve"
        ? "Resolve an entity from a prior opaque browser_capture observation. Use only the observation_id and entity_id that capture returned."
        : operation === "release"
          ? "Release a prior opaque browser_capture observation when it is no longer needed."
          : "Ask the fixed Jev policy to resolve a prior opaque browser_capture observation; it cannot perform a browser action.",
    parameters,
    async execute(_id, input: unknown, signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) {
      const current = state, value = request(operation, input);
      if (!current || current.closed || !value) return failure("invalid_request");
      try {
        const result = await current.client.execute(value, signal ? { signal } : {});
        if (state !== current || ctx.sessionManager.getHeader()?.id !== current.session || bytes(result) > 16 * 1024 || rawMedia(result)) return failure("stale_or_unsafe");
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: undefined };
      } catch (error) { return failure(error instanceof BrowserClientError ? error.code : "owner_failed"); }
    },
  });
}
export default function (pi: ExtensionAPI): void { createBrowserExtension(pi); }
