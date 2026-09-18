# Anvil Extensions 0.9.2

Patch release fixing the release gate itself: `scripts/release-verify.sh`
now produces a dev-complete install regardless of how the gate is invoked.

**Root cause.** Background/task shells on this host carry
`NODE_ENV=production`. Under it, `npm ci` silently omits devDependencies, so
the clean-room install was incomplete in a way that failed exactly the two
suites not running on plain node: `vitest` never landed in
`node_modules/.bin` (`pi-hermes-memory`: "vitest: not found", exit 127) and
dev-only modules vanished (`pi-condense`: "Cannot find module
'@sinclair/typebox'", 60 bun failures), while every node-runner suite still
passed. Foreground shells have `NODE_ENV` unset, so the same gate passed
there — the failure looked like a flake and cost two blocked release
attempts before differential diagnosis (bg replica with captured logs vs
identical foreground run) isolated the variable.

**Fix.** `release-verify.sh` unsets `NODE_ENV`, `npm_config_production`, and
`npm_config_omit` before the clean-room install and matrix: the clean room is
a test environment and must always install dev dependencies and run suites
with development semantics, no matter how the gate is invoked.

Validation: differential diagnosis reproduced both failures under a
background shell with captured logs (npm ci with `NODE_ENV=production`
omits vitest and `@sinclair/typebox`; foreground with `NODE_ENV` unset
passes); with the fix, the full clean-room gate passes under a background
shell (`NODE_ENV=production` present on entry) and in the foreground. The
full offline matrix is unchanged (no package code touched).

No migration is required. To undo an upgrade to this release, restore the
prior known-good selection (the preceding bundle release is `anvil-v0.9.1`).
The change affects only the release verification script; published releases
and installed pins are unaffected.
