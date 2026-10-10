# pi-asd-ste — upstream provenance

- Package: pi-asd-ste v0.1.0 (2026-10-10)
- Status: **original** — converted from a controlled-language standard, not ported from a plugin
- Source: ASD-STE100 Simplified Technical English, Issue 9 (2025-01-15)
- Source license: ASD © 2025, all rights reserved; special usage rights category 8
  (universities and research institutes for educational purposes) — see LICENSE-ASD-STE100.md
- Source URL: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf

## What was converted

Part 1 – Writing rules: all 53 rules, 9 sections (words, multi-word nouns,
verbs, sentences, procedural writing, descriptive writing, safety
instructions, punctuation and word count, writing practices) — distilled to
SKILL.md with recurring-errors list (40 rows), approved-verbs list (168
verbs), word-count rules, and 5 rewrite examples.

Part 2 – Dictionary: 1828 word entries parsed from the 2-column PDF layout
(word, part of speech, approved alternatives) into `words.txt`
(`word|pos|approved-alternatives`, UPPERCASE alternative = approved STE).
3 parse passes: pos-tagged anchors, indented rows, split-word entries.

## What was added

- `src/dict.ts` — deterministic word-check engine (no LLM for lookup):
  exact, lowercase, -s/-ed/-ing strip; be-forms always approved;
  lowercase word = NOT approved, UPPERCASE = approved.
- `/asd-ste` extension command: refactor text, inject the 53-rule format
  into any session, check words, toggle session mode.
