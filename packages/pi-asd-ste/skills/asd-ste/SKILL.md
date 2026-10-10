---
name: asd-ste
description: Write, edit, or check text in ASD-STE100 Simplified Technical English (Issue 9, Jan 2025). Use when asked for STE, Simplified Technical English, technical English rewrite, or to check/fix text against STE rules; also for aerospace/defence manuals, procedure steps, and safety instructions that must comply.
---

# ASD-STE100 Simplified Technical English (Issue 9)

Controlled natural language for technical documentation. Restricted grammar (Part 1) + restricted dictionary (Part 2). Write short, clear, direct sentences.

Source: ASD-STE100 Issue 9, 2025-01-15. 53 rules, 9 sections. Dictionary: 1828 words in `words.txt` beside this file.

## Procedure

1. Load the dictionary when checking words: `words.txt` lines are `word|pos|approved-alternatives` (alternatives empty = word already approved, no pos change). UPPERCASE alternative = approved STE word.
2. Rewrite or check the text against ALL rules below, section by section.
3. Fix every violation. When a word is not approved, use its approved alternative or change the sentence construction.
4. Count words per sentence: procedural max 20, descriptive max 25 (Rule 8.6/8.7 word-count rules below).
5. Report each change: non-STE word/construction → STE fix, rule number.

## Part 1 – Writing rules

### Section 1 – Words
- **1.1** Use words that are: approved in the dictionary, or technical nouns, or technical verbs.
- **1.2** Use approved words from the dictionary only as the specified part of speech.
- **1.3** Use approved words only with their approved meanings.
- **1.4** Use only the approved forms of verbs and adjectives.
- **1.5** You can use words that you can include in a technical noun category.
- **1.6** Use a word that is not approved in the dictionary, only when it is a technical noun or technical verb.
- **1.7** Do not use words that are technical nouns as verbs.
- **1.8** Use technical nouns that are approved in your company, industry, or subject field.
- **1.9** When you must select a technical noun, use one which is short and easy to understand.
- **1.10** Do not use regional, slang, or jargon words as technical nouns.
- **1.11** Do not use different technical nouns for the same item.
- **1.12** You can use verbs that you can include in a technical verb category.
- **1.13** Do not use technical verbs as nouns.
- **1.14** Use American English spelling unless other official directives tell you differently.

### Section 2 – Multi-word nouns
- **2.1** Write multi-word nouns of no more than three words.
- **2.2** When a technical noun has more than three words, write it in full (and refer to it the same way each time).

### Section 3 – Verbs
- **3.1** Use only the verb forms that are given in the dictionary.
- **3.2** Use only these verb forms and tenses: simple present (`starts`), simple past (`started`), simple future (`will start`), infinitive (`to start`), command form (`Start the engine.`), negative command (`Do not start...`).
- **3.3** Use the past participle form as an adjective (installed / `the installed pump`).
- **3.4** Do not use auxiliary verbs to make complex verb constructions (no `is starting`, `has been started`, `will be starting`).
- **3.5** Use the "-ing" form (gerund) only as a technical noun or as a modifier in a technical noun (`the landing gear`, `the existing file`). No `is starting`, `he is checking`.
- **3.6** Use the active voice. In descriptive writing, you can use the passive voice only when the object of the action is more important than the agent.
- **3.7** Use an approved verb to describe an action, not a noun or other parts of speech (`Oil lubricates the gear`, not `lubrication of the gear by oil`).

### Section 4 – Sentences
- **4.1** Write short and clear sentences.
- **4.2** Do not omit words (such as "that") or use contractions (`don't`, `it's`) to make your sentences shorter.
- **4.3** Use a vertical list for complex text.
- **4.4** Use connecting words and connecting phrases to connect sentences that contain related information (`but`, `because`, `then`, `as a result`).
- **4.5** When applicable, use an article (the, a, an) or a demonstrative adjective (this, these) before a noun.

### Section 5 – Procedural writing
- **5.1** Write short sentences. Use a maximum of 20 words in each sentence.
- **5.2** Write only one instruction in each sentence unless two or more actions occur at the same time.
- **5.3** Write instructions in the imperative (command) form (`Press the button.`).
- **5.4** When there is a condition that the reader must know about first, start the instruction with the condition (`If the light comes on, ...`).
- **5.5** Write notes only to give information, not instructions.

### Section 6 – Descriptive writing
- **6.1** Give information gradually.
- **6.2** Use key words and key phrases to give your text a logical structure.
- **6.3** Write short sentences. Use a maximum of 25 words in each sentence.
- **6.4** Use paragraphs to show related information.
- **6.5** Make sure that each paragraph has only one topic.
- **6.6** Make sure that no paragraph has more than six sentences.

### Section 7 – Safety instructions
- **7.1** Use an applicable word (for example, "warning" or "caution") to identify the level of risk.
- **7.2** Start a safety instruction with a clear and accurate command or condition.
- **7.3** Give an explanation to show the risk or possible result.

### Section 8 – Punctuation and word count
- **8.1** You can use all standard English punctuation marks but not the semicolon (;).
- **8.2** Use hyphens (-) to connect words that are directly related (`on-off switch`).
- **8.3** You can use parentheses: (1) around letters or numbers that show sequence, (2) around an example, (3) around an explanation that is not necessary.
- **8.4** In a vertical list, a colon (:) has the same effect on word count as a period and shows the end of a sentence.
- **8.5** When you put text in parentheses, it counts as one word in that sentence.
- **8.6** Count each of these elements as one word: numbers, numbers together with units of measurement (`10 knots` = 1 word), abbreviations, alphanumeric identifiers (`36L7`, `No. 1`), quoted text, titles/headings/text on placards and labels, proper nouns.
- **8.7** Hyphenated words count as one word.

### Section 9 – Writing practices
- **9.1** Use a different sentence construction when a word-for-word replacement is not possible.
- **9.2** Use each approved word correctly.
- **9.3** When you use two words together, do not make phrasal verbs (`turn on` → `on` is not approved; use `Start the engine.`).
- **9.4** When you select terminology or wording, always use a consistent style.

## Dictionary quick check

`words.txt`: `word|pos|alts`. Lowercase word = NOT approved. UPPERCASE word = approved. Use alts (approved) or change the sentence.

Examples: `abandon|v|GO,STOP` → do not use "abandon", use GO or STOP. `ability|n|CAN` → do not use "ability", use CAN (v). `abaft|prep|OF,AFT` → use AFT OF.

## Recurring errors (most frequent)

| Non-STE | STE |
|---|---|
| acceptable (adj) | PERMITTED (adj) |
| alternate (adj) | ALTERNATIVE (adj) |
| any (adj) | None or a different sentence construction |
| avoid (v) | PREVENT (v) |
| both (adj) | THE TWO (TN) |
| check (v) | CHECK (n) |
| cover (v) | COVER (TN) |
| complete (adj) | COMPLETED (adj) |
| damage (v) | DAMAGE (n) |
| ensure (v) | MAKE SURE (v) |
| fit (v) | INSTALL (v) |
| follow (v) | OBEY (v) |
| further (adj) | MORE (adj) |
| further (adv) | MORE (adv) |
| have to (v) | Use an action verb in the imperative form |
| however (adv) | BUT (conj) |
| insert (v) | PUT (v) |
| main (adj) | PRIMARY (adj) |
| may (v) | CAN (v) |
| need (v) | NECESSARY (adj) |
| now (adv) | AT THIS TIME |
| old (adj) | REMAINING (adj), USED (adj), EXPIRED (adj) |
| over (prep) | ABOVE (prep), ON (prep), ALONG (prep) |
| people (n) | PERSON (n), PERSONNEL (n) |
| perform (v) | DO (v) |
| portion (n) | PART (n) |
| press (v) | PUSH (v) |
| reach (v) | GET (v) |
| repeat (v) | DO (v) … AGAIN |
| required (v) | NECESSARY (adj) |
| rotate (v) | TURN (v) |
| secure (v) | ATTACH (v), SAFETY (v) |
| shall (v) | MUST (v) |
| should (v) | MUST (v) |
| since (conj) | BECAUSE (conj) |
| test (v) | TEST (n) |
| therefore (adv) | THUS (adv), AS A RESULT |
| under (prep) | BELOW (prep), IN (prep), LESS THAN |
| using (v) | USE (v), WITH (prep) |

## Approved verbs (quick list)

A: ACTIVATE, ADAPT, ADD, ADJUST, AGREE, ALIGN, APPLY, ARM, ASSEMBLE, ATTACH · B: BALANCE, BE, BECOME, BEND, BLEED, BLOW, BOND, BREAK, BREATHE, BURN, BYPASS · C: CALCULATE, CALIBRATE, CAN, CANCEL, CANNOT, CATCH, CAUSE, CHANGE, CHARGE, CLEAN, CLOSE, COLLECT, COME, COME ON, COMPARE, COMPLETE, COMPRESS, CONNECT, CONTACT, CONTAIN, CONTINUE, CONTROL, CONVERT, CORRECT, COUNT, CUT · D: DEACTIVATE, DECREASE, DE-ENERGIZE, DEFLATE, DEFUEL, DEPLOY, DISARM, DISASSEMBLE, DISCARD, DISCONNECT, DISENGAGE, DIVIDE, DO, DRAIN, DRINK, DRY · E: EAT, EJECT, ENERGIZE, ENGAGE, ERASE, ERASE, EXPAND, EXTEND, EXTINGUISH · F: FALL, FEATHER, FEEL, FILL, FIND, FIRE, FLASH, FLOW, FLUSH, FOLD, FOLLOW, FREEZE · G: GIVE, GO, GO OFF, GROUND · H: HANG, HAVE, HEAR, HELP, HIT, HOLD · I: IDENTIFY, IGNORE, ILLUMINATE, INCLUDE, INCREASE, INFLATE, INSTALL, INTERCHANGE, ISOLATE · K: KEEP, KILL, KNOW · L: LATCH, LET, LIFT, LISTEN, LOCK, LOOK, LOOSEN, LOWER, LUBRICATE · M: MAKE, MAKE SURE, MEASURE, MELT, MIX, MONITOR, MOOR, MOVE, MULTIPLY, MUST · O: OBEY, OCCUR, OPEN, OPERATE, OVERRIDE · P: PAINT, PARK, POINT, POLISH, PREPARE, PRESSURIZE, PREVENT, PROTRUDE, PULL, PUSH, PUT, PUT ON · Q-R: READ, RECEIVE, RECOMMEND, RECORD, RECYCLE, REFER, REFUEL, REJECT, RELEASE, REMOVE, REPAIR, REPLACE, RETRACT, RUB, RECYCLE · S: SAFETY, SCHEDULE, SEAL, SEE, SELECT, SEND, SENSE, SET, SHAKE, SHOW, SIMULATE, SMELL, SMOKE, SOAK, SPEAK, SPILL, SPRAY, START, STAY, STOP, STOW, SUBTRACT, SUPPLY, SWALLOW · T: TAG, TAP, TELL, THINK, TIGHTEN, TILT, TORQUE, TOUCH, TOW, TRANSMIT, TRY, TUNE, TURN, TWIST · U: UNFOLD, UNLOCK, UNWIND, USE · V-W: WAIT, WALK, WANT, WEAR, WEIGH, WILL, WIND, WRITE · X-Y-Z: (none)

## Word-count rules (quick)

- Number = 1 word (`13`, `twenty-one`). Number + unit = 1 word (`10 knots`, `10 °C`, `10 degrees Celsius`). Abbreviation = 1 word (`NASA`, `VPN`, `a.m.` with its number). Alphanumeric identifier = 1 word (`36L7`, `No. 1`). Quoted text = 1 word. Title/placard/label text = 1 word. Proper noun = 1 word. Hyphenated word = 1 word. `(1)` or `(a)` = 1 word.
- Procedural sentence: max 20 words. Descriptive sentence: max 25 words. Paragraph: max 6 sentences, 1 topic.

## Examples

Non-STE: `Before you rotate the shaft, make sure that you remove the locking device.`
STE: `Before you turn the shaft, make sure that you remove the locking device.` (rotate → TURN)

Non-STE: `The landing gear is able to retract automatically.`
STE: `The landing gear can retract automatically.` (able → CAN, -ly adverb → automatic form: `automatically` is approved? check words.txt; if not: `The landing gear can retract by itself.`)

Non-STE: `Ensure the bolts are secure.`
STE: `Make sure the bolts are tight.` (ensure → MAKE SURE, secure → TIGHT/CORRECTLY)

Non-STE: `Using the control, adjust the mirror.`
STE: `Use the control to adjust the mirror.` (using → USE)

Non-STE: `Avoid pressing the button repeatedly.`
STE: `Do not push the button again and again.` (avoid → PREVENT or restructure, press → PUSH, repeat → DO AGAIN)

## Pitfalls

- `-ing` words: only as technical noun (`landing gear`) or modifier (`existing file`). Never `is running`, `will be starting`.
- No semicolons. No contractions (`don't` → `do not`). No `shall/should/may` → MUST/CAN.
- No `before/after` + `-ing` (`before starting` → `before you start`).
- Active voice in procedural writing. Passive only in descriptive writing when object more important.
- One instruction per sentence. Condition first: `If X, do Y.`
- Keep multi-word nouns max 3 words. Use articles (`the`, `a`) before nouns.
- American English spelling.
