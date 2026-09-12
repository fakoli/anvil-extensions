# pi-sandbox-config

pi-native configurator for the **anvil pi sandbox** (`packaging/pi/sandbox` in
the anvil repo). Turns the sandbox's run knobs into validated, dialog-driven
configuration instead of hand-edited JSON — while keeping every fail-closed
rule of the underlying machinery intact.

## What it provides

| Surface | Kind | What it does |
|---|---|---|
| `/sandbox` | command (TUI) | Per-option dialogs: capability preset, digest-pinned image, max concurrent containers, project-scope override — plus a read-only resolved-config precheck |
| `sandbox_config_read` | tool | Read + validate saved configs; list available profiles; headless-safe |
| `sandbox_config_write` | tool | Validate → **cross-check against anvil's own fail-closed validator** → atomic write (tmp + rename, mode `0600`); rejected configs never land on disk |
| `sandbox_precheck` | tool | Read-only resolution preview of exactly what a launch would use (image/network/caps/max). **Never launches anything** |

## Scope rules (mirrored from anvil's `pi-sandbox-config.mjs`)

- **Trusted scope** — `~/.config/anvil/sandbox.config.json`: `image` (digest-pinned),
  `network`, `caps`, `max_containers`.
- **Project scope** — `<workspace>/.pi/sandbox.config.json`: `max_containers` ONLY.
  Any security field there is a refusal: the workspace is untrusted input and must
  not loosen container security.
- Precedence: explicit config > user config > defaults; project `max_containers`
  merges most-restrictive-wins.

## Launching

This extension deliberately does **not** launch containers. After a precheck,
launch via the anvil wrapper (e.g. in a background task for streamed runs):

```sh
<anvil>/scripts/pi-sandbox-docker.sh [--config <file>] <profile> <task-file> <workspace>
```

`scripts/pi-sandbox-docker.sh` prints a `pi-sandbox-config: source=… image=…`
attestation line to stderr on every launch; `max_containers` is enforced there.

## Policy discovery

`ANVIL_SANDBOX_ALLOWLIST` (explicit file) > `ANVIL_CHECKOUT` (anvil repo root) >
walk-up from the session cwd for `packaging/pi/sandbox/allowlist.json` (≤ 8 levels) >
`~/code/anvil`. `ANVIL_ROOT` is deliberately not used — it means the anvil *state*
root to the anvil CLI.
Without the policy surface, profile names are free-text and every saved config
is still schema-validated locally; the validator cross-check activates as soon
as the surface is found.

## Privacy

No personal identifiers: this package is name-neutral (code, paths, env vars,
docs, commit messages, branch names). It contains no corpus, no credentials,
and makes no network calls beyond spawning the local anvil validator.