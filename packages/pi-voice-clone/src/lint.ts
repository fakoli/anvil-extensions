// Mechanical hard-rule linter for voice-clone drafts.
//
// Phrase lists are synced with assets/style-grammar.md (the ONLY hand-authored
// rule layer in the corpus). Filler pleasantries beyond the grammar's named
// example are covered by its rule 6 ("No filler pleasantries. Never 'I hope
// this email finds you well.'") — same category, same authority. This linter
// enforces the *reliably mechanical* subset; the judgment-based rules (numbers
// over adjectives on real claims, register mixing, surface-roughness
// calibration) are surfaced as reminders, never fabricated into violations.
//
// Returns findings with severity: "violation" (hard rule broken — fix before
// delivering) or "warning" (heuristic or reminder — read and judge).

export type Severity = "violation" | "warning";

export interface Finding {
  severity: Severity;
  rule: string;
  detail: string;
  evidence?: string;
}

// The 10 cloneable registers (vault scaffolding excluded — clone.py refuses them).
export const KNOWN_REGISTERS = [
  "professional-narrative",
  "formal-gracious",
  "formal-assertive",
  "work-email",
  "technical-prose",
  "internal-telegraphic",
  "interview-notes",
  "work-notes",
  "personal-reflective",
  "presentation-outline",
] as const;

const FILLER_PLEASANTRIES = [
  "i hope this email finds you well",
  "i hope you are doing well",
  "i hope all is well",
  "i hope this message finds you well",
  "trust this email finds you well",
  "i wanted to reach out",
  "i just wanted to check in",
];

const PUFFERY = [
  "seamless",
  "cutting-edge",
  "state of the art",
  "state-of-the-art",
  "world-class",
  "game-changing",
  "revolutionary",
  "next-generation",
  "industry-leading",
  "best-in-class",
  "unparalleled",
  "innovative solutions",
  "synergy",
  "leverage synergies",
];

// A sentence carrying two or more DISTINCT hedge tokens reads as a hedging
// stack. Phrases overlap ("it may be worth" contains "worth") — longer phrases
// subsume shorter ones; keep the list non-overlapping.
const HEDGE_TOKENS = [
  "might",
  "possibly",
  "perhaps",
  "potentially",
  "maybe",
  "it may be worth",
  "i think maybe",
  "sort of",
  "kind of",
];

// "I" + passive participle patterns (heuristic — flagged as warning only,
// because rare legitimate uses exist, e.g. "I was hired").
const SELF_PASSIVE_PATTERNS: RegExp[] = [
  /\bI\s+(?:was|am|have\s+been|had\s+been|would\s+be)\s+\w+(?:ed|en)\b/g,
  /\b(?:my|our)\s+\w+\s+(?:was|were|has\s+been|have\s+been)\s+\w+ed\b/g,
];

// Register-specific close rules (style-grammar.md "Register-specific rules").
const FORMAL_CLOSES = ["With Gratitude,", "Kind regards,", "Sincerely yours,", "Sincerely,"];

const REGISTER_RULES: Record<
  string,
  { close: "required" | "question" | "none"; label: string }
> = {
  "formal-gracious": { close: "required", label: "signature close (\"With Gratitude,\" / \"Kind regards,\" / \"Sincerely yours,\")" },
  "formal-assertive": { close: "required", label: "single declarative bottom line + deadline reminder" },
  "professional-narrative": { close: "none", label: "n/a (letters close naturally)" },
  "work-email": { close: "question", label: "low-pressure closing question" },
  "technical-prose": { close: "none", label: "n/a (ends on mechanism/next step — judge yourself)" },
};

const FORMAL_LETTER_REGISTERS = new Set(["formal-gracious", "formal-assertive", "professional-narrative"]);
const LAST_LINES_FOR_CLOSE = 6;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function lastMeaningfulLines(text: string, n: number): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(-n)
    .join("\n");
}

function snippet(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 20), end + 20).replace(/\s+/g, " ");
}

export function lintVoice(text: string, register: string): Finding[] {
  const findings: Finding[] = [];
  if (!text.trim()) return [{ severity: "violation", rule: "empty", detail: "Draft is empty." }];

  // Register guard: typo'd or unknown names must fail loud, not silently skip
  // the register-specific checks below.
  const known = (KNOWN_REGISTERS as readonly string[]).includes(register);
  if (!known) {
    findings.push({
      severity: "warning",
      rule: "unknown-register",
      detail:
        `"${register}" is not a known cloneable register — register-specific checks (close, em-dash restraint) were SKIPPED. ` +
        `Known registers: ${KNOWN_REGISTERS.join(", ")}. Check for typos (e.g. work_email vs work-email).`,
    });
  }

  // 1. Zero exclamation marks (style-grammar rule 1; corpus has exactly one
  //    "Eat !!!" — a lunch slot marker in raw capture notes, not outbound prose).
  const bangs = (text.match(/!/g) ?? []).length;
  if (bangs > 0) {
    const line = text.split("\n").find((l) => l.includes("!"));
    findings.push({
      severity: "violation",
      rule: "no-exclamation-marks",
      detail: `${bangs} exclamation mark(s) — the corpus contains exactly one, in raw capture notes ("Eat !!!"). Zero allowed in drafts.`,
      evidence: line?.trim().slice(0, 120),
    });
  }

  // 2. No filler pleasantries (style-grammar rule 6) — report every instance.
  const lower = text.toLowerCase();
  for (const phrase of FILLER_PLEASANTRIES) {
    let idx = lower.indexOf(phrase);
    while (idx >= 0) {
      findings.push({
        severity: "violation",
        rule: "no-filler-pleasantries",
        detail: `Filler pleasantry present ("${phrase}") — he never uses them; open with substance.`,
        evidence: snippet(text, idx, idx + phrase.length),
      });
      idx = lower.indexOf(phrase, idx + phrase.length);
    }
  }

  // 3. No adjective puffery — quantify instead. Report every puffery word.
  for (const word of PUFFERY) {
    const re = new RegExp(`\\b${word.replace(/ /g, "\\s+")}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      findings.push({
        severity: "violation",
        rule: "numbers-over-adjectives",
        detail: `Marketing puffery ("${m[0]}") — say what the thing does and how much.`,
      });
    }
  }

  // 4. No hedging stacks (two distinct hedge tokens in one sentence).
  for (const s of sentences(text)) {
    const low = s.toLowerCase();
    const hits = HEDGE_TOKENS.filter((h) => low.includes(h));
    if (hits.length >= 2) {
      findings.push({
        severity: "violation",
        rule: "no-hedging-stacks",
        detail: `Hedging stack (${hits.join(", ")}) in one sentence — be direct.`,
        evidence: s.slice(0, 160),
      });
    }
  }

  // 5. Passive voice for his own actions (heuristic → warning, first hit only).
  for (const re of SELF_PASSIVE_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      findings.push({
        severity: "warning",
        rule: "i-active-verb",
        detail: `Possible passive voice for own action ("${m[0]}") — he uses "I" + active verb. Confirm this is not his action being passivized.`,
      });
      break;
    }
  }

  // 6. Register close (skipped for unknown registers — flagged above).
  const rule = known ? REGISTER_RULES[register] : undefined;
  if (rule?.close === "required") {
    const tail = lastMeaningfulLines(text, LAST_LINES_FOR_CLOSE);
    const hasClose = FORMAL_CLOSES.some((c) => tail.toLowerCase().includes(c.toLowerCase()));
    if (!hasClose && register === "formal-gracious") {
      findings.push({
        severity: "violation",
        rule: "register-close",
        detail: `formal-gracious requires his signature close in the final lines: ${FORMAL_CLOSES.join(" / ")}`,
        evidence: tail.slice(-200),
      });
    }
    if (!hasClose && register === "formal-assertive") {
      // formal-assertive closes on a declarative bottom line, not a greeting
      // close — only warn; the shape can't be verified mechanically.
      findings.push({
        severity: "warning",
        rule: "register-close",
        detail: "formal-assertive should end on a single declarative bottom line (+ deadline if applicable) — verify manually.",
        evidence: tail.slice(-200),
      });
    }
  }
  if (rule?.close === "question") {
    const tail = lastMeaningfulLines(text, 3);
    if (!tail.includes("?")) {
      findings.push({
        severity: "violation",
        rule: "register-close",
        detail: "work-email should close with a low-pressure question (his habitual move).",
        evidence: tail.slice(-200),
      });
    }
  }

  // 7. Em-dash chains in formal letters (he uses them ~never there).
  if (known && FORMAL_LETTER_REGISTERS.has(register)) {
    const dashes = (text.match(/—/g) ?? []).length;
    if (dashes >= 3) {
      findings.push({
        severity: "warning",
        rule: "em-dash-restraint",
        detail: `${dashes} em-dashes — he uses them ~never in formal letters; prefer commas or full stops.`,
      });
    }
  }

  // 8. Judgment-based reminders (never fabricated into violations).
  findings.push({
    severity: "warning",
    rule: "self-check-remaining",
    detail:
      "Model/human judgment items: numbers over adjectives on every real claim; one register per piece (no mixing); " +
      "surface roughness is authentic in capture registers (interview-notes, work-notes, internal-telegraphic) but substance stays rigorous; " +
      "names the people when names are known; never import corpus facts (employers, metrics, credentials) — facts come from the task only.",
  });

  return findings;
}

export function formatFindings(findings: Finding[]): string {
  const lines = findings.map((f) => {
    const tag = f.severity === "violation" ? "VIOLATION" : "warning";
    const ev = f.evidence ? `\n  evidence: ${f.evidence}` : "";
    return `- [${tag}] ${f.rule}: ${f.detail}${ev}`;
  });
  return `voice_check: ${findings.filter((f) => f.severity === "violation").length} violation(s), ` +
    `${findings.filter((f) => f.severity === "warning").length} warning(s)\n${lines.join("\n")}`;
}