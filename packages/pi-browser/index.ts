import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import { getAgentDir, sessionEntryToContextMessages, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createBrowserClient, BrowserClientError, type BrowserRequest } from "./client.ts";

const CONFIG = "pi-browser.json";
const opaque = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value: unknown, keys: string[]) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
type State = { client: ReturnType<typeof createBrowserClient>; session: string; closed: boolean };

function config() {
  let value: unknown;
  try {
    const root = getAgentDir(), file = path.join(root, CONFIG), directory = lstatSync(root), metadata = lstatSync(file);
    if (!directory.isDirectory() || directory.isSymbolicLink() || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024 || (directory.mode & 0o022) !== 0 || (metadata.mode & 0o022) !== 0 || (typeof process.getuid === "function" && (directory.uid !== process.getuid() || metadata.uid !== process.getuid()))) throw new Error();
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch { throw new Error("pi-browser:config_required"); }
  if (!plain(value) || Object.keys(value).length !== 4 || !["browser_executable", "pages", "jev", "timeout_ms"].every((key) => Object.hasOwn(value, key))) throw new Error("pi-browser:config_invalid");
  return value as any;
}
function failure(code: string) { return { content: [{ type: "text", text: JSON.stringify({ schema: "browser-owner-adapter/v1", status: "refused", code }) }], isError: true }; }
function request(operation: string, input: any): BrowserRequest | null {
  if (operation === "capture") {
    const item = input?.request, keys = Object.hasOwn(item ?? {}, "entity_offset") ? ["schema", "request_id", "target", "predicates", "scope", "require_unique", "entity_offset"] : ["schema", "request_id", "target", "predicates", "scope", "require_unique"];
    return opaque(input?.page_id) && exact(input, ["page_id", "request"]) && exact(item, keys) && item.schema === "widget-resolution/v1" && opaque(item.request_id) && exact(item.target, ["description", "qualifiers"]) && typeof item.target.description === "string" && Array.isArray(item.target.qualifiers) && item.target.qualifiers.every((x: unknown) => typeof x === "string") && Array.isArray(item.predicates) && item.predicates.every((x: unknown) => typeof x === "string") && exact(item.scope, ["kind", "root"]) && typeof item.require_unique === "boolean" && (!Object.hasOwn(item, "entity_offset") || (Number.isInteger(item.entity_offset) && item.entity_offset >= 0 && item.entity_offset <= 2047)) && bytes(input) <= 8 * 1024 ? { operation, page_id: input.page_id, request: item } : null;
  }
  if (operation === "resolve") return opaque(input?.observation_id) && opaque(input?.entity_id) ? { operation, observation_id: input.observation_id, entity_id: input.entity_id } : null;
  return opaque(input?.observation_id) ? { operation, observation_id: input.observation_id } : null;
}
export function createBrowserExtension(pi: ExtensionAPI, createClient = createBrowserClient): void {
  let state: State | null = null;
  pi.registerFlag("browser", { description: "Enable bounded read-only browser observations for this fresh session", type: "boolean", default: false });
  const close = async () => { const current = state; state = null; if (current && !current.closed) { current.closed = true; await current.client.close(); } };
  pi.on("session_start", async (_event, ctx) => {
    await close();
    if (pi.getFlag("browser") !== true) { pi.setActiveTools(pi.getActiveTools().filter((name) => !name.startsWith("browser_"))); return; }
    try {
      const header: any = ctx.sessionManager.getHeader();
      if (!opaque(header?.id) || (ctx.sessionManager.getBranch() as any[]).some((entry) => sessionEntryToContextMessages(entry).length > 0)) throw new Error();
      state = { client: createClient({ piSessionId: header.id, trustedConfig: config() }), session: header.id, closed: false };
      pi.setActiveTools([...pi.getActiveTools().filter((name) => !name.startsWith("browser_")), "browser_capture", "browser_resolve", "browser_release", "browser_jev_resolve"]);
    } catch { ctx.abort(); throw new Error("pi-browser:startup_failed"); }
  });
  pi.on("session_before_fork", async (_event, ctx) => { if (state) { await close(); ctx.abort(); return { cancel: true }; } });
  pi.on("session_before_tree", async (_event, ctx) => { if (state) { await close(); ctx.abort(); return { cancel: true }; } });
  pi.on("session_shutdown", close);
  for (const [name, operation, parameters] of [
    ["browser_capture", "capture", Type.Object({ page_id: Type.String(), request: Type.Object({ schema: Type.Literal("widget-resolution/v1"), request_id: Type.String(), target: Type.Object({ description: Type.String(), qualifiers: Type.Array(Type.String()) }), predicates: Type.Array(Type.String()), scope: Type.Object({ kind: Type.String(), root: Type.String() }), require_unique: Type.Boolean(), entity_offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 2047 })) }) })],
    ["browser_resolve", "resolve", Type.Object({ observation_id: Type.String(), entity_id: Type.String() })],
    ["browser_release", "release", Type.Object({ observation_id: Type.String() })],
    ["browser_jev_resolve", "jev_resolve", Type.Object({ observation_id: Type.String() })],
  ] as const) pi.registerTool({
    name, description: "Use one opaque read-only browser observation reference.", parameters,
    async execute(_id, input: any, signal: AbortSignal, _update: unknown, ctx: ExtensionContext) {
      const current = state, value = request(operation, input);
      if (!current || current.closed || !value) return failure("invalid_request");
      try { const result = await current.client.execute(value, { signal: AbortSignal.any([signal, ctx.signal].filter(Boolean) as AbortSignal[]) }); if (state !== current || (ctx.sessionManager.getHeader() as any)?.id !== current.session || bytes(result) > 16 * 1024 || JSON.stringify(result).match(/data:image|image_url|inlineData/i)) return failure("stale_or_unsafe"); return { content: [{ type: "text", text: JSON.stringify(result) }], details: undefined }; }
      catch (error) { return failure(error instanceof BrowserClientError ? error.code : "owner_failed"); }
    },
  });
}
export default function (pi: ExtensionAPI): void { createBrowserExtension(pi); }
