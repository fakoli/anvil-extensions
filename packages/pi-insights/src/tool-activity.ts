import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** UI-only elapsed time: tool silence is not evidence that inference is stuck. */
export function installToolActivity(pi: ExtensionAPI, active: () => boolean): () => void {
  const running = new Map<string, { name: string; started: number; updated: number }>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let context: ExtensionContext | undefined;
  const visible = (ctx: ExtensionContext) => active() && ctx.hasUI && (ctx.mode === "tui" || ctx.mode === "rpc");
  const age = (at: number) => `${Math.max(0, Math.floor((Date.now() - at) / 1000))}s`;
  const status = (value?: string) => {
    try { context?.ui.setStatus("pi-insights-tool", value); } catch { /* observational only */ }
  };
  function clear(): void {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    running.clear();
    status();
    context = undefined;
  }
  function render(): void {
    if (!context || !visible(context)) { clear(); return; }
    const oldest = running.values().next().value;
    if (!oldest) { clear(); return; }
    status(`${oldest.name} running ${age(oldest.started)} · no updates ${age(oldest.updated)}${running.size > 1 ? ` · ${running.size} tools` : ""}`);
  }
  pi.on("tool_execution_start", (event, ctx) => {
    if (!visible(ctx)) return;
    context = ctx;
    // Bound retained metadata; never retain arguments or output.
    if (running.size >= 64) return;
    const now = Date.now();
    running.set(event.toolCallId, { name: event.toolName.replace(/[^a-zA-Z0-9_.-]/g, "?").slice(0, 48) || "tool", started: now, updated: now });
    render();
    if (timer === undefined) { timer = setInterval(render, 1000); timer.unref?.(); }
  });
  pi.on("tool_execution_update", (event) => {
    const tool = running.get(event.toolCallId);
    if (tool) { tool.updated = Date.now(); render(); }
  });
  pi.on("tool_execution_end", (event) => {
    if (running.delete(event.toolCallId)) render();
  });
  pi.on("agent_end", clear);
  pi.on("session_start", clear);
  pi.on("session_shutdown", clear);
  return clear;
}
