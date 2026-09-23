const MAX_FRAME_BYTES = 16 * 1024;
const MAX_RESULT_BYTES = 15 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const SESSION = /^[A-Za-z0-9-]{1,128}$/;
const ID = /^[A-Za-z0-9-]{1,64}$/;
const JEV_FIELDS = ["schema", "request_id", "observation_id", "source", "target", "scope", "coverage", "entities"];
const plain = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const size = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
let adapter;
let state = "await_init";
let input = Buffer.alloc(0);

function send(value) {
  const line = JSON.stringify(value);
  if (Buffer.byteLength(line, "utf8") > MAX_FRAME_BYTES) fatal(70);
  process.stdout.write(`${line}\n`);
}
function refusal(code) { return { schema: "browser-owner-adapter/v1", status: "refused", code }; }
function validConfig(value) {
  if (!exact(value, ["browser_executable", "pages", "jev", "timeout_ms"]) || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 2) return false;
  let origin;
  for (const page of value.pages) {
    if (!exact(page, ["id", "url"]) || typeof page.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(page.id) || typeof page.url !== "string") return false;
    let url; try { url = new URL(page.url); } catch { return false; }
    if (url.protocol !== "https:" || url.username || url.password || url.hash || (origin && origin !== url.origin)) return false;
    origin = url.origin;
  }
  return exact(value, ["browser_executable", "pages", "jev", "timeout_ms"])
    && typeof value.browser_executable === "string" && value.browser_executable.startsWith("/")
    && validJev(value.jev, origin)
    && Number.isInteger(value.timeout_ms) && value.timeout_ms > 0 && value.timeout_ms <= REQUEST_TIMEOUT_MS;
}
function validJev(value, origin) {
  if (!plain(value) || typeof value.enabled !== "boolean") return false;
  if (!value.enabled) return exact(value, ["enabled"]);
  const keys = ["enabled", "origin", "fields", "executable", "cwd", "timeout"];
  return exact(value, keys) && value.origin === origin && Array.isArray(value.fields) && value.fields.length === JEV_FIELDS.length && value.fields.every((field, index) => field === JEV_FIELDS[index])
    && typeof value.executable === "string" && value.executable.startsWith("/") && typeof value.cwd === "string" && value.cwd.startsWith("/") && Number.isInteger(value.timeout) && value.timeout > 0 && value.timeout <= 10_000;
}
function validInit(value) {
  return exact(value, ["type", "version", "session_id", "config"])
    && value.type === "init" && value.version === 1 && typeof value.session_id === "string"
    && SESSION.test(value.session_id) && validConfig(value.config) && size(value) <= MAX_FRAME_BYTES;
}
function validRequest(value) {
  return exact(value, ["type", "id", "request"]) && value.type === "request"
    && typeof value.id === "string" && ID.test(value.id) && validOperation(value.request) && size(value) <= MAX_FRAME_BYTES;
}
function validOperation(value) {
  if (!plain(value) || typeof value.operation !== "string") return false;
  if (value.operation === "capture") {
    const requestKeys = Object.hasOwn(value.request ?? {}, "entity_offset") ? ["schema", "request_id", "target", "predicates", "scope", "require_unique", "entity_offset"] : ["schema", "request_id", "target", "predicates", "scope", "require_unique"];
    return exact(value, ["operation", "page_id", "request"]) && typeof value.page_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.page_id)
      && exact(value.request, requestKeys) && value.request.schema === "widget-resolution/v1" && typeof value.request.request_id === "string"
      && exact(value.request.target, ["description", "qualifiers"]) && typeof value.request.target.description === "string" && Array.isArray(value.request.target.qualifiers)
      && Array.isArray(value.request.predicates) && exact(value.request.scope, ["kind", "root"]) && typeof value.request.require_unique === "boolean"
      && (!Object.hasOwn(value.request, "entity_offset") || (Number.isInteger(value.request.entity_offset) && value.request.entity_offset >= 0 && value.request.entity_offset <= 2047));
  }
  if (value.operation === "resolve") return exact(value, ["operation", "observation_id", "entity_id"]) && typeof value.observation_id === "string" && typeof value.entity_id === "string";
  return (value.operation === "release" || value.operation === "jev_resolve") && exact(value, ["operation", "observation_id"]) && typeof value.observation_id === "string";
}
async function close() {
  if (state === "closed") return;
  state = "closed";
  await adapter?.close().catch(() => {});
}
function fatal(code = 64) { void close().finally(() => process.exit(code)); }
async function initialize(value) {
  if (state !== "await_init" || !validInit(value)) return fatal();
  if (process.platform !== "linux" || Number((process.versions.node ?? "").split(".")[0]) < 24) return fatal(69);
  state = "initializing";
  try {
    const [{ chromium }, { createLiveObservationAdapter }] = await Promise.all([import("playwright"), import("@anvil-serving/observations/browser")]);
    if (state !== "initializing") return;
    const { config, session_id: piSessionId } = value;
    adapter = await createLiveObservationAdapter({
      launch: () => chromium.launch({ executablePath: config.browser_executable, headless: true, args: ["--disable-gpu"] }),
      piSessionId, pages: config.pages, jev: config.jev,
    });
    if (state !== "initializing") { await adapter.close().catch(() => {}); return; }
    state = "ready";
    send({ type: "ready", version: 1, session_id: piSessionId });
  } catch { fatal(70); }
}
async function handle(value) {
  if (state === "await_init") return initialize(value);
  if (state !== "ready" || !validRequest(value)) return fatal();
  state = "running";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let result;
  try { result = await adapter.execute(value.request, { signal: controller.signal }); }
  catch { result = refusal(controller.signal.aborted ? "deadline_exceeded" : "owner_failed"); }
  finally { clearTimeout(timer); }
  if (state !== "running") return;
  if (!plain(result) || size(result) > MAX_RESULT_BYTES) return fatal(70);
  state = "ready";
  send({ type: "result", id: value.id, result });
}
function accept(chunk) {
  if (state === "closed" || !Buffer.isBuffer(chunk)) return fatal();
  input = Buffer.concat([input, chunk]);
  if (input.length > MAX_FRAME_BYTES + 1) return fatal();
  for (;;) {
    const end = input.indexOf(10);
    if (end < 0) return;
    const frame = input.subarray(0, end); input = input.subarray(end + 1);
    if (frame.length > MAX_FRAME_BYTES) return fatal();
    let value; try { value = JSON.parse(frame.toString("utf8")); } catch { return fatal(); }
    void handle(value);
  }
}
process.stdin.on("data", accept);
process.stdin.on("end", () => {
  if (state === "await_init" || state === "initializing") return fatal();
  void close().finally(() => process.exit(0));
});
process.stdin.on("error", () => fatal());
process.once("SIGTERM", () => { void close().finally(() => process.exit(143)); });
process.once("SIGINT", () => { void close().finally(() => process.exit(130)); });
