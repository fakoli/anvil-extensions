## Change

Describe the user-visible behavior and affected packages. Call out changes to
default/optional resource selection, dependencies, permissions, or retained data.

## Documentation

Follow the documentation matrix in [AGENTS.md](https://github.com/fakoli/anvil-extensions/blob/main/AGENTS.md).
List the files updated below. For an unaffected surface, explain why it is not
applicable; do not check a box for documentation that is still missing.

- [ ] Root README inventory, descriptions, counts, and loading guidance reviewed.
- [ ] Package catalog table and detailed entries updated where affected.
- [ ] Package README covers setup, interface, configuration, effects, limits,
      verification, disablement, and rollback.
- [ ] Provenance ledger, fork catalog, licenses, and dependency locks reviewed.
- [ ] Security, candidate composition/evidence, and assigned release notes updated
      where affected.
- [ ] Links, paths, tool/command names, defaults, and examples checked against code.

**Documentation files updated and applicability notes:**

<!-- A new extension always needs documentation. Explain unaffected surfaces;
     do not replace required documentation with this PR description. -->

## Verification

List exact commands run and results. Distinguish offline checks, live tests,
and tests that were skipped or blocked. Note test-matrix changes when applicable.

## Upgrade and rollback

Describe any migration, resource-selection change, and retained user data.
State whether this change affects the baseline or remains optional/candidate-only.

## Release delivery

Planned new tag, release-notes path, and previous known-good rollback tag:

<!-- Complete these delivery checks AFTER merge/publication. Pending boxes do
     not block the PR needed to create that release, but delivery is incomplete
     until they pass. If the user explicitly requested no publication, quote
     that scope here instead. -->

- [ ] Exact merged commit passed CI and the clean-room release gate.
- [ ] New immutable tag resolves to that commit.
- [ ] GitHub Release is published with notes, a tagged-source `.tar.gz`, and `SHA256SUMS`.
- [ ] Downloaded assets match the verified artifact and checksum.
- [ ] Handoff includes the release URL, tag/commit, artifact digest, and rollback.
