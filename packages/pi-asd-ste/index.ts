// pi-asd-ste — ASD-STE100 Simplified Technical English extension.
// /asd-ste            refactor the last agent message (or args text) NOW
// /asd-ste on|off     session mode: inject compact STE rules before every turn
// /asd-ste full       inject the full 53-rule skill markdown once
// /asd-ste check      check words in args text against dictionary, report hits
// The skill (skills/asd-ste) owns the words; this extension injects the
// format into the session and refactors text through the running agent.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { STE_RULES_DIGEST, STE_COMPACT, loadSkillMarkdown, checkWords, loadDict } from "./src/dict.js";

interface BranchMessageEntry {
	type: string;
	message?: { role?: string; content?: unknown };
}

interface State {
	sessionOn: boolean;
	lastRefactorText: string;
}

export default function asdSte(pi: ExtensionAPI): void {
	const state: State = { sessionOn: false, lastRefactorText: "" };

	const refactorPrompt = (text: string): string =>
		`Use the asd-ste skill. Read /home/fakoli/code/anvil-extensions/packages/pi-asd-ste/skills/asd-ste/SKILL.md and words.txt beside it. Rewrite this text in ASD-STE100 Simplified Technical English. Fix every rule violation, list each non-STE word with its approved alternative and rule number:\n${text}`;

	const lastAgentText = (ctx: ExtensionContext): string => {
		const branch = ctx.sessionManager.getBranch();
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i] as unknown as BranchMessageEntry;
			if (entry?.type === "message" && entry.message?.role === "assistant") {
				const content = entry.message.content;
				if (typeof content === "string") return content;
				if (Array.isArray(content)) {
					const text = content
						.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : ""))
						.filter(Boolean)
						.join("\n");
					if (text) return text;
				}
			}
		}
		return "";
	};

	pi.registerCommand("asd-ste", {
		description: "ASD-STE100 Simplified Technical English: refactor text, inject rules, or toggle session mode",
		getArgumentCompletions: (prefix: string) => {
			const modes = ["on", "off", "full", "check"];
			const filtered = modes.filter((m) => m.startsWith(prefix));
			return filtered.length > 0 ? filtered.map((m) => ({ value: m, label: m })) : null;
		},
		handler: async (args: string, ctx: ExtensionContext) => {
			const trimmed = args.trim();
			const mode = trimmed.split(/\s+/)[0] ?? "";

			if (mode === "on" || mode === "off") {
				state.sessionOn = mode === "on";
				ctx.ui.notify(`ASD-STE session mode ${state.sessionOn ? "ON — rules injected before every turn" : "OFF"}`, "info");
				return;
			}

			if (mode === "full") {
				const md = loadSkillMarkdown();
				if (!ctx.isIdle()) {
					ctx.ui.notify("Agent is busy — use /asd-ste full when idle", "warning");
					return;
				}
				pi.sendUserMessage(`Injecting ASD-STE100 full rules into this session. Read and apply from now on:\n\n${md}`);
				return;
			}

			if (mode === "check") {
				const text = trimmed.slice(mode.length).trim();
				if (!text) {
					ctx.ui.notify("Usage: /asd-ste check <text to check>", "warning");
					return;
				}
				loadDict();
				const hits = checkWords(text);
				if (hits.length === 0) {
					ctx.ui.notify("All words approved in STE dictionary", "info");
					return;
				}
				const lines = hits.map((h) =>
					h.alts.length > 0 ? `${h.word} (${h.pos}) -> ${h.alts.join(", ")}` : `${h.word} — not in dictionary (technical noun?)`,
				);
				ctx.ui.notify(`STE check:\n${lines.join("\n")}`, "info");
				return;
			}

			// Default: refactor args text, or the last agent message
			const text = trimmed || lastAgentText(ctx);
			if (!text.trim()) {
				ctx.ui.notify("Nothing to refactor. Usage: /asd-ste <text> (or run after a message)", "warning");
				return;
			}
			state.lastRefactorText = text;
			if (!ctx.isIdle()) {
				ctx.ui.notify("Agent is busy — ASD-STE refactor queued as follow-up", "warning");
				pi.sendUserMessage(refactorPrompt(text), { deliverAs: "followUp" });
				return;
			}
			pi.sendUserMessage(refactorPrompt(text));
		},
	});

	// Session mode: inject compact rules before every agent turn
	pi.on("before_agent_start", async (event) => {
		if (!state.sessionOn) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${STE_COMPACT}`,
		};
	});
}
