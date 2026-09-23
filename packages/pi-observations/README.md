# pi-observations

`pi-observations` is an optional Pi 0.85.1 extension for bounded, local vision inspection of PNG, JPEG, WebP, and GIF attachments. It preserves the selected primary model. It sends a validated image and an explicit bounded question only to the exact registered vision provider and model selected in trusted local configuration, then replaces the image in primary context with a text-only observation envelope.

## Requirements and setup

Use Node 24 and Pi 0.85.1 on Linux with POSIX ownership and directory-mode semantics for durable owner state. Install the reviewed, pinned package with native Pi package discovery. The required owner dependency is pinned with the release integration; this package never reads a project configuration, the current directory, a shared `.env`, or provider credentials.

Create the trusted user-agent configuration at `~/.pi/agent/pi-observations.json`, or at `pi-observations.json` under the directory selected by `PI_CODING_AGENT_DIR`. The agent directory and file must be owned by the running user, must not be symlinks or group/world writable, and the file must be at most 64 KiB. It accepts only these opaque, non-secret fields:

```json
{
  "provider": "local",
  "model": "vision",
  "profile": "local-vision"
}
```

The configured pair must exactly match a registered Pi model that advertises image input. A registered model ID may be a declared router alias; the extension performs no alias inference, endpoint selection, credential lookup, or fallback.

Start a new Pi session with the explicit opt-in:

```bash
pi --observation
```

The flag creates one synchronous marker only for an empty `startup` or `new` session. The marker binds the Pi session header, derived authority, model, and profile. It is sticky on reload and clean resume; an unmarked history, a corrupt/duplicate/mismatched marker, missing prior owner state, or an unsupported inherited history is refused and aborts before dispatch.

## What enters context

The extension maps every image-bearing message to exactly one saved source in the same order, including its original question and tool identity. Earlier hooks may transform or remove text-only messages; their results pass through unchanged. Altered, missing, added, reordered, or ambiguous image sources abort with `image_source_mismatch`. Compaction and branch summaries remain unsupported. This permits ordinary text-only context hooks without weakening image provenance.

Every accepted image maps to a separate opaque observation reference. One user image with explicit user text of at most 512 UTF-8 bytes may receive one automatic inspection. This is bounded autonomous mediation, with no unlimited inspection loop or compaction-enabled continuation. Tool-generated images receive a `question_required` reference only; multiple images receive distinct references and no automatic common question.

The primary can make an explicit request through:

```text
observation_inspect({ observation_id, question, follow_up?: boolean })
```

`question` must be nonempty and at most 512 UTF-8 bytes. `follow_up: true` explicitly authorizes a further attempt for the same retained reference after an incomplete attempt. The inspection callback has exactly `inspection_status`, `facts`, and `reason`: `observed` uses an empty reason and facts such as `{ "kind": "visual_fact", "text": "literal shape", "uncertainty": "unverified_interpretation", "region_ref": null }`; `inconclusive` and `unsupported` use no facts and a bounded reason. All inspection responses are strict, bounded text JSON; provider errors are converted to typed text outcomes and provider error bodies are never exposed.

## Image and inspection limits

Canonical-base64 `image/png`, `image/jpeg`, `image/webp`, and `image/gif` inputs are supported. Declared MIME must match the decoded format. Sharp 0.35.4 normalizes supported variants in memory to strict RGB/RGBA PNG, applies orientation, and strips metadata. Already-valid strict PNG passes through unchanged. Input and normalized output are limited to 8 MiB each and 8,000,000 pixels; normalization has a five-second deadline and cancellation. No image path or URL is accepted by the normalizer. In Pi's embedded Bun runtime, decoding runs in a bounded Node 24 child process because the embedded dependency resolver cannot load Sharp reliably. Only the image input and normalized result pass over its pipes; cancellation or deadline kills and reaps the child. The decoder never calls a model or reads provider configuration.

Static GIF works normally. Animated GIF makes **only the first frame available for inspection** and adds a fixed notice to primary context that motion and later frames are not included. Other animated or multi-page formats are refused. Unsupported, malformed, oversized, or cancelled image inputs become bounded `observation-input-error/v1` text with an actionable reason; they never pass raw bytes or native decoder errors to the primary. A reference always represents the normalized frame, not the whole animation.

The owner admits at most 64 source lifetimes, including expired tombstones, 256 MiB of active PNG bytes, and one hour of retained activity. A session has at most 32 attempts, 120 seconds cumulative reservation, and a 30-second maximum inspection call. Cancellation from Pi, the tool, or session shutdown is propagated to the vision request. A native primary-payload guard rejects raw image parts, nested media/image forms, inline image data, and `data:image/` values before dispatch. Shared non-cyclic tool schemas are allowed; actual cycles and traversal beyond 8,192 object occurrences are refused.

Original Pi transcript entries are never rewritten. The private `pi-observations/<derived-session>/` directory under the user agent directory is created at mode 0700 and contains only owner metadata, receipts, tombstones, and the inspection ledger (each file mode 0600); it does not create a second raw-PNG store. Closing the session cancels active work and releases the owner. A clean resume verifies the same state and binding; it does not silently reset a budget.

While enabled, compaction, fork, and tree operations are cancelled before Pi's default model call. To stop using observations, close the marked session and start a new session without `--observation`. Do not deselect the extension for a session that still contains retained images: that would remove the primary media guard. Removing the package after closing a session preserves the original Pi transcript; it does not mutate or migrate its image entries.

## Verification

Run the package checks with:

```bash
npm test --workspace pi-observations
node packages/pi-observations/tests/pi-probe.mjs
```

The probe starts the installed Pi 0.85.1 extension against a controlled loopback provider. It is independent fixture evidence for registered-provider mediation, primary media exclusion, original transcript preservation, user/tool image flows, text-only hook composition, the full registered bundle and built-in JPEG file reader, common formats, and animated-GIF first-frame coverage. It is not a live model qualification. A separately authorized controlled live fixture, using explicit registered vision and primary models in an isolated Pi session, remains a release gate and must capture its own boundary evidence.

Upgrade to `anvil-v0.11.1` and reload Pi; no transcript migration is required. Close the marked session before rolling back to `anvil-v0.11.0`, which retains the shared-tool-schema `media_guard` false positive. Preserve user state when changing an installed Git package pin.

This is original bundle code; see [UPSTREAM.md](UPSTREAM.md).
