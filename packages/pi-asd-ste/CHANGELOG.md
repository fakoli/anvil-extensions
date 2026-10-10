# Changelog

## 0.1.0

- Initial: `/asd-ste` command — refactor text, inject the 53-rule STE format into sessions, check words against the 1828-word dictionary.
- `/asd-ste on|off` session mode: inject compact STE rules before every agent turn.
- `/asd-ste full` inject all 53 rules + dictionary into the session once.
- `/asd-ste check <text>` deterministic word-check, no LLM: report non-STE words with approved alternatives.
- Bundle: `skills/asd-ste` (SKILL.md 53 rules + words.txt 1828 words), `src/dict.ts` word-check engine.
- Converted from ASD-STE100 Issue 9 (2025-01-15) PDF.
