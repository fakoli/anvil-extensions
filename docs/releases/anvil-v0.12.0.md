# Anvil Extensions 0.12.0

This release candidate adds `pi-browser`: an optional, inactive-by-default
read-only public-page observation resource. The full bundle contains 15
packages and 14 registered extension entrypoints. Browser observations start
only in a fresh Pi 0.85.1 session with `--browser` and protected configuration
for exactly one or two same-origin public HTTPS pages and an installed Chrome
or Chromium executable. Linux Node 24 starts the pinned Playwright 1.63.0
worker.

The enabled session has four closed tools: capture, resolve, release, and
fixed-policy Jev resolve. It returns bounded public-DOM text receipts only;
there is no arbitrary navigation, browser action, page scripting, form
submission, screenshot, raw media, or page object. Jev is disabled by default
and its optional configured export is advisory only. Unsolicited navigation
revokes the observation, and partial coverage cannot establish absence. Session
changes, fork/tree attempts, cancellation, deadline expiry, or worker failure
close the client. Linux cleanup uses a second TERM for Playwright cleanup
before its worker-group KILL fallback.

## Candidate verification and acceptance limits

The exact candidate checkout passed the final committed-lock clean-room
verification: all 11 declared suites and a dependency audit with zero
vulnerabilities. The installed Pi 0.85.1 native fixture passed in text-only and
image-capable declaration modes. The default installed Chromium cleanup probe
passed all four lifecycle cases against the npm-installed merged Serving
dependency at `4d0bbebb`. These checks establish bounded fixture and lifecycle
behavior; they do not qualify a website, configured browser deployment, model,
or production route.

The staged-release installed cleanup repeat, neutral-website acceptance, and
live-primary acceptance remain pending. `llm.primary` is offline for
benchmarking. Publication is authorized while `pi-browser` remains inactive;
installation activation and live acceptance are not claimed by this release
candidate. The strict wire-production gate also remains **OPEN**: its quota
needs kernel enforcement that accounts for socket and TLS extra bytes.

## Upgrade and rollback

Publication does not activate `pi-browser` or change existing Pi sessions,
providers, routes, or the independent image-observation workflow. After the
pending gates close, enable it only in a fresh explicitly browser-enabled
session with reviewed protected configuration. Roll back to `anvil-v0.11.1`
and start a fresh session; no browser state requires migration.
