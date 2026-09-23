import { spawn as nodeSpawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const MAX_FRAME = 16 * 1024;
const MAX_STDOUT = 1024 * 1024;
const MAX_STDERR = 64 * 1024;
const MAX_FRAMES = 65; // one ready frame plus 64 operation results
const START_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const JEV_FIELDS = ["schema", "request_id", "observation_id", "source", "target", "scope", "coverage", "entities"];
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value: unknown, keys: string[]) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

export class BrowserClientError extends Error {
  readonly code: "platform_unsupported" | "invalid_config" | "worker_unavailable" | "worker_protocol" | "cancelled" | "deadline_exceeded";
  constructor(code: BrowserClientError["code"]) { super(code); this.code = code; }
}
export type BrowserRequest = Record<string, unknown>;
export type BrowserResult = Record<string, unknown>;
export type TrustedBrowserConfig = Readonly<{ browser_executable: string; pages: readonly Record<string, unknown>[]; jev: Readonly<Record<string, unknown>>; timeout_ms: number }>;
type Child = ReturnType<typeof nodeSpawn>;
type Spawn = typeof nodeSpawn;
function validConfig(value: TrustedBrowserConfig): boolean {
  if (!exact(value, ["browser_executable", "pages", "jev", "timeout_ms"]) || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 2) return false;
  let origin: string | undefined;
  for (const page of value.pages) {
    if (!exact(page, ["id", "url"]) || typeof page.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(page.id) || typeof page.url !== "string") return false;
    let url: URL; try { url = new URL(page.url); } catch { return false; }
    if (url.protocol !== "https:" || url.username || url.password || url.hash || (origin && origin !== url.origin)) return false;
    origin = url.origin;
  }
  return exact(value, ["browser_executable", "pages", "jev", "timeout_ms"])
    && typeof value.browser_executable === "string" && value.browser_executable.startsWith("/")
    && validJev(value.jev, origin)
    && Number.isInteger(value.timeout_ms) && value.timeout_ms > 0 && value.timeout_ms <= REQUEST_TIMEOUT_MS && bytes(value) <= MAX_FRAME;
}
function validJev(value: unknown, origin: string | undefined): boolean {
  if (!plain(value) || typeof value.enabled !== "boolean") return false;
  if (!value.enabled) return exact(value, ["enabled"]);
  return exact(value, ["enabled", "origin", "fields", "executable", "cwd", "timeout"])
    && value.origin === origin && Array.isArray(value.fields) && value.fields.length === JEV_FIELDS.length && value.fields.every((field, index) => field === JEV_FIELDS[index])
    && typeof value.executable === "string" && value.executable.startsWith("/") && typeof value.cwd === "string" && value.cwd.startsWith("/") && Number.isInteger(value.timeout) && value.timeout > 0 && value.timeout <= 10_000;
}
function validOperation(value: BrowserRequest): boolean {
  if (typeof value.operation !== "string") return false;
  if (value.operation === "capture") {
    const request = value.request;
    if (!exact(value, ["operation", "page_id", "request"]) || typeof value.page_id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value.page_id) || !plain(request)) return false;
    const keys = Object.hasOwn(request, "entity_offset") ? ["schema", "request_id", "target", "predicates", "scope", "require_unique", "entity_offset"] : ["schema", "request_id", "target", "predicates", "scope", "require_unique"];
    return exact(request, keys) && request.schema === "widget-resolution/v1" && typeof request.request_id === "string" && exact(request.target, ["description", "qualifiers"])
      && typeof request.target.description === "string" && Array.isArray(request.target.qualifiers) && Array.isArray(request.predicates) && exact(request.scope, ["kind", "root"])
      && typeof request.require_unique === "boolean" && (!Object.hasOwn(request, "entity_offset") || (Number.isInteger(request.entity_offset) && request.entity_offset >= 0 && request.entity_offset <= 2047));
  }
  if (value.operation === "resolve") return exact(value, ["operation", "observation_id", "entity_id"]) && typeof value.observation_id === "string" && typeof value.entity_id === "string";
  return (value.operation === "release" || value.operation === "jev_resolve") && exact(value, ["operation", "observation_id"]) && typeof value.observation_id === "string";
}
function validResult(value: unknown, operation: string, pageId: string | undefined, piSessionId: string, ownerSessionId: string | undefined, pages: Set<string>): value is BrowserResult {
  if (!plain(value) || value.schema !== "browser-owner-adapter/v1" || typeof value.status !== "string") return false;
  if (value.status === "refused") return exact(value, ["schema", "status", "code"]) && typeof value.code === "string" && /^[a-z_]{1,64}$/.test(value.code);
  return value.status === "ok" && exact(value, ["schema", "status", "operation", "binding", "page_id", "result"])
    && value.operation === operation && exact(value.binding, ["pi_session_id", "owner_session_id"])
    && value.binding.pi_session_id === piSessionId && typeof value.binding.owner_session_id === "string" && value.binding.owner_session_id.length > 0
    && (!ownerSessionId || value.binding.owner_session_id === ownerSessionId) && typeof value.page_id === "string" && pages.has(value.page_id) && (!pageId || value.page_id === pageId) && plain(value.result);
}
function environment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME"]) if (typeof source[key] === "string") result[key] = source[key];
  return result;
}
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function groupAlive(pid: number) { try { process.kill(-pid, 0); return true; } catch { return false; } }
function groupSignal(child: Child, signal: NodeJS.Signals) { if (!child.pid) return; try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} } }

export function createBrowserClient({ piSessionId, trustedConfig, workerPath = fileURLToPath(new URL("./worker.mjs", import.meta.url)), nodePath = "node", spawn = nodeSpawn }: { piSessionId: string; trustedConfig: TrustedBrowserConfig; workerPath?: string; nodePath?: string; spawn?: Spawn }) {
  if (process.platform !== "linux") throw new BrowserClientError("platform_unsupported");
  if (!/^[A-Za-z0-9-]{1,128}$/.test(piSessionId) || !validConfig(trustedConfig)) throw new BrowserClientError("invalid_config");
  let child: Child | undefined, buffer = Buffer.alloc(0), stdoutBytes = 0, stderrBytes = 0, frames = 0, sequence = 0;
  const pageIds = new Set(trustedConfig.pages.map((page) => page.id as string));
  let ownerSessionId: string | undefined;
  let active: { id: string; operation: string; pageId?: string; resolve: (value: BrowserResult) => void; reject: (error: BrowserClientError) => void } | undefined;
  let starting: Promise<void> | undefined, rejectStarting: ((error: BrowserClientError) => void) | undefined, startTimer: NodeJS.Timeout | undefined;
  let state: "new" | "starting" | "ready" | "failed" | "closed" = "new", stopping: Promise<void> | undefined;
  const stop = (error?: BrowserClientError) => {
    if (error) { if (startTimer) clearTimeout(startTimer); startTimer = undefined; rejectStarting?.(error); rejectStarting = undefined; active?.reject(error); active = undefined; }
    if (stopping) return stopping;
    const current = child; state = state === "closed" ? "closed" : "failed";
    stopping = (async () => {
      if (!current?.pid) return;
      const closed = once(current, "close").catch(() => {});
      groupSignal(current, "SIGTERM");
      await Promise.race([closed, pause(300)]);
      // The detached leader can exit while Chromium descendants remain in its group.
      if (groupAlive(current.pid)) groupSignal(current, "SIGKILL");
      await Promise.race([closed, pause(1_000)]);
    })();
    return stopping;
  };
  const protocol = () => { void stop(new BrowserClientError("worker_protocol")); };
  const write = (value: unknown) => {
    const line = JSON.stringify(value);
    if (Buffer.byteLength(line, "utf8") > MAX_FRAME || !child?.stdin.writable) throw new BrowserClientError("worker_protocol");
    child.stdin.write(`${line}\n`, (error) => { if (error) protocol(); });
  };
  const start = () => {
    if (starting) return starting;
    state = "starting";
    starting = new Promise<void>((resolve, reject) => {
      rejectStarting = reject;
      try { child = spawn(nodePath, [workerPath], { detached: true, stdio: ["pipe", "pipe", "pipe"], env: environment(process.env) }); }
      catch { reject(new BrowserClientError("worker_unavailable")); return; }
      startTimer = setTimeout(() => { void stop(new BrowserClientError("worker_unavailable")); }, START_TIMEOUT_MS);
      child.once("error", () => { void stop(new BrowserClientError("worker_unavailable")); });
      child.once("close", () => { if (state !== "closed" && state !== "failed") void stop(new BrowserClientError("worker_unavailable")); });
      child.stdin.once("error", () => protocol());
      child.stdout.on("data", (part: Buffer) => {
        if (state === "failed" || state === "closed") return;
        stdoutBytes += part.length; if (stdoutBytes > MAX_STDOUT) return protocol();
        buffer = Buffer.concat([buffer, part]); if (buffer.length > MAX_FRAME + 1) return protocol();
        for (;;) {
          const end = buffer.indexOf(10); if (end < 0) return;
          const line = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
          if (line.length > MAX_FRAME || ++frames > MAX_FRAMES) return protocol();
          let message: unknown; try { message = JSON.parse(line.toString("utf8")); } catch { return protocol(); }
          if (state === "starting" && exact(message, ["type", "version", "session_id"]) && message.type === "ready" && message.version === 1 && message.session_id === piSessionId) {
            if (startTimer) clearTimeout(startTimer); startTimer = undefined; rejectStarting = undefined; state = "ready"; resolve(); continue;
          }
          if (state === "ready" && active && exact(message, ["type", "id", "result"]) && message.type === "result" && message.id === active.id && bytes(message) <= MAX_FRAME && validResult(message.result, active.operation, active.pageId, piSessionId, ownerSessionId, pageIds)) {
            if (message.result.status === "ok") ownerSessionId ??= message.result.binding.owner_session_id;
            const pending = active; active = undefined; pending.resolve(message.result); continue;
          }
          return protocol();
        }
      });
      child.stderr.on("data", (part: Buffer) => { stderrBytes += part.length; if (stderrBytes > MAX_STDERR) protocol(); });
      try { write({ type: "init", version: 1, session_id: piSessionId, config: trustedConfig }); } catch (error) { reject(error as BrowserClientError); void stop(error as BrowserClientError); }
    });
    return starting;
  };
  const waitStart = async (signal?: AbortSignal) => {
    if (signal?.aborted) { await stop(new BrowserClientError("cancelled")); throw new BrowserClientError("cancelled"); }
    const started = start();
    if (!signal) return started;
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => { abort = () => { void stop(new BrowserClientError("cancelled")); reject(new BrowserClientError("cancelled")); }; signal.addEventListener("abort", abort, { once: true }); });
    try { return await Promise.race([started, cancelled]); } finally { signal.removeEventListener("abort", abort); }
  };
  return Object.freeze({
    async execute(request: BrowserRequest, { signal }: { signal?: AbortSignal } = {}): Promise<BrowserResult> {
      if (state === "closed" || !plain(request) || !validOperation(request) || bytes(request) > MAX_FRAME) throw new BrowserClientError("invalid_config");
      try { await waitStart(signal); } catch (error) { await stopping; throw error; }
      if (state !== "ready" || active) throw new BrowserClientError("worker_protocol");
      const id = `r-${++sequence}`;
      const outcome = new Promise<BrowserResult>((resolve, reject) => {
        const timer = setTimeout(() => { void stop(new BrowserClientError("deadline_exceeded")); reject(new BrowserClientError("deadline_exceeded")); }, trustedConfig.timeout_ms);
        const abort = () => { void stop(new BrowserClientError("cancelled")); reject(new BrowserClientError("cancelled")); };
        const finish = (fn: () => void) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); fn(); };
        active = { id, operation: request.operation as string, pageId: request.operation === "capture" ? request.page_id as string : undefined, resolve: (value) => finish(() => resolve(value)), reject: (error) => finish(() => reject(error)) };
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) return abort();
        try { write({ type: "request", id, request }); } catch (error) { void stop(error as BrowserClientError); }
      });
      try { return await outcome; } catch (error) { await stopping; throw error; }
    },
    async close(): Promise<void> { state = "closed"; await stop(new BrowserClientError("cancelled")); },
  });
}
