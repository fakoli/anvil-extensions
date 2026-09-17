// Fetch the bundled music/SFX assets from the upstream brag repo.
//
// The upstream plugin vendors ~16.5 MB of audio inside the skill. We do not
// vendor it (bundle size; the music's redistribution license is unclear), so
// this tool downloads the upstream tarball once and copies skills/brag/assets
// into place. Network is used ONLY here, never in the skill workflow itself.

import { createWriteStream } from "node:fs";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { DEFAULT_ASSETS_DIR, inventoryAssets, type AssetInventory } from "./paths.js";

export const UPSTREAM_REPO = "latent-spaces/brag";
export const UPSTREAM_REF = "main";

/** Codeload URL for a branch or tag ref (tags live under refs/tags). */
export function tarballUrl(ref: string = UPSTREAM_REF, kind: "heads" | "tags" = "heads"): string {
  return `https://codeload.github.com/${UPSTREAM_REPO}/tar.gz/refs/${kind}/${ref}`;
}

export interface TarDeps {
  fetchImpl?: typeof fetch;
  /** Extract a .tar.gz into a target dir. Injectable for tests. */
  extract?: (tarball: string, destDir: string) => Promise<void>;
  /** Copy the located assets dir into place. Injectable for tests. */
  copy?: (source: string, dest: string) => void;
}

const DEFAULT_EXTRACT = (tarball: string, destDir: string) =>
  new Promise<void>((resolvePromise, reject) => {
    execFile("tar", ["-xzf", tarball, "-C", destDir], { windowsHide: true }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`tar extraction failed: ${(err as Error).message} ${stderr ?? ""}`.trim()));
      else resolvePromise();
    });
  });

function download(url: string, destFile: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<void> {
  return fetchImpl(url, { signal })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        throw new Error(`download failed: HTTP ${res.status} for ${url}`);
      }
      const file = createWriteStream(destFile);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!file.write(Buffer.from(value))) {
          await new Promise<void>((resolvePromise, reject) => {
            file.once("drain", resolvePromise);
            file.once("error", reject);
          });
        }
      }
      await new Promise<void>((resolvePromise, reject) => {
        file.end((err) => (err ? reject(err) : resolvePromise()));
      });
    })
    .catch((err) => {
      throw new Error(`asset download failed: ${(err as Error).message}`);
    });
}

/** Find the extracted `skills/brag/assets` dir inside an extraction root. */
export function locateExtractedAssets(root: string): string | null {
  let candidates: string[];
  try {
    candidates = readdirSync(root).map((name) => join(root, name));
  } catch {
    return null;
  }
  for (const candidate of candidates) {
    const assets = join(candidate, "skills", "brag", "assets");
    try {
      if (readdirSync(assets).length > 0) return assets;
    } catch {
      // not this entry
    }
  }
  return null;
}

export interface FetchAssetsInput {
  /** Destination assets dir (default: this package's skills/brag/assets). */
  dest?: string;
  /** Upstream git branch or tag to fetch from (default: main). */
  ref?: string;
  /** Abort signal for the download. */
  signal?: AbortSignal;
}

export interface FetchAssetsResult {
  dest: string;
  ref: string;
  inventory: AssetInventory;
  summary: string;
}

export async function fetchAssets(input: FetchAssetsInput = {}, deps: TarDeps = {}): Promise<FetchAssetsResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const extract = deps.extract ?? DEFAULT_EXTRACT;
  const copy = deps.copy ?? ((source: string, dest: string) => cpSync(source, dest, { recursive: true }));
  const dest = input.dest ?? DEFAULT_ASSETS_DIR;
  const ref = input.ref ?? UPSTREAM_REF;

  const scratch = mkdtempSync(join(tmpdir(), "brag-assets-"));
  try {
    const tarball = join(scratch, "brag.tar.gz");
    // Branches live under refs/heads, tags under refs/tags — codeload 404s on
    // the wrong kind, so fall back once.
    try {
      await download(tarballUrl(ref, "heads"), tarball, fetchImpl, input.signal);
    } catch (err) {
      if (!/HTTP 404/.test((err as Error).message)) throw err;
      await download(tarballUrl(ref, "tags"), tarball, fetchImpl, input.signal);
    }
    const extractDir = join(scratch, "extract");
    await extract(tarball, extractDir);
    const source = locateExtractedAssets(extractDir);
    if (!source) {
      throw new Error(`upstream tarball did not contain skills/brag/assets (ref: ${ref})`);
    }
    try {
      copy(source, dest);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EROFS" || code === "EPERM") {
        throw new Error(
          `cannot write into ${dest} (${code}) — the package directory may be read-only; pass dest pointing somewhere writable, e.g. inside the project`,
        );
      }
      throw err;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const inventory = inventoryAssets(dest);
  const summary = `assets installed at ${dest}: ${inventory.music.length} music track(s), ${inventory.sfxFiles} SFX file(s) in ${inventory.sfxDirs.length} set(s), ${inventory.cues.length} cue file(s)`;
  return { dest, ref, inventory, summary };
}