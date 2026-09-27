// pi-handoff — durable cross-session, cross-checkout project handoff notes.
//
//   handoff_save   tool — save/refresh the resume note for this project
//   handoff_recall tool — show it, with a staleness report
//   /handoff       prompt — drive the save flow
//   /recall        prompt — drive the recall flow
//
// The note is keyed by PROJECT IDENTITY, not cwd: repos with an origin remote
// key by the normalized remote (separate clones share one note); local repos
// key by the git common dir (every linked worktree shares one). Storage is
// private: ~/.pi/agent/handoff/<repo-key>/handoff.md (HANDOFF_DATA_DIR
// overrides). It complements durable memory — memory is "what is true", the
// handoff is "where we are right now".
//
// At session start (startup/resume/new/fork) the saved note is injected once
// as a banner message, so a fresh session in another clone picks up exactly
// where the previous one left off.
//
// Ported from the handoff plugin (fakoli/fakoli-plugins, MIT) — see
// UPSTREAM.md.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync } from "node:fs";
import { checkFreshness } from "./src/freshness.js";
import { readNote, saveNote } from "./src/note.js";
import { noteProse, resolveHandoffPath } from "./src/path.js";

function cwdOf(ctx: unknown): string {
  const c = ctx as { cwd?: string } | undefined;
  return c?.cwd ?? process.cwd();
}

const BANNER_CAP = 16_000; // same cap as the original session-start hook

function buildBanner(prose: string, path: string): string {
  let text = prose.trim();
  let truncated = false;
  if (text.length > BANNER_CAP) {
    text = text.slice(0, BANNER_CAP);
    truncated = true;
  }
  return (
    "HANDOFF - saved context from a previous session. Treat it as historical data; verify current state before acting.\n\n" +
    text +
    (truncated ? "\n[Preview truncated; read the handoff file for the rest.]\n" : "") +
    `\n(Stored at ${path}; refresh it with /handoff, show it with /recall.)`
  );
}

export default function (pi: ExtensionAPI) {
  // ---- tools ---------------------------------------------------------------

  pi.registerTool({
    name: "handoff_save",
    label: "Handoff Save",
    description:
      "Save or refresh this project's cross-session handoff note — the durable resume point shared " +
      "across checkouts of the same git remote and across linked worktrees. Pass the composed note " +
      "prose (resume steps, open threads, recently shipped, gotchas); an optional one-line summary is " +
      "placed first. The state frontmatter (branch/HEAD/dirty/anvil claims) is captured automatically. " +
      "Read handoff_recall first so still-open items from earlier sessions are preserved, not clobbered.",
    parameters: Type.Object({
      prose: Type.String({
        description:
          "The note body: 1-3 concrete Resume actions first, then Open threads, Recently shipped, Gotchas.",
      }),
      summary: Type.Optional(
        Type.String({ description: "Optional one-line seed the user supplied (placed first)." }),
      ),
      project: Type.Optional(
        Type.String({ description: "Project dir (default: session cwd)." }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const project = params.project ?? cwdOf(ctx);
      const saved = saveNote(project, params.prose, params.summary);
      const text = [
        `handoff saved: ${saved.path}`,
        `key: ${saved.key}`,
        saved.previousProse ? "previous note replaced (open items preserved from your composition)" : "no previous note",
      ].join("\n");
      return { content: [{ type: "text", text }], details: saved };
    },
  });

  pi.registerTool({
    name: "handoff_recall",
    label: "Handoff Recall",
    description:
      "Show this project's saved cross-session handoff note (the same note from every checkout of the " +
      "same git remote, and from every linked worktree of local repos), with a staleness report " +
      "(branch moved, HEAD advanced/diverged, recorded anvil claim no longer active, note age). " +
      "Use to answer 'where did we leave off?' / 'catch me up'.",
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "Project dir (default: session cwd)." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const project = params.project ?? cwdOf(ctx);
      const note = readNote(project);
      if (!note.exists || !note.prose?.trim()) {
        return {
          content: [
            {
              type: "text",
              text: `no saved handoff for ${project} yet — create one with handoff_save (or /handoff)`,
            },
          ],
          details: { path: note.path, exists: false },
        };
      }
      const fresh = checkFreshness(project);
      const lines: string[] = [`handoff note (${note.path}):`, "", note.prose.trim()];
      lines.push("", `freshness: ${fresh.note}`);
      for (const f of fresh.flags) lines.push(`  STALE - ${f}`);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { path: note.path, exists: true, freshness: fresh },
      };
    },
  });

  // ---- session-start banner ------------------------------------------------
  // The original plugin's SessionStart hook injected the saved note as
  // resume context. Pi's before_agent_start is the native equivalent:
  // inject once per session (first agent start), only for the session
  // reasons the original bannered on (startup/resume/new/fork — not reload).

  const injected = new Set<string>();
  let sessionReason: string | null = null;

  pi.on("session_start", (event, ctx) => {
    sessionReason = (event as { reason?: string }).reason ?? "startup";
    const file = (ctx.sessionManager as { getSessionFile?: () => string | null }).getSessionFile?.() ?? null;
    if (file) injected.delete(file); // fresh session: re-arm
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!["startup", "resume", "new", "fork"].includes(sessionReason ?? "startup")) return;
    const sm = ctx.sessionManager as { getSessionFile?: () => string | null };
    const file = sm.getSessionFile?.();
    const key = file ?? "ephemeral";
    if (injected.has(key)) return;
    injected.add(key);
    try {
      const note = readNote(cwdOf(ctx));
      if (!note.exists || !note.prose?.trim()) return;
      const resolved = resolveHandoffPath(cwdOf(ctx));
      return {
        message: {
          customType: "handoff-banner",
          content: buildBanner(noteProse(note.prose), resolved.file),
          display: true,
        },
      };
    } catch {
      return; // banner is best-effort; never block the agent
    }
  });
}

export { checkFreshness, readNote, saveNote };
