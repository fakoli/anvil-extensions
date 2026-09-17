// Fetch the bundled music/SFX assets from the upstream brag repo.
//
// The upstream plugin vendors ~16.5 MB of audio inside the skill. We do not
// vendor it (bundle size; the music's redistribution license is unclear), so
// this tool downloads the upstream tarball once and copies skills/brag/assets
// into place. Network is used ONLY here, never in the skill workflow itself.

import { createWriteStream, mkdirSync } from "node:fs";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DEFAULT_ASSETS_DIR, inventoryAssets, type AssetInventory } from "./paths.js";
import { UPSTREAM_COMMIT } from "./provenance.js";

export const UPSTREAM_REPO = "latent-spaces/brag";
/** Default fetch ref: the pinned upstream commit, so assets match the ledger. */
export const UPSTREAM_REF = UPSTREAM_COMMIT;

/**
 * Codeload tarball URL. The classic `/tar.gz/<ref>` form resolves branches,
 * tags, and commit SHAs alike (the refs/heads|tags forms 404 on the wrong
 * kind, and SHAs resolve under neither).
 */
export function tarballUrl(ref: string = UPSTREAM_REF): string {
  return `https://codeload.github.com/${UPSTREAM_REPO}/tar.gz/${ref}`;
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

/**
 * Stream the response body to destFile. pipeline() tears down both sides on
 * error or abort and rethrows the first error — no leaked readers/writers.
 */
async function download(url: string, destFile: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(url, { signal });
  } catch (err) {
    if (signal?.aborted) throw new Error(`asset download aborted: ${url}`);
    throw new Error(`asset download failed: ${(err as Error).message}`);
  }
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  }
  try {
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(destFile), { signal });
  } catch (err) {
    if (signal?.aborted) throw new Error(`asset download aborted: ${url}`);
    throw new Error(`asset download failed: ${(err as Error).message}`);
  }
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
  /** Upstream git branch, tag, or commit SHA (default: the pinned upstream commit). */
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
    await download(tarballUrl(ref), tarball, fetchImpl, input.signal);
    // tar -C does not create the target directory; it fails without this.
    const extractDir = join(scratch, "extract");
    mkdirSync(extractDir, { recursive: true });
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