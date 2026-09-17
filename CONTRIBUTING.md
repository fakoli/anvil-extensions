# Contributing

Thanks for your interest. This bundle is maintained as a single auditable unit, so a few conventions are enforced rather than suggested.

## The rules

1. **PRs only.** Direct pushes to `main` are reserved for the maintainers' release flow. `main` itself is protected against deletion and force-push.
2. **Tests stay green.** Every package with a `tests/run-tests.mjs` suite must pass offline (no network, no provider calls). CI runs exactly that on every push and PR — if your change touches a package, run its suite locally first:

   ```bash
   cd packages/<name> && node tests/run-tests.mjs
   ```

3. **No external product branding** in prompts or docs (enforced by test in existing packages; please extend the convention to new code). Refer to behaviors, not rival products.
4. **Provenance ledger.** Any package that vendors upstream code carries an `UPSTREAM.md` beside its code stating: upstream source, exact version/commit, import integrity hash, whether the import is verbatim, and every local change. Verbatim stays verbatim; forks document their divergence.
5. **Lockfile with dependencies.** Dependency changes commit their `package-lock.json` update in the same change. The lockfile is the integrity anchor for every host.
6. **Identity hygiene.** Commit with a noreply email (`git config user.email "you@users.noreply.github.com"`) and your handle as the name. History is identity-scrubbed before every release; the cleanest diff is the one that never needs scrubbing.
7. **Secrets never enter the tree.** No `.env` files, tokens, or capability URLs — runtime configuration references secrets by environment variable name only.
8. **Extension license boundary.** MIT extensions/plugins are eligible for reviewed forks. Apache-2.0 extensions/plugins stay official and unmodified outside this bundle, installed directly in Pi or as external tools. Track their exact versions, locks, installation, selection, and rollback in `fakoli/ai-infra`. Do not fork, patch, or vendor their code here. This is an operator maintenance policy; see `AGENTS.md`.
9. **Documentation ships with the change.** Every new extension requires a package README and updates to the root inventory, package catalog, and provenance records in the same PR. Changes to existing tools, configuration, permissions, loading behavior, or dependencies update the affected documentation too. Follow the documentation matrix and completion gate in [AGENTS.md](AGENTS.md), and complete the PR checklist. Documentation cannot be deferred as follow-up work for an otherwise complete extension.
10. **Finish with a published release.** Each coherent delivered change, including documentation changes, requires a new immutable tag, published release notes, a downloadable source bundle, and its verified checksum. A merged PR or tag alone is not delivery. Explicit draft/local-only/no-publication requests are the exception. See the release completion gate in `AGENTS.md`.

## Tag scheme

Releases are tags named `anvil-vMAJOR.MINOR.PATCH`, cut on `main` **only after CI is green** on the exact commit being tagged. Tags are immutable (repository rulesets protect them). Use the release script — it enforces the order:

```bash
scripts/release.sh anvil-v0.8.1
```

Merge the reviewed PR first and run from a clean checkout at the resulting `origin/main` commit. The script runs the clean-room gate (`scripts/release-verify.sh`: scratch archive, `npm ci` against the committed lockfile including Pi, workspace resolution, static checks, full test matrix), **waits for a green CI run on that exact commit**, and then creates and pushes a new immutable tag. It preserves the local Pi installation unless `INSTALL_LOCAL=1` explicitly requests a re-pin. Publication does not activate a candidate on any host.

The test matrix lives in `scripts/test-matrix.txt` — the single source of truth shared by CI and the release gate. Add a package's workspace name there when it gains a test suite; vendored packages that ship no tests stay out, with a comment explaining why. If you need a hotfix, it lands on `main` via PR and ships as the next patch tag.

## Publish and verify release artifacts

`scripts/release.sh` currently creates the tag only. Complete publication with
the following steps after its successful exit. Prepare `docs/releases/<tag>.md`
in the reviewed PR first. Select the actual unused release version; the tag
below illustrates this policy release and must not be reused for later changes.

```bash
TAG=anvil-v0.8.1
set -euo pipefail
RELEASE_DIR="$(mktemp -d)"
ASSET="anvil-extensions-${TAG}.tar.gz"
git archive --format=tar --prefix=anvil-extensions/ "$TAG" | gzip -n > "$RELEASE_DIR/$ASSET"
(cd "$RELEASE_DIR" && shasum -a 256 "$ASSET" > SHA256SUMS)
gh release create "$TAG" --repo fakoli/anvil-extensions --verify-tag \
  --title "Anvil Extensions ${TAG#anvil-v}" \
  --notes-file "docs/releases/$TAG.md" \
  "$RELEASE_DIR/$ASSET" "$RELEASE_DIR/SHA256SUMS"
gh release download "$TAG" --repo fakoli/anvil-extensions \
  --dir "$RELEASE_DIR/downloaded" --pattern "$ASSET" --pattern SHA256SUMS
(cd "$RELEASE_DIR/downloaded" && shasum -a 256 -c SHA256SUMS)
cmp "$RELEASE_DIR/$ASSET" "$RELEASE_DIR/downloaded/$ASSET"
git ls-remote origin "refs/tags/$TAG"
```

Run the commands in a fail-fast shell (`set -euo pipefail`). Confirm the remote
tag points to the exact green merge commit and both assets are present on the
published GitHub Release. The source bundle is the artifact for this TypeScript
Pi bundle: install dependencies from its committed lock using the documented
runtime. It is not a preinstalled runtime or an offline dependency cache.
Automatic GitHub source links and expiring CI artifacts do not replace the
named release asset and checksum.

If publication fails after tagging, retain the verified artifacts and inspect
the existing tag/release before retrying. Publish only missing assets with the
same verified bytes; do not use `--clobber`, overwrite assets, or move tags.
Report a pending release until the download verification succeeds. For rollback,
restore the previous known-good Pi selection; publishing never changes that
selection automatically.

## What makes a good PR here

- One coherent change (a package feature, a fix, a docs pass) — not a grab bag.
- Offline tests for behavior changes; the suites are fast and stub all network.
- If you vendored or forked something: the `UPSTREAM.md` ledger updated in the same PR.
- If you touched the root manifest (`pi.extensions` / `pi.skills` / `pi.prompts`): say so explicitly in the PR body — that array is what every host loads.
