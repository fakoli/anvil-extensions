---
name: repo-graph
description: Build an offline interactive repository map and architecture diagram from local paths or a public HTTPS git URL, including large repositories.
---

# Repo Graph

Invoke in Pi with `/skill:repo-graph [repo-path-or-https-url]`.
Resolve `../../scripts/build_repo_graph.py` relative to this `SKILL.md` to an absolute script path. Run `python3 "<resolved-script-path>" [repo-path-or-https-url]` with Pi's bash tool, keeping the caller's repository as the working directory. Do not change into the skill directory: an omitted repository argument must map the caller's current directory. Quote paths as shell arguments. Requires Python 3.10+; Git is required for HTTPS repositories.

`--output DIR` places results outside the source repository. Public HTTPS URLs are cloned into the user's cache and reused; `--refresh` updates a cached clone. Use Pi's normal tool permission and cancellation handling; do not bypass a denied bash command.

It writes to a stable directory under the user's cache by default, leaving the source repository untouched. Report measured file, directory, local import, scan, and cache counts; link `architecture.html`, `graph.html`, `architecture.mmd`, and `graph.json`. The architecture view shows containment and imports; the dependency graph shows imports only. Do not load the whole graph or source tree into model context. Read only targeted paths when answering follow-up questions.

The viewer's **System** tab presents up to 12 source areas and their observed imports. These are structural groupings, not verified runtime services; every component exposes its member directories for drilldown. **Explore** offers card, top-down tree, radial, and file-count treemap layouts. **Data** offers a sortable table and directed dependency matrix. Search, type filters, import/file-count sorting, and pagination share the existing scan. The treemap measures file counts on the current page, not bytes. Scope CSV exports all filtered entries in the current directory; SVG exports the current diagram viewport.

The default scan uses a dependency-free extractor and no model calls. It batches 512 files, reads at most 64 KiB per Go, Python, JavaScript, or TypeScript file, caches import lists by size and modification time, and resolves only local imports it can identify. Unrecognized languages still appear in the directory map. The HTML view is self-contained, with directory drilldown and pages of at most 23 entries plus a scope card; import links are capped to keep the canvas readable. `graph.json` retains the complete path inventory and aggregated local imports. The Mermaid file covers the first root page. Describe import links as heuristic, not call-flow proof.

`--jev` requires user opt-in and permission under the current project instructions to read its credential source. It reads only `TYPESAFE_API_KEY` from the process environment or the user's `~/.env`, then sends up to 16 top-level directory names to TypeSafe System One in one typed request while the local scan runs. It adds confident role labels, caches them, and never lets model output create links or alter the inventory. Directory names leave the machine only when the user opts in. Never display or log the key or other lines in `~/.env`.
