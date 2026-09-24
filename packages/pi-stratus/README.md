# pi-stratus

Pi coding-agent extension for the **Stratus** cloud/network diagram engine:
typed JSON spec → deterministic validation → reference-grade standalone
HTML/SVG for AWS/GCP/Azure.

## Tools

`stratus_render`, `stratus_validate`, `stratus_presets`, `stratus_export`,
`stratus_evaluate`, `stratus_jev_status`, `stratus_jev_assess`, `stratus_cli`
(8 tools). `render`/`validate` route through `compileAnyDiagram`, so
beyond-cloud specs (workflow, sequence, dataflow, lifecycle) compile through
the same entry point.

- **Progressive-disclosure presets**: simple-vpc → alb-targets → three-tier →
  gateway-endpoint → site-to-site-vpn → transit-gateway → gcp-network →
  azure-vnet (8 presets, all compile eligible in both top-down and left-right
  flows)
- **Validation gates**: schema, containment, placement, routing, CIDR truth,
  edge separation — typed diagnostics with supported fixes
- **Exports**: svg, html, pdf, png, jpeg, pptx (slides)
- **Evaluation**: `/stratus-evaluate` skill judges agent-created diagrams
  against gold-standard dimensions (containment tree, placement truth,
  routing explainability, CIDR truth, edge separation)
- **JEV bridge**: strictly advisory-only assessments (never a gate)

## Verification

```
node tests/run-tests.mjs   # 86 tests across 10 suites
npx tsc --noEmit
```
