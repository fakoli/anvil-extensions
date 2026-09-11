// Resolve the voice-clone skill directory (private corpus home).
//
// The corpus is the owner's private writing and is NEVER vendored into this
// extension or any other repo. The extension only needs a path to the
// installed skill directory (a private clone of a style-clone plugin with the
// standard layout: SKILL.md + scripts/clone.py + assets/):
//
//   VOICE_SKILL_DIR  >  default ~/code/voice-clone/skills/voice-clone
//
// The default is a conventional location; owners of a private corpus set
// VOICE_SKILL_DIR to the real clone. Fail loudly (typed error) when the
// directory is missing so callers see a fixable message instead of a silent
// empty result.
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_SKILL_DIR = "~/code/voice-clone/skills/voice-clone";

export interface SkillDirInfo {
  skillDir: string;
  clonePy: string;
  assetsDir: string;
}

export class SkillDirError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillDirError";
  }
}

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/** Resolve + validate the skill dir. Throws SkillDirError with a fixable message. */
export function resolveSkillDir(): SkillDirInfo {
  const raw = process.env.VOICE_SKILL_DIR?.trim() || DEFAULT_SKILL_DIR;
  const skillDir = expandHome(raw);
  if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    throw new SkillDirError(
      `voice-clone skill dir not found: ${skillDir}\n` +
      `Set VOICE_SKILL_DIR to the directory containing SKILL.md (your private ` +
      `style-clone plugin clone, layout: skills/<name>/SKILL.md + scripts/clone.py).`
    );
  }
  const clonePy = join(skillDir, "scripts", "clone.py");
  if (!existsSync(clonePy)) {
    throw new SkillDirError(
      `clone.py missing at ${clonePy} — VOICE_SKILL_DIR must point at the ` +
      `skill directory (the one containing SKILL.md), not its parent.`
    );
  }
  return { skillDir, clonePy, assetsDir: join(skillDir, "assets") };
}