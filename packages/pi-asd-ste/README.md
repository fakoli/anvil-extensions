# pi-asd-ste

ASD-STE100 Simplified Technical English (Issue 9, Jan 2025) for Pi. Write, refactor, and check technical text against the 53 STE writing rules and 1828-word dictionary.

## Install

```bash
pi install github.com/fakoli/anvil-extensions/packages/pi-asd-ste
```

## Commands

- `/asd-ste` — refactor the last agent message in ASD-STE100 Simplified Technical English
- `/asd-ste <text>` — refactor any text now
- `/asd-ste on` — session mode: inject compact STE rules before every agent turn
- `/asd-ste off` — turn session mode off
- `/asd-ste full` — inject all 53 rules + dictionary into the session once
- `/asd-ste check <text>` — check words against the STE dictionary, report non-STE words with approved alternatives

## Skill

The bundled `asd-ste` skill owns the rules and dictionary:

- `skills/asd-ste/SKILL.md` — 53 writing rules, 40 recurring errors, approved verbs, word-count rules, examples
- `skills/asd-ste/words.txt` — 1828 words, `word|pos|approved-alternatives` (UPPERCASE alternative = approved STE word)

Pi loads the skill on "STE", "Simplified Technical English", or aerospace manual text; the extension injects the format into any session on demand.

## Examples

```
/asd-ste Before you rotate the shaft, ensure that you remove the locking device.
```

Rewrites: `Before you turn the shaft, make sure that you remove the locking device.` (rotate → TURN, ensure → MAKE SURE)

```
/asd-ste check Ensure the bolts are secure and avoid pressing the button repeatedly.
```

Reports: `ensure (v) -> SURE, MAKE SURE`, `avoid (v) -> PREVENT`, `press (v) -> PUSH`…

## Word-count rules

- Number + unit = 1 word (`10 knots`). Abbreviation = 1 word (`NASA`). Alphanumeric id = 1 word (`36L7`). Quoted text = 1 word. Hyphenated word = 1 word.
- Procedural sentence: max 20 words. Descriptive: max 25. Paragraph: max 6 sentences, 1 topic.

## Source

ASD-STE100 Issue 9 (2025-01-15) converted from https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
