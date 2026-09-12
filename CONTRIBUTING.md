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

## Tag scheme

Releases are tags named `anvil-vMAJOR.MINOR.PATCH`, cut on `main` after CI is green. Tags are immutable (repository rulesets protect them). If you need a hotfix, it lands on `main` via PR and ships as the next patch tag.

## What makes a good PR here

- One coherent change (a package feature, a fix, a docs pass) — not a grab bag.
- Offline tests for behavior changes; the suites are fast and stub all network.
- If you vendored or forked something: the `UPSTREAM.md` ledger updated in the same PR.
- If you touched the root manifest (`pi.extensions` / `pi.skills` / `pi.prompts`): say so explicitly in the PR body — that array is what every host loads.