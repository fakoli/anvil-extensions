# pi-voice-clone

Pi coding-agent extension bridging a **privately-owned voice style-clone
plugin** into pi, so any pi session can draft or voice-edit prose in the
owner's measured voice — documents, emails, outreach, notes, talk scripts.

The heavy lifting stays in the private plugin (a `SKILL.md` +
`scripts/clone.py` + `assets/` skill directory kept outside this repo, also
installable as a pi skill via the `skills` setting). This extension adds the
pi-native ergonomics a file-based plugin can't do on other hosts:

| Surface | Kind | What it does |
|---|---|---|
| `voice_prompt` | tool | Assembles the measured voice prompt via `clone.py` — register profile + 2–3 real documents as few-shot style references + hard style rules. The model calls this *before* drafting. |
| `voice_check` | tool | Mechanical lint of a draft against the owner's hard rules: zero exclamation marks, no filler pleasantries ("I hope this email finds you well"), no marketing puffery ("seamless"), no hedging stacks, passive-voice-for-self heuristic, register-specific close ("With Gratitude," / low-pressure question), em-dash restraint. VIOLATIONs must be fixed before delivery. |
| `/voice <register> <task>` | command | One-step draft: assembles the prompt and hands the job straight to the agent. `/voice list` enumerates registers. |

## Registers

The register inventory is corpus-defined. The plugin this extension was built
against ships ten cloneable registers (`professional-narrative`,
`formal-gracious`, `formal-assertive`, `work-email`, `technical-prose`,
`internal-telegraphic`, `interview-notes`, `work-notes`,
`personal-reflective`, `presentation-outline`); vault scaffolding registers
are refused by `clone.py`. `voice_prompt` with `listRegisters: true` (or
`/voice list`) enumerates whatever your corpus defines.

## Configuration

The extension needs the path to the private skill directory:

```
VOICE_SKILL_DIR=~/code/voice-clone/skills/voice-clone
```

Default (unset): `~/code/voice-clone/skills/voice-clone`. Errors are loud and
fixable when the path is missing or `clone.py` can't be found. Requires
`python3` on PATH (the plugin's scripts are stdlib-only Python 3.10+; a
missing interpreter surfaces at the first tool call). The corpus is **never**
vendored into this repo — the extension is path-plumbing only.

## Tests

```bash
cd packages/pi-voice-clone && node tests/run-tests.mjs
```

Clone-path tests run against a synthetic fixture skill dir; the private corpus
is never touched by tests.

## Privacy contract

- The corpus and assembled prompts contain the owner's private writing.
  Assembled prompts flow to two places by design: the configured LLM provider
  (as drafting context — that is the point of style-clone) and local pi
  session files. They must never reach third-party services, public repos, or
  exported logs.
- Facts for a draft come exclusively from the current task (`facts` param);
  corpus examples are style evidence and never evidence about the current task.
- High-stakes outbound documents (applications, disputes, public posts) stop
  at "ready for your read" — pi never sends or submits on the owner's behalf.