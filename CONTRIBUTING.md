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

## Tag scheme

Releases are tags named `anvil-vMAJOR.MINOR.PATCH`, cut on `main` **only after CI is green** on the exact commit being tagged. Tags are immutable (repository rulesets protect them). Use the release script — it enforces the order:

```bash
scripts/release.sh anvil-v0.7.0
```

Merge the reviewed PR first and run from a clean checkout at the resulting `origin/main` commit. The script runs the clean-room gate (`scripts/release-verify.sh`: scratch archive, `npm ci` against the committed lockfile including Pi, workspace resolution, static checks, full test matrix), **waits for a green CI run on that exact commit**, and then creates and pushes a new immutable tag. It preserves the local Pi installation unless `INSTALL_LOCAL=1` explicitly requests a re-pin. Publication does not activate a candidate on any host.

The test matrix lives in `scripts/test-matrix.txt` — the single source of truth shared by CI and the release gate. Add a package's workspace name there when it gains a test suite; vendored packages that ship no tests stay out, with a comment explaining why. If you need a hotfix, it lands on `main` via PR and ships as the next patch tag.

## What makes a good PR here

- One coherent change (a package feature, a fix, a docs pass) — not a grab bag.
- Offline tests for behavior changes; the suites are fast and stub all network.
- If you vendored or forked something: the `UPSTREAM.md` ledger updated in the same PR.
- If you touched the root manifest (`pi.extensions` / `pi.skills` / `pi.prompts`): say so explicitly in the PR body — that array is what every host loads.
