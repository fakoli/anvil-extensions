// pi-voice-clone — pi-native access to a private voice style-clone plugin.
// Bridges a privately-owned measured-voice corpus (SKILL.md + clone.py +
// assets, kept outside this repo) into pi:
//
//   voice_prompt  tool — assemble the measured voice prompt (register profile
//                 + real few-shot documents + style grammar) via clone.py.
//   voice_check   tool — mechanical lint of a draft against his hard rules
//                 (zero exclamation marks, no filler, no hedging stacks,
//                 register close, em-dash restraint).
//   /voice        command — "/voice <register> <task>" assembles the prompt
//                 and hands the drafting job straight to the agent.
//
// Privacy contract (mirrors the plugin's): the corpus lives only in the owner's
// private clone; this extension never embeds, copies, or transmits it. Assembled
// prompts contain corpus excerpts and must stay local (session files, private
// dirs). The extension is file-plumbing only — no network, no LLM in the loop.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { assemblePrompt, type VoicePromptParams } from "./src/clone.js";
import { formatFindings, lintVoice } from "./src/lint.js";
import { resolveSkillDir } from "./src/skill-dir.js";

const REGISTERS_HINT =
  "Cloneable registers: professional-narrative (cover letters, project summaries, screening Q&A), " +
  "formal-gracious (resignations, offer accept/decline, thank-yous), formal-assertive (disputes, negotiations), " +
  "work-email (recruiter outreach, peer emails), technical-prose (proposals, RFCs, design docs), " +
  "internal-telegraphic (ops notes, runbooks), interview-notes (recon, prep, person notes), " +
  "work-notes (1-on-1s, meetings), personal-reflective (vision, self-development), " +
  "presentation-outline (talk outlines). Vault scaffolding (moc-index, bookmark-stub) is not cloneable.";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "voice_prompt",
    label: "Voice Clone Prompt",
    description:
      "Assemble the user's measured voice prompt for a writing task: register profile, 2-3 of his real documents as few-shot style references, and his hard style rules. Use BEFORE drafting anything in his voice — improvised imitation is explicitly rejected. " +
      REGISTERS_HINT,
    promptSnippet: "Assemble the user's measured voice prompt (style corpus retrieval) before drafting in the owner's voice",
    promptGuidelines: [
      "When asked to write anything in the owner's voice (emails, letters, outreach, notes, proposals) or to voice-edit existing prose, call voice_prompt first with the matching register, then draft following the assembled prompt's style rules, then run voice_check on the draft before delivering.",
      "Historical examples in the voice prompt are STYLE REFERENCES ONLY — facts for the draft come exclusively from the current task; never import corpus facts (employers, metrics, credentials, names).",
    ],
    parameters: Type.Object({
      register: Type.Optional(
        Type.String({ description: "Target register, e.g. work-email, formal-gracious, technical-prose. Omit when listRegisters is true." })
      ),
      task: Type.Optional(Type.String({ description: "What to write (the current task, with any facts the user supplied)." })),
      facts: Type.Optional(
        Type.String({ description: "Current-task evidence the user supplied (employers, numbers, names, dates). Passed as authoritative facts-file; corpus examples never supply facts." })
      ),
      context: Type.Optional(Type.String({ description: "Preferred context type for example selection, e.g. recruiter_outreach, offer_decline." })),
      audience: Type.Optional(Type.String({ description: "Preferred audience for example selection." })),
      n: Type.Optional(Type.Number({ description: "Max few-shot examples, 1-10 (default 3)." })),
      examples: Type.Optional(Type.Array(Type.String(), { description: "Force-include specific corpus doc IDs (repeatable order preserved)." })),
      listRegisters: Type.Optional(Type.Boolean({ description: "If true, return the available register list instead of assembling a prompt." })),
    }),
    async execute(_toolCallId, params, signal) {
      // Let errors THROW: per docs/extensions.md, returned tool results never
      // set the error flag — pi only marks isError on thrown errors.
      const p = params as VoicePromptParams;
      if (p.n !== undefined && (!Number.isInteger(p.n) || p.n < 1 || p.n > 10)) {
        throw new Error("n must be an integer 1-10");
      }
      if (!p.listRegisters && !p.task?.trim()) {
        throw new Error(
          "task is required when assembling a voice prompt — describe what to write. " +
          "(Pass listRegisters: true instead to enumerate available registers.)"
        );
      }
      const { clonePy } = resolveSkillDir();
      const text = await assemblePrompt(clonePy, p, 30_000, signal);
      return { content: [{ type: "text", text }], details: {} };
    },
  });

  pi.registerTool({
    name: "voice_check",
    label: "Voice Clone Check",
    description:
      "Lint a draft against the voice owner's mechanical hard rules (synced with the corpus style grammar): zero exclamation marks, no filler pleasantries, no marketing puffery, no hedging stacks, passive-voice-for-self heuristic, register-specific close, em-dash restraint. Run it on every draft written in his voice before delivering.",
    promptSnippet: "Mechanically lint a draft against the owner's hard voice rules before delivering",
    promptGuidelines: [
      "After drafting in the owner's voice, run voice_check with the register you targeted; fix every VIOLATION before delivering the draft, and read every warning consciously.",
    ],
    parameters: Type.Object({
      text: Type.String({ description: "The draft to lint." }),
      register: Type.String({ description: "The register the draft targets, e.g. work-email, formal-gracious." }),
    }),
    async execute(_toolCallId, params) {
      const findings = lintVoice(params.text, params.register);
      return { content: [{ type: "text", text: formatFindings(findings) }], details: {} };
    },
  });

  pi.registerCommand("voice", {
    description: "Draft in the owner's voice: /voice <register> <task>",
    handler: async (args, ctx) => {
      const raw = (args ?? "").trim();
      let skillDirInfo: ReturnType<typeof resolveSkillDir>;
      try {
        skillDirInfo = resolveSkillDir();
      } catch (err) {
        ctx.ui.notify(errorText(err), "error");
        return;
      }

      if (!raw || raw === "list") {
        try {
          const list = await assemblePrompt(skillDirInfo.clonePy, { register: "", listRegisters: true });
          ctx.ui.notify(list, "info");
        } catch (err) {
          ctx.ui.notify(errorText(err), "error");
        }
        return;
      }

      const spaceIdx = raw.indexOf(" ");
      const register = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx);
      const task = spaceIdx === -1 ? "" : raw.slice(spaceIdx + 1).trim();
      if (!task) {
        ctx.ui.notify("Usage: /voice <register> <task>   (e.g. /voice work-email \"Reply to the recruiter asking about scope\")\n" + REGISTERS_HINT, "warning");
        return;
      }

      try {
        const prompt = await assemblePrompt(skillDirInfo.clonePy, { register, task });
        // deliverAs: "followUp" is safe whether the agent is idle or streaming
        // (sendUserMessage without it throws mid-stream and would lose the prompt).
        pi.sendUserMessage(
          `The user invoked /voice ${register}. Below is the assembled voice prompt from his measured corpus. ` +
          `Draft the requested piece following every style rule in it, then run voice_check on your draft with register "${register}" and fix all VIOLATIONs before delivering.\n\n---\n\n${prompt}`,
          { deliverAs: "followUp" }
        );
        ctx.ui.notify(`voice prompt assembled (${register}) — drafting.`, "info");
      } catch (err) {
        ctx.ui.notify(errorText(err), "error");
      }
    },
  });
}