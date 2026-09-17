// pi-brag — turn the current project into a short, shareable launch video.
//
// Port of the latent-spaces/brag skill (MIT, © 2026 Shunit Haviv Hakimi) to
// the pi extension ecosystem. The creative workflow lives in the bundled
// skill (skills/brag/SKILL.md + references); this extension adds the pi glue:
//
//   /brag [flags]      kickoff command — parses flags and hands the agent a
//                      structured prompt that runs the skill workflow
//   /brag-doctor       instant environment check (no LLM turn)
//   brag_doctor        same checks, callable as a tool
//   brag_render        long-running engine-CLI runner with streamed progress
//   brag_poster        poster extraction + frame-0 bake (ffmpeg)
//   brag_fetch_assets  one-time download of the bundled music/SFX assets
//
// See UPSTREAM.md for provenance and every local change.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

import {
  formatBragOptions,
  parseBragInvocation,
  FORMATS,
  TONE_PRESETS,
} from "./src/flags.js";
import { formatReport, runDoctor, type DoctorReport } from "./src/doctor.js";
import {
  buildHyperframesArgs,
  runHyperframes,
  summarizeRun,
  RENDER_SUBCOMMANDS,
  type RunHyperframesResult,
} from "./src/render.js";
import { makePoster, summarizePoster, type PosterResult } from "./src/poster.js";
import { fetchAssets, tarballUrl, type FetchAssetsResult } from "./src/fetch-assets.js";
import { SKILL_ENTRY } from "./src/paths.js";

interface DoctorDetails {
  ok: boolean;
  report: DoctorReport;
}

interface RenderDetails {
  command: string;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
  durationMs: number;
}

interface PosterDetails {
  poster: string;
  video: string;
  baked: boolean;
  bakeError?: string;
}

interface FetchAssetsDetails {
  dest: string;
  ref: string;
  music: number;
  sfxFiles: number;
}

function buildKickoffPrompt(invocation: string): string {
  const opts = parseBragInvocation(invocation);
  const lines: string[] = [
    "Turn the project in the current directory into a short, shareable launch video using the brag workflow.",
    "",
    `Read the skill at ${SKILL_ENTRY} and follow it exactly — all four steps, their reference files, and every gate. Do not skip the inspect step or the check gate.`,
    "",
    "Invocation options:",
    ...formatBragOptions(opts),
    "",
    "Execution notes:",
    "- If the environment is unverified, run the brag_doctor tool first; it reports node/ffmpeg/engine-CLI/skill-asset status.",
    "- Drive the engine CLI through the brag_render tool (streams progress, survives long renders) or plain bash with a generous timeout. The composition directory is normally brag-output/composition under the project root.",
    "- Produce the poster with the brag_poster tool (extract + frame-0 bake) or the raw ffmpeg commands in the skill.",
    "- If music/SFX assets are missing, run the brag_fetch_assets tool once (downloads from the upstream repo), or continue with --no-music/--no-sfx.",
    "- If a visual gut-check is wanted and you cannot view images, delegate snapshot review to a vision-capable subagent, or rely on the engine's programmatic check gate (contrast + layout overflow).",
    "",
    "Output goes to brag-output/ under the project root: plan, composition brief, share copy, and the rendered brag.mp4. The video must pass the check gate before you call it done.",
  ];
  return lines.join("\n");
}

export default function (pi: ExtensionAPI): void {
  // --- commands -----------------------------------------------------------

  pi.registerCommand("brag", {
    description:
      "Turn the current project into a short, shareable launch video. Flags: --tone --format --duration --title --no-music --no-sfx --voice",
    handler: async (args, ctx) => {
      const prompt = buildKickoffPrompt(args ?? "");
      // Command contexts have no sendUserMessage — route through the
      // extension API. deliverAs only matters while the agent is streaming.
      pi.sendUserMessage(prompt, { deliverAs: ctx.isIdle() ? undefined : "followUp" });
    },
  });

  pi.registerCommand("brag-doctor", {
    description: "Check brag prerequisites (node, ffmpeg, engine CLI, bundled assets) without an agent turn",
    handler: async (_args, ctx) => {
      const report = await runDoctor();
      const text = formatReport(report);
      try {
        ctx.ui.notify(text, report.ok ? "info" : "warning");
      } catch {
        console.log(text);
      }
    },
  });

  // --- tools --------------------------------------------------------------

  pi.registerTool({
    name: "brag_doctor",
    label: "Brag Doctor",
    description:
      "Check /brag prerequisites: node >= 22.19, ffmpeg/ffprobe on PATH, the video-engine CLI, bundled music/SFX assets, and engine domain-skill discovery. Run before the first brag in an environment, or when renders fail.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const report = await runDoctor();
      return {
        content: [{ type: "text", text: formatReport(report) }],
        details: { ok: report.ok, report } satisfies DoctorDetails,
      };
    },
  });

  pi.registerTool({
    name: "brag_render",
    label: "Brag Render",
    description:
      "Run the video-engine CLI (npx hyperframes) for the brag workflow. Use for check (WCAG contrast + layout gate), render (final mp4), snapshot, beats, preview, tts, and doctor. Streams output while running; kills the child on timeout or abort. Run inside the composition directory (normally brag-output/composition).",
    parameters: Type.Object({
      subcommand: StringEnum([...RENDER_SUBCOMMANDS], {
        description:
          "check = programmatic quality gate (run before calling the video done); render = final mp4; snapshot = still previews; beats = music beat grid; preview = live dev server; tts = voiceover synthesis; doctor = engine self-check",
      }),
      cwd: Type.String({
        description: "Directory to run in — normally the composition directory (brag-output/composition).",
      }),
      args: Type.Optional(
        Type.Array(Type.String(), {
          description: "Extra CLI args passed through verbatim, e.g. ['--no-open'] for preview or ['--voice'] for tts.",
        }),
      ),
      quality: Type.Optional(
        StringEnum(["draft", "high"], {
          description: "Render quality for the render subcommand (draft first, high for the final pass).",
        }),
      ),
      output: Type.Optional(
        Type.String({ description: "Output mp4 path for render (default: ../brag.mp4 relative to cwd)." }),
      ),
      timeoutSeconds: Type.Optional(
        Type.Number({
          description:
            "Kill the run after this many seconds. Defaults: 120 for check/snapshot/beats/doctor, 300 for tts, 1200 for render/preview.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      const argv = buildHyperframesArgs(params);
      const result = await runHyperframes(
        params,
        (update) => {
          onUpdate?.({
            content: [{ type: "text", text: update.text }],
            details: { command: `npx ${argv.join(" ")}`, ok: false, exitCode: null, timedOut: false, aborted: false, durationMs: 0 } satisfies RenderDetails,
          });
        },
        signal,
      );
      const text = [
        summarizeRun(result, params.timeoutSeconds),
        result.stdoutTail ? `stdout (tail):\n${result.stdoutTail}` : "",
        result.stderrTail ? `stderr (tail):\n${result.stderrTail}` : "",
        result.timedOut
          ? "The run was killed at the timeout. Re-run with a larger timeoutSeconds, or render at --quality draft first."
          : "",
        result.ok && params.subcommand === "check"
          ? "Check gate passed — the composition may proceed to render."
          : "",
        !result.ok && params.subcommand === "check" && !result.timedOut && !result.aborted
          ? "Check gate FAILED — fix the reported issues (contrast, overflow) before rendering."
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const details: RenderDetails = {
        command: result.command,
        ok: result.ok,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        aborted: result.aborted,
        durationMs: result.durationMs,
      };
      return { content: [{ type: "text", text }], details };
    },
  });

  pi.registerTool({
    name: "brag_poster",
    label: "Brag Poster",
    description:
      "Extract a poster frame from the rendered video and bake it as frame 0 (controls platform thumbnails). Give the timestamp in seconds of the strongest settled beat — text fully on screen, before it exits. Requires ffmpeg.",
    parameters: Type.Object({
      video: Type.String({ description: "Path to the rendered mp4, e.g. brag-output/brag.mp4." }),
      timestamp: Type.Number({
        description: "Seconds into the video of the poster frame (settled beat, all text visible).",
      }),
      out: Type.Optional(Type.String({ description: "Poster jpg path (default: brag.jpg beside the video)." })),
      bake: Type.Optional(
        Type.Boolean({
          description: "Bake the poster as frame 0 of the video (default true; imperceptible on playback).",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await makePoster(params);
      return {
        content: [{ type: "text", text: summarizePoster(result) }],
        details: {
          poster: result.poster,
          video: result.video,
          baked: result.baked,
          ...(result.bakeError ? { bakeError: result.bakeError } : {}),
        } satisfies PosterDetails,
      };
    },
  });

  pi.registerTool({
    name: "brag_fetch_assets",
    label: "Brag Fetch Assets",
    description: `Download the bundled brag music/SFX assets from the upstream repo (${tarballUrl()}) into the skill's assets directory. One-time setup; needs network. Without assets, plan videos with --no-music --no-sfx.`,
    parameters: Type.Object({
      ref: Type.Optional(Type.String({ description: "Upstream git branch or tag to fetch from (default: main)." })),
      dest: Type.Optional(
        Type.String({ description: "Destination assets dir (default: this package's skills/brag/assets)." }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const result: FetchAssetsResult = await fetchAssets({ ...params, signal });
      return {
        content: [{ type: "text", text: result.summary }],
        details: {
          dest: result.dest,
          ref: result.ref,
          music: result.inventory.music.length,
          sfxFiles: result.inventory.sfxFiles,
        } satisfies FetchAssetsDetails,
      };
    },
  });
}