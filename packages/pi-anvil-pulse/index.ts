// pi-anvil-pulse — live operator dashboard for long autonomous anvil runs.
//
//   anvil_pulse_start   tool — start the local dashboard for an anvil project
//   anvil_pulse_check   tool — is the dashboard running for a project?
//   anvil_pulse_stop    tool — stop it (identity-guarded, never kills strangers)
//   anvil_pulse_read    tool — read the pulse (claims, staleness, event feed)
//   /pulse              command — start | stop | status | read
//
// The dashboard is a dependency-free local web page (127.0.0.1) showing task
// rollups, active claims with live lease countdowns, the event feed, and
// stuck-state detection (healthy / quiet / possibly-wedged / lease-expired).
// It answers "is this still going, or is it wedged?" on any harness.
//
// Read-only over anvil state: `anvil status` is a read verb and events.jsonl
// is opened read-only; nothing is sent externally. Ported from the
// anvil-pulse plugin (fakoli/fakoli-plugins, MIT) — see UPSTREAM.md.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  checkPulse,
  isOurServer,
  pulsePaths,
  readPid,
  SERVER_PATH,
  startPulse,
  stopPulse,
} from "./src/process.js";

function cwdOf(ctx: unknown): string {
  const c = ctx as { cwd?: string } | undefined;
  return c?.cwd ?? process.cwd();
}

function pulseSummary(pulse: Record<string, unknown>): string {
  const claims = (pulse.claims ?? []) as Array<Record<string, unknown>>;
  const tasks = (pulse.tasks ?? null) as Record<string, number> | null;
  const lines: string[] = [];
  if (tasks) {
    lines.push(
      `tasks: ${Object.entries(tasks)
        .map(([k, v]) => `${k} ${v}`)
        .join(" / ")}`,
    );
  }
  if (claims.length === 0) {
    lines.push("claims: none active");
  } else {
    lines.push(
      ...claims.map((c) => {
        const id = String(c.task_id ?? "?");
        const actor = String(c.actor ?? "?");
        const phase = String(c.phase ?? "-");
        const stale = String(c.staleness ?? "?");
        const last = c.last_activity_seconds;
        const lastTxt =
          typeof last === "number" ? ` (last event ${Math.round(last / 60)}m ago)` : "";
        const lease =
          typeof c.lease_expires_in_seconds === "number"
            ? ` lease ${c.lease_expires_in_seconds > 0 ? `${Math.round(c.lease_expires_in_seconds / 60)}m` : "EXPIRED"}`
            : "";
        return `claim: ${id} [${actor}] ${phase} — ${stale}${lastTxt}${lease}`;
      }),
    );
  }
  const events = (pulse.events ?? []) as Array<Record<string, unknown>>;
  if (events.length) {
    const lastEv = events[0];
    lines.push(
      `last event: ${String(lastEv.action ?? "?")} ${String(lastEv.target_id ?? "")} ${String(lastEv.phase ?? "")}${lastEv.notes ? ` — ${String(lastEv.notes).slice(0, 80)}` : ""}`,
    );
  }
  const warnings = (pulse.warnings ?? []) as string[];
  for (const w of warnings) lines.push(`warning: ${w}`);
  return lines.join("\n");
}

async function readPulseApi(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${url.replace(/\/$/, "")}/api/pulse`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`pulse API returned HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export default function (pi: ExtensionAPI) {
  // ---- tools ---------------------------------------------------------------

  pi.registerTool({
    name: "anvil_pulse_start",
    label: "Anvil Pulse Start",
    description:
      "Start the anvil-pulse live dashboard for an anvil project: a local 127.0.0.1 web page with task " +
      "rollups, active claims (actor, phase, elapsed, live lease countdown), the event feed, and " +
      "stuck-state detection (healthy/quiet/possibly-wedged/lease-expired). Returns the URL. " +
      "Read-only over anvil state; sends nothing externally. One dashboard per project.",
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "Anvil project dir (default: session cwd)." })),
      port: Type.Optional(Type.Number({ description: "Fixed port (default: random high port)." })),
      stateDir: Type.Optional(
        Type.String({ description: "Explicit anvil state dir containing events.jsonl (default: auto-discover)." }),
      ),
      anvilBin: Type.Optional(
        Type.String({ description: "anvil executable to poll (default: \"anvil\" on PATH)." }),
      ),
      host: Type.Optional(Type.String({ description: "Bind host (default 127.0.0.1)." })),
      urlHost: Type.Optional(Type.String({ description: "Hostname shown in the returned URL." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const project = params.project ?? cwdOf(ctx);
      const result = await startPulse({
        project,
        port: params.port,
        stateDir: params.stateDir,
        host: params.host,
        urlHost: params.urlHost,
        anvilBin: params.anvilBin,
      });
      return {
        content: [
          {
            type: "text",
            text:
              `dashboard started: ${result.url}\n` +
              `pid ${result.pid}, project ${result.projectDir}, log ${result.logFile}\n` +
              "it live-updates every ~2.5s; stop it with anvil_pulse_stop.",
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "anvil_pulse_check",
    label: "Anvil Pulse Check",
    description:
      "Check whether the anvil-pulse dashboard is running for a project (default: session cwd). " +
      "Verifies the recorded PID still belongs to this package's server for this project before " +
      "reporting running; unrelated node processes are never touched.",
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "Anvil project dir (default: session cwd)." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const result = await checkPulse(params.project ?? cwdOf(ctx));
      return {
        content: [
          {
            type: "text",
            text: result.running
              ? `running: ${result.url ?? "(url unknown)"} (pid ${result.pid})${result.note ? ` — ${result.note}` : ""}`
              : `not running: ${result.note}`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "anvil_pulse_stop",
    label: "Anvil Pulse Stop",
    description:
      "Stop the anvil-pulse dashboard for a project (default: session cwd). The recorded PID is " +
      "verified to belong to this package's server for this project before signalling — a stale " +
      "pid file is cleaned without touching unrelated processes.",
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "Anvil project dir (default: session cwd)." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const result = await stopPulse(params.project ?? cwdOf(ctx));
      return {
        content: [
          {
            type: "text",
            text:
              result.pid !== undefined
                ? `dashboard stopped (pid ${result.pid})`
                : `dashboard stop: ${result.note}`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "anvil_pulse_read",
    label: "Anvil Pulse Read",
    description:
      "Read the current pulse for a project from the running dashboard: task rollups, active claims " +
      "with staleness (healthy/quiet/possibly-wedged/lease-expired), last activity, and the newest " +
      "event. Use to answer 'is the run stuck?' without a browser. Read-only; requires the " +
      "dashboard to be running (anvil_pulse_start) — it does not start it.",
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "Anvil project dir (default: session cwd)." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const project = params.project ?? cwdOf(ctx);
      const check = await checkPulse(project);
      if (!check.running || !check.url) {
        return {
          content: [
            {
              type: "text",
              text: `dashboard is not running for ${project} (${check.note ?? "unknown"}); start it with anvil_pulse_start first`,
            },
          ],
          details: { running: false, projectDir: project },
        };
      }
      const pulse = await readPulseApi(check.url);
      return {
        content: [{ type: "text", text: pulseSummary(pulse) }],
        details: { running: true, projectDir: project, url: check.url },
      };
    },
  });

  // ---- /pulse command ------------------------------------------------------

  pi.registerCommand("pulse", {
    description: "anvil-pulse dashboard: /pulse [start|stop|status|read] (default: start)",
    handler: async (args, ctx) => {
      const verb = (args ?? "").trim().split(/\s+/)[0] || "start";
      const project = (args ?? "").trim().split(/\s+/).slice(1).join(" ") || undefined;
      const target = project ?? cwdOf(ctx);
      switch (verb) {
        case "start": {
          try {
            const r = await startPulse({ project: target });
            ctx.ui.notify(`pulse: ${r.url} (pid ${r.pid})`, "info");
          } catch (e) {
            ctx.ui.notify(`pulse start failed: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }
        case "stop": {
          const r = await stopPulse(target);
          ctx.ui.notify(
            r.pid !== undefined ? `pulse stopped (pid ${r.pid})` : `pulse: ${r.note}`,
            "info",
          );
          break;
        }
        case "status":
        case "check": {
          const r = await checkPulse(target);
          ctx.ui.notify(
            r.running ? `pulse running: ${r.url ?? "url unknown"} (pid ${r.pid})` : `pulse not running (${r.note})`,
            "info",
          );
          break;
        }
        case "read": {
          const check = await checkPulse(target);
          if (!check.running || !check.url) {
            ctx.ui.notify(`pulse not running for ${target}; start it first`, "error");
            break;
          }
          try {
            const pulse = await readPulseApi(check.url);
            ctx.ui.notify(pulseSummary(pulse), "info");
          } catch (e) {
            ctx.ui.notify(`pulse read failed: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }
        default:
          ctx.ui.notify(`unknown verb '${verb}' — use start|stop|status|read`, "error");
      }
    },
  });

  // ---- TUI widget: one-line pulse status while a dashboard is running ------

  let widgetTimer: ReturnType<typeof setInterval> | null = null;

  async function startWidget(cwd: string, ui: { setWidget: (id: string, lines: string[]) => void }): Promise<void> {
    const update = async () => {
      try {
        const check = await checkPulse(cwd);
        if (!check.running || !check.url) {
          ui.setWidget("anvil-pulse", []);
          if (widgetTimer) {
            clearInterval(widgetTimer);
            widgetTimer = null;
          }
          return;
        }
        const pulse = await readPulseApi(check.url);
        const claims = (pulse.claims ?? []) as Array<Record<string, unknown>>;
        const parts: string[] = [];
        if (claims.length === 0) parts.push("no active claims");
        for (const c of claims) {
          const stale = String(c.staleness ?? "?");
          const lease =
            typeof c.lease_expires_in_seconds === "number" && c.lease_expires_in_seconds <= 0
              ? " lease-expired"
              : "";
          parts.push(`${String(c.task_id ?? "?")} ${stale}${lease}`.trim());
        }
        ui.setWidget("anvil-pulse", [`pulse: ${parts.join(" · ")}`]);
      } catch {
        /* transient: keep the previous line */
      }
    };
    if (!widgetTimer) {
      widgetTimer = setInterval(() => void update(), 5_000);
      widgetTimer.unref?.();
    }
    void update();
  }

  pi.on("session_start", async (_event, ctx) => {
    const check = await checkPulse(cwdOf(ctx)).catch(() => null);
    if (check?.running && check.url) {
      void startWidget(cwdOf(ctx), ctx.ui);
    }
  });

  pi.on("session_shutdown", async () => {
    if (widgetTimer) {
      clearInterval(widgetTimer);
      widgetTimer = null;
    }
  });
}

// Re-exported for tests.
export { checkPulse, isOurServer, pulsePaths, readPid, SERVER_PATH, startPulse, stopPulse };
