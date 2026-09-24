# pi-stratus

Pi coding-agent extension for the **Stratus** cloud/network diagram engine:
typed JSON spec → deterministic validation → reference-grade standalone
HTML/SVG for AWS/GCP/Azure.

## Requirements

- pi ≥ 0.9.0 (installed as a pi package; see Installation)
- Node ≥ 22.19 and the package dependencies (`pptxgenjs`, `puppeteer-core`,
  `sharp` — installed with the package)
- A Chrome/Chromium binary at `STRATUS_CHROME_PATH` (default
  `/usr/bin/google-chrome`) for the `pdf`, `png`, `jpeg`, and `pptx` export
  formats — `pptx` renders its slide image through Chrome; only `svg` and
  `html` are browser-free

## Installation

This package lives in the `fakoli/pi-extensions` monorepo and is activated by
the root manifest (`pi.extensions`) when the repo is installed as a git-pinned
pi package:

```
pi install git:github.com/fakoli/anvil-extensions@<tag>
```

Then bump the pin in `~/.pi/agent/settings.json` (`packages` list).

## Tools (LLM-callable)

| Tool | Purpose | Notes |
|---|---|---|
| `stratus_render` | Spec (or preset) → SVG + standalone interactive HTML with a validation receipt | `spec` optional — omit to render the `preset`; routes through `compileAnyDiagram` so beyond-cloud specs (workflow, sequence, dataflow, lifecycle) compile through the same entry point |
| `stratus_validate` | Spec (or preset) → typed validation receipt (gates, diagnostics, reference grade) | `spec` optional — omit to validate the `preset` |
| `stratus_presets` | List the progressive-disclosure preset ladder | 8 presets, all compile eligible in both flows |
| `stratus_export` | Export a compiled diagram | `format`: svg, html, pdf, png, jpeg, pptx (slides); `outDir` output directory |
| `stratus_evaluate` | Judge a diagram against gold-standard dimensions | containment tree, placement truth, routing explainability, CIDR truth, edge separation |
| `stratus_jev_status` | Probe the JEV advisory bridge | advisory metadata only, never a gate |
| `stratus_jev_assess` | Ask JEV for an advisory assessment | strictly advisory-only |
| `stratus_cli` | Run a CLI verb (render, validate, catalog, network-check, doctor, preset) | structured receipt |

## Commands

- `/stratus <preset>` — compile a preset (or custom spec) end to end: render,
  then report the validation receipt, artifact paths, and diagnostics.
- `/stratus-doctor` — probe the engine status: preset ladder, registered
  tools, JEV bridge state.

## Presets

Progressive-disclosure ladder (all compile eligible in both top-down and
left-right flows): simple-vpc → alb-targets → three-tier → gateway-endpoint →
site-to-site-vpn → transit-gateway → gcp-network → azure-vnet.

## Configuration

None required — the engine is offline and deterministic. The JEV bridge is
strictly advisory-only (never a gate) and needs no credentials.

## Effects

The engine writes only to the output directory given per export call
(`stratus_export` `outDir`, CLI `--out`). It never mutates the workspace, runs
no lifecycle scripts, and makes no network calls.

## Rollback

Bump the `fakoli/pi-extensions` pin in `~/.pi/agent/settings.json` back to the
previous tag, or remove `./packages/pi-stratus/index.ts` from the root
manifest's `pi.extensions` list — the extension is inert without registration.

## Verification

```
node tests/run-tests.mjs   # 86 tests across 10 suites
npx tsc --noEmit
```
