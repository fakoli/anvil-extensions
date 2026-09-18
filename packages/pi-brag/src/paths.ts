// Package/skill path resolution and bundled-asset inventory.
//
// The upstream brag plugin vendors ~16.5 MB of music + SFX inside the skill.
// We deliberately do NOT vendor them (bundle size + unclear redistribution
// license for the music); the assets dir starts empty and `brag_fetch_assets`
// fills it from the upstream repo. The skill degrades gracefully with
// --no-music / --no-sfx when assets are absent.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url); // <pkg>/src/paths.ts
export const PACKAGE_ROOT = resolve(dirname(THIS_FILE), "..");
export const SKILL_DIR = join(PACKAGE_ROOT, "skills", "brag");
export const SKILL_ENTRY = join(SKILL_DIR, "SKILL.md");
export const DEFAULT_ASSETS_DIR = join(SKILL_DIR, "assets");

export interface AssetInventory {
  assetsDir: string;
  /** True when the assets directory exists at all. */
  present: boolean;
  /** Music file names (any extension) directly under assets/music. */
  music: string[];
  /** SFX subdirectory names that contain at least one file. */
  sfxDirs: string[];
  /** Total number of files across all SFX subdirectories. */
  sfxFiles: number;
  /** Music-cue JSON file names under assets/cues. */
  cues: string[];
  /** True when assets/sfx-analysis.md exists. */
  hasSfxAnalysis: boolean;
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => {
      try {
        return statSync(join(dir, name)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => {
      try {
        return statSync(join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

export function inventoryAssets(assetsDir: string = DEFAULT_ASSETS_DIR): AssetInventory {
  const present = existsSync(assetsDir);
  const musicDir = join(assetsDir, "music");
  const sfxDir = join(assetsDir, "sfx");
  // Upstream layout: cue files live in music/cues/, the SFX selection guide
  // in sfx/sfx-analysis.md.
  const cuesDir = join(musicDir, "cues");
  const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".wav", ".flac", ".m4a", ".aac", ".opus"];

  // Only actual audio files count as tracks — README.md and the cues/
  // subdirectory live in music/ too.
  const music = present
    ? listFiles(musicDir).filter((n) => AUDIO_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)))
    : [];
  const sfxDirs: string[] = [];
  let sfxFiles = 0;
  for (const name of present ? listDirs(sfxDir) : []) {
    const count = listFiles(join(sfxDir, name)).length;
    if (count > 0) {
      sfxDirs.push(name);
      sfxFiles += count;
    }
  }
  const cues = present ? listFiles(cuesDir).filter((n) => n.endsWith(".music-cues.json")) : [];
  const hasSfxAnalysis = present && existsSync(join(sfxDir, "sfx-analysis.md"));

  return { assetsDir, present, music, sfxDirs, sfxFiles, cues, hasSfxAnalysis };
}

/**
 * Standard skill directories scanned for the engine's domain skills
 * (hyperframes-core, hyperframes-animation, ...). Includes the legacy
 * harness path because skills installed there are still readable files.
 */
export function domainSkillSearchDirs(home: string, cwd: string): string[] {
  return [
    join(home, ".pi", "agent", "skills"),
    join(home, ".agents", "skills"),
    join(home, ".claude", "skills"),
    join(cwd, ".pi", "skills"),
    join(cwd, ".agents", "skills"),
  ];
}

/** True when a domain skill (e.g. hyperframes-core) is discoverable. */
export function findDomainSkill(name: string, home: string, cwd: string): string | null {
  for (const dir of domainSkillSearchDirs(home, cwd)) {
    const candidate = join(dir, name, "SKILL.md");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * User-bin directories appended to the PATH handed to spawned children
 * (engine CLI, ffmpeg/ffprobe). Static ffmpeg builds are commonly installed
 * in one of these without being on the parent process's PATH, which made
 * `brag_render` fail with "FFmpeg not found" while the binary was present.
 * Appended — never prepended — so system resolution order is preserved.
 */
export function extraPathDirs(home: string = homedir()): string[] {
  return [join(home, ".pi", "agent", "bin"), join(home, ".local", "bin")];
}

/**
 * Append {@link extraPathDirs} entries that exist to a PATH string.
 * Pure/injectable: `exists` and `delimiter` are overridable for offline tests.
 */
export function augmentPath(
  pathValue: string | undefined,
  opts: { home?: string; exists?: (p: string) => boolean; delimiter?: string } = {},
): string {
  const exists =
    opts.exists ??
    ((p: string) => {
      try {
        return existsSync(p);
      } catch {
        return false;
      }
    });
  const sep = opts.delimiter ?? delimiter;
  const parts = pathValue ? pathValue.split(sep) : [];
  for (const dir of extraPathDirs(opts.home)) {
    let present: boolean;
    try {
      present = exists(dir);
    } catch {
      present = false;
    }
    if (present && !parts.includes(dir)) parts.push(dir);
  }
  return parts.join(sep);
}

/**
 * Environment for spawned children (engine CLI, ffmpeg): a shallow copy of
 * `env` with the PATH-like variable augmented via {@link augmentPath}. Uses
 * the existing PATH casing (Windows env keys are case-preserved) and never
 * mutates the input. `opts` passes through to {@link augmentPath}.
 */
export function childEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts: { home?: string; exists?: (p: string) => boolean; delimiter?: string } = {},
): NodeJS.ProcessEnv {
  const out = { ...env };
  const key = Object.keys(out).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  out[key] = augmentPath(out[key], opts);
  return out;
}