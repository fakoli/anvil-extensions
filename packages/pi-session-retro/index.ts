// pi-session-retro — native Pi extension for session retrospectives.
//
// One tool, five modes (mirroring the original session_stats.py CLI):
//
//   session_retro({ mode: "list"  })        browse sessions (pi/claude/codex)
//   session_retro({ mode: "find", keyword }) sessions mentioning a keyword
//   session_retro({ mode: "stats", paths }) JSON aggregates
//   session_retro({ mode: "report", paths }) markdown retro skeleton
//   session_retro({ mode: "html", paths, narrative?, writeHtml? })
//                                            interactive single-page site
//
// The deterministic counting (tokens, tools, workflow taxonomy, cache
// economy, integrity guards) is ported from the original Python script;
// the JUDGMENT (interaction analysis, retrospective, recommendations) is
// the agent's job — the report ends with the human-turn list and "(fill
// in)" sections, exactly like the original design.
//
// Native capability the original lacked: first-class Pi session parsing
// (~/.pi/agent/sessions/**/*.jsonl — usage.input/output/cacheRead/
// cacheWrite/reasoning/cost, toolCall blocks, subagent dispatches).
//
// Ported from the session-retro plugin (fakoli/fakoli-plugins, MIT) — see
// UPSTREAM.md.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { writeFileSync } from "node:fs";
import {
  runFind,
  runHtml,
  runList,
  runReport,
  runStats,
} from "./src/expand.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "session_retro",
    label: "Session Retro",
    description:
      "Session retrospective tool. Modes: list (browse pi/claude/codex sessions with date/branch/topic " +
      "breadcrumbs), find (sessions whose content mentions a keyword), stats (JSON aggregates), report " +
      "(markdown retro skeleton with token economy, workflow taxonomy, tool distribution, and the " +
      "human-turn list to analyze), html (interactive single-page retro site; pass a markdown narrative " +
      "to embed it). Deterministic counting only — the narrative is yours to write.",
    parameters: Type.Object({
      mode: Type.Union(
        [
          Type.Literal("list"),
          Type.Literal("find"),
          Type.Literal("stats"),
          Type.Literal("report"),
          Type.Literal("html"),
        ],
        { description: "Which mode to run." },
      ),
      keyword: Type.Optional(
        Type.String({ description: "find: content keyword (a PR number, feature, file, error)." }),
      ),
      substr: Type.Optional(
        Type.String({
          description: "list/find: filter by project/worktree path substring.",
        }),
      ),
      paths: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "stats/report/html: session JSONL path(s). Codex rollouts auto-expand to sibling rollouts. " +
            "Omit with list/find.",
        }),
      ),
      narrative: Type.Optional(
        Type.String({
          description: "html: markdown narrative (interaction analysis, retro, recommendations) to embed.",
        }),
      ),
      writeHtml: Type.Optional(
        Type.String({
          description: "html: also write the site to this file path.",
        }),
      ),
    }),
    async execute(_id, params) {
      switch (params.mode) {
        case "list":
          return { content: [{ type: "text", text: runList(params.substr ?? "") }] };
        case "find": {
          if (!params.keyword) {
            return {
              content: [
                {
                  type: "text",
                  text: "usage: find <keyword> [substr]   e.g. keyword '#93', substr 'anvil'",
                },
              ],
            };
          }
          return {
            content: [{ type: "text", text: runFind(params.keyword, params.substr ?? "") }],
          };
        }
        case "stats":
        case "report":
        case "html": {
          if (!params.paths?.length) {
            return {
              content: [
                {
                  type: "text",
                  text: `${params.mode} needs paths: session JSONL file(s). Use mode 'list' to browse.`,
                },
              ],
            };
          }
          if (params.mode === "stats") {
            return { content: [{ type: "text", text: runStats(params.paths) }] };
          }
          if (params.mode === "report") {
            return { content: [{ type: "text", text: runReport(params.paths) }] };
          }
          const html = runHtml(params.paths, { narrative: params.narrative });
          if (params.writeHtml) {
            writeFileSync(params.writeHtml, html, "utf8");
            return {
              content: [
                {
                  type: "text",
                  text: `wrote interactive retro site: ${params.writeHtml} (${html.length} bytes)`,
                },
              ],
              details: { file: params.writeHtml, bytes: html.length },
            };
          }
          return {
            content: [{ type: "text", text: html }],
            details: { bytes: html.length },
          };
        }
      }
    },
  });
}

export { runFind, runHtml, runList, runReport, runStats };
