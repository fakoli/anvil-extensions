// ASD-STE100 Simplified Technical English — deterministic word-check engine.
// Loads words.txt (word|pos|approved-alternatives) once, checks text words,
// and reports non-STE words with their approved alternatives.
// Rules and LLM fallback live in refactor.ts; this file never calls a model.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

export interface WordEntry {
	word: string;
	pos: string;
	alts: string[];
}

export interface WordHit {
	word: string;
	pos: string;
	alts: string[];
}

let dict: Map<string, WordEntry> | null = null;

export function skillDir(): string {
	// realpath: extension may load through a symlink (.pi/extensions/asd-ste.ts)
	const real = realpathSync(path.dirname(fileURLToPath(import.meta.url)));
	return path.join(real, "..", "skills", "asd-ste");
}

/** Package-relative skill path for LLM prompts (works from any install dir). */
export function skillPromptPath(): string {
	return path.join(skillDir(), "SKILL.md");
}

export function wordsPath(): string {
	return path.join(skillDir(), "words.txt");
}

export function loadDict(): Map<string, WordEntry> {
	if (dict) return dict;
	dict = new Map();
	const file = path.join(skillDir(), "words.txt");
	if (fs.existsSync(file)) {
		for (const line of fs.readFileSync(file, "utf8").split("\n")) {
			const parts = line.split("|");
			if (parts.length < 2) continue;
			const [word, pos, altsRaw] = parts;
			dict.set(word.toUpperCase(), {
				word,
				pos,
				alts: altsRaw ? altsRaw.split(",").filter(Boolean) : [],
			});
		}
	}
	return dict;
}

const STRIP = /^[^a-zA-Z0-9-]+|[^a-zA-Z0-9-]+$/g;

/** Split text into checkable words (strip punctuation, keep hyphens). */
export function words(text: string): string[] {
	return text
		.split(/\s+/)
		.map((w) => w.replace(STRIP, ""))
		.filter((w) => w.length > 0 && /[a-zA-Z]/.test(w));
}

const BE_FORMS = new Set(["AM", "IS", "ARE", "WAS", "WERE", "BE", "BEEN", "BEING"]);
const EMPTY_ENTRY: WordEntry = { word: "", pos: "", alts: [] };

/** Check one word: exact, then lowercase, then strip trailing -s/-ed. Returns entry when approved. */
export function lookup(word: string): WordEntry | null {
	const d = loadDict();
	const up = word.toUpperCase();
	// be-forms: always approved (Rule 3.2 simple present/past of "be")
	if (BE_FORMS.has(up)) return EMPTY_ENTRY;
	if (d.has(up)) return d.get(up)!;
	const lower = word.toLowerCase();
	if (d.has(lower.toUpperCase())) return d.get(lower.toUpperCase())!;
	for (const suffix of ["S", "ED", "ING", "D"]) {
		if (word.length > suffix.length + 2 && word.slice(-suffix.length).toUpperCase() === suffix && d.has(up.slice(0, -suffix.length))) {
			return d.get(up.slice(0, -suffix.length))!;
		}
	}
	return null;
}

/** Words in text that are not approved: not in dict, or lowercase (non-STE) with alternatives. */
export function checkWords(text: string): WordHit[] {
	const hits: WordHit[] = [];
	const seen = new Set<string>();
	for (const w of words(text)) {
		const key = w.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const entry = lookup(w);
		if (!entry) {
			// Unknown: not in dictionary — report as technical-noun candidate
			hits.push({ word: w, pos: "?", alts: [] });
			continue;
		}
		// dict.json: lowercase word = NOT approved, UPPERCASE = approved; empty = be-form ok
		if (entry.word && entry.word[0] === entry.word[0].toLowerCase()) {
			hits.push({ word: entry.word, pos: entry.pos, alts: entry.alts });
		}
	}
	return hits;
}

/** Compact one-line rules digest — injected into the session by /asd-ste. */
export const STE_RULES_DIGEST = `ASD-STE100 Simplified Technical English (Issue 9) ACTIVE. Skill: ${skillPromptPath()} + words.txt (word|pos|approved-alternatives, UPPERCASE=approved).
CORE RULES: 1.1-1.14 approved words only / tech-nouns ok / no noun-as-verb / American spelling. 2.1-2.2 multi-word nouns max 3 words. 3.1-3.7 verb forms: simple present/past/future, present perfect, infinitive, command, negative command ONLY; no auxiliary verbs (no is starting/has been started); -ing only as tech-noun or modifier; ACTIVE voice (passive only descriptive, object more important); verb not noun for actions. 4.1-4.5 short clear sentences; no omissions/contractions (don't -> do not); vertical lists for complex text; connecting words ok; article/demonstrative before noun. 5.1-5.5 procedural: max 20 words/sentence; ONE instruction per sentence; imperative form; condition first (If X, do Y.); notes give info not instructions. 6.1-6.6 descriptive: info gradually; key words structure; max 25 words/sentence; paragraphs related info; 1 topic/paragraph; max 6 sentences/paragraph. 7.1-7.3 safety: warning/caution word; clear command or condition first; explanation shows risk. 8.1-8.7 all punctuation EXCEPT semicolon; hyphens connect related words; parentheses ok (sequence, example, explanation); text in () = 1 word; numbers+units=1 word (10 knots); abbreviations=1 word; alphanumeric ids=1 word (36L7); quoted text=1 word; hyphenated words=1 word. 9.1-9.4 different construction when word-for-word fails; use approved words correctly; no phrasal verbs; consistent style.
TOP SWAPS: ensure->MAKE SURE, avoid->PREVENT, check(v)->CHECK(n), damage(v)->DAMAGE(n), fit(v)->INSTALL, follow->OBEY, insert->PUT, main->PRIMARY, may/should/shall->MUST/CAN, need->NECESSARY, now->AT THIS TIME, old->REMAINING/USED/EXPIRED, over->ABOVE/ON/ALONG, people->PERSON/PERSONNEL, perform->DO, portion->PART, press->PUSH, reach->GET, repeat->DO AGAIN, rotate->TURN, secure->ATTACH/SAFETY, test(v)->TEST(n), therefore->THUS, under->BELOW/IN/LESS THAN, using->USE/WITH, acceptable->PERMITTED, complete(adj)->COMPLETED, further->MORE, however->BUT.`;

/** Full SKILL.md content — injected by /asd-ste full. */
export function loadSkillMarkdown(): string {
	const file = path.join(skillDir(), "SKILL.md");
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

/** Compact before-every-turn block — 1/3 of the digest, rules only. */
export function steCompact(): string { return `ASD-STE100 Simplified Technical English (Issue 9) ACTIVE. Write ALL text in STE: short clear sentences (procedural max 20 words, descriptive max 25), ONE instruction per sentence, imperative form, condition first, active voice, no contractions (do not), no semicolons, no auxiliary verbs (no is starting), -ing only as tech-noun, articles before nouns (the/a), multi-word nouns max 3 words. Approved words only — dictionary: ${wordsPath()} (word|pos|alts). Top swaps: ensure->MAKE SURE, avoid->PREVENT, insert->PUT, main->PRIMARY, may/should/shall->MUST/CAN, need->NECESSARY, now->AT THIS TIME, over->ABOVE, perform->DO, press->PUSH, reach->GET, repeat->DO AGAIN, using->USE. Full rules: ${skillPromptPath()}`; }
