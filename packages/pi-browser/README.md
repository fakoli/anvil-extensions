# pi-browser

`pi-browser` is an optional Linux extension for Pi 0.85.1. It exposes bounded, read-only observations of one or two public HTTPS pages. It starts no browser and advertises no browser tool unless a fresh Pi session uses `pi --browser` and has a valid protected configuration.

## Runtime and configuration

Use Pi 0.85.1 on Linux and Node 24 or newer on `PATH`. The package installs Playwright 1.63.0; `browser_executable` must name the installed Chrome or Chromium executable that Playwright is permitted to launch. The Pi agent directory must contain `pi-browser.json`; its directory and file must be owned by the Pi user, must not be symlinks, and must not be group- or world-writable.

```json
{
  "browser_executable": "/opt/browser/chrome",
  "pages": [{"id": "home", "url": "https://example.test/"}],
  "jev": {"enabled": false},
  "timeout_ms": 15000
}
```

`pages` accepts one or two IDs, with the same HTTPS origin. IDs are the only page selector exposed to the model. `timeout_ms` is a per-worker request deadline from 1 through 15,000 ms. The configuration contains no credentials, provider settings, router endpoint, or arbitrary navigation target. The configured browser worker can fetch the configured public pages; this extension cannot navigate elsewhere, execute page code, submit forms, or change a page.

Jev is disabled by default. When it is enabled, the configuration must use the configured page origin, the fixed fields in this exact order, absolute executable and working-directory paths, and a timeout from 1 through 10,000 ms:

```json
{
  "enabled": true,
  "origin": "https://example.test",
  "fields": ["schema", "request_id", "observation_id", "source", "target", "scope", "coverage", "entities"],
  "executable": "/opt/jev/bin/jev",
  "cwd": "/srv/jev-policy",
  "timeout": 10000
}
```

Run a new browser-enabled session with:

```bash
pi --browser
```

The extension announces the configured page IDs only in the enabled session’s model guidance; it never includes configured URLs or settings. A normal Pi session is the disable path: omit `--browser`, or deselect the package extension in the root resource configuration. To roll back, restore the preceding repository package release and restart a fresh Pi session. The package owns no persistent browser state to migrate.

## Tool contract and limits

The enabled session advertises exactly four tools:

- `browser_capture` accepts a configured `page_id` plus a `widget-resolution/v1` request. Its target description is required and limited to 512 UTF-8 bytes; it accepts at most eight 128-byte qualifiers, unique predicates from `exists`, `in_viewport`, `occluded`, and `enabled`, a document or opaque subtree scope, `require_unique`, and optional `entity_offset` from 0 through 2047.
- `browser_resolve` accepts only opaque `observation_id` and `entity_id` values returned by a capture.
- `browser_release` releases one opaque `observation_id`.
- `browser_jev_resolve` applies the fixed configured Jev policy to one opaque `observation_id`; it cannot initiate a browser action.

Inputs are closed schemas: unknown keys are refused. Captures use the owner’s bounded entity page. A partial capture is incomplete and is never evidence that an element is absent. The worker permits results up to 15 KiB, while Pi applies a final 16 KiB text-receipt cap; raw image, screenshot, data URL, and inline media payloads are rejected before returning to Pi or its model provider.

A browser client belongs to exactly one Pi session. The extension closes it before a session change and on shutdown, refuses fork and tree operations while it is active, and discards results that arrive after the originating state is replaced or closed. The owner validates the session binding again, so observations cannot be reused in a new session. Cancellation, an expired per-request deadline, launch failure, malformed worker frames, and an unavailable worker become typed refusal codes (`cancelled`, `deadline_exceeded`, `worker_unavailable`, or `worker_protocol`) and close the active client. The Serving live transport has its own 120-second lifetime.

On Linux, shutdown sends TERM to the detached worker group, then sends a second TERM after 150 ms so the pinned Playwright runtime can take its force-close path. The retained worker-group KILL fallback begins at 300 ms. This cleanup sequence covers the observed stalled-Chromium runtime behavior; it is not a general process-isolation guarantee.

## Verification

Run the package tests:

```bash
npm test --workspace pi-browser
node packages/pi-browser/tests/pi-probe.mjs
node packages/pi-browser/tests/chromium-cleanup.mjs
```

`pi-probe.mjs` runs against the installed Pi 0.85.1 RPC runtime twice, once with a text-only model declaration and once with a model that declares image input. It loads the currently declared full root extension bundle plus this candidate extension through an explicit trusted fake-client factory, and fails on a Pi extension-load error. The fixture has no external model, browser, or network dependency. It proves inactive tools are absent and exercises the registered tools, text-only provider boundary, session binding, stale-handle refusal, fork cancellation, and reload cleanup. The two capability modes prove a no-media boundary only; they are not vision-quality qualification and do not open or satisfy a vision/OpenWire gate.

`chromium-cleanup.mjs` launches the exact production worker and pinned Playwright Chromium against a synthetic in-memory transport. It checks normal close, cancellation, raw worker termination, and a stopped browser before any test cleanup resumes it. It makes no external network or model request. Before the Serving package pin is installed, maintainers may set `PI_BROWSER_SERVING_SOURCE` to a reviewed Serving checkout for this test only; production configuration has no such override.

## Provenance

See [UPSTREAM.md](UPSTREAM.md) for the reviewed Serving adapter and browser-worker boundary.
