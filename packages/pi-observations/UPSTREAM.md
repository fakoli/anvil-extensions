# Provenance

`pi-observations` is original MIT-licensed Anvil Extensions code. It uses Pi 0.85.1's exported extension, session-projection, registered-model, native streaming, flag, and active-tool APIs.

Its neutral retained-observation owner is `@anvil-serving/observations` from Anvil Serving commit `eb8ed5c4bf4acc7e40cbfced8ae817ea088239a7` (MIT), used only through its public `./owner` and `./png` exports. The package dependency pins that full commit; the root lock records the resolved package closure and integrity. No observation-owner source is copied into this package.

Image normalization reuses the bundle's existing, unmodified `sharp@0.35.4` library (Apache-2.0), declared as an exact direct dependency. The root lock records its platform packages and integrity. Sharp is dynamically imported under Node. Pi's embedded runtime delegates decoding to a bounded Node 24 child, loading this same normalizer from its trusted source URL; no decoder or Sharp source is vendored or patched. Normalization and first-frame GIF coverage are original adapter code.

The original primary-payload guard uses ancestor-only cycle detection: shared Pi tool schemas remain valid, while cycles, media, and more than 8,192 object occurrences fail closed. Upstream tool schemas are not copied or patched.
