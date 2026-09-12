#!/usr/bin/env bash
# release.sh — one-command release. Makes a red tag structurally impossible:
# the tag is cut only AFTER CI is green on the exact commit being tagged.
#
# Usage: scripts/release.sh anvil-vX.Y.Z [commit-ish]
# Env:   SKIP_VERIFY=1 — skip the clean-room gate (never in CI-backed repos)
set -euo pipefail

TAG="${1:?usage: release.sh anvil-vX.Y.Z [commit-ish]}"
REF="${2:-HEAD}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${SKIP_VERIFY:-0}" != "1" ]; then
  echo "== clean-room verification =="
  "$SCRIPT_DIR/release-verify.sh"
else
  echo "!! SKIP_VERIFY=1 — clean-room gate bypassed"
fi

COMMIT="$(git rev-parse "$REF")"
echo
echo "== push main at $COMMIT =="
git push origin "$COMMIT:main"

echo
echo "== wait for CI green on $COMMIT (tags are immutable; never tag red) =="
sleep 10   # let the run register
for _ in $(seq 1 30); do
  STATUS="$(gh run list --repo fakoli/anvil-extensions --commit "$COMMIT" \
    --json status,conclusion -q '.[0] | .status + "/" + (.conclusion // "-")' 2>/dev/null || echo "unknown")"
  case "$STATUS" in
    "completed/success")
      echo "✓ CI green on $COMMIT"
      break
      ;;
    "completed/"*)
      echo "✗ CI FAILED ($STATUS) on $COMMIT — fix, commit, retag attempt aborted." >&2
      exit 1
      ;;
    *)
      printf "."; sleep 15
      ;;
  esac
done

if [ "${STATUS:-}" != "completed/success" ]; then
  echo "✗ CI did not reach green in time ($STATUS) — tag not created." >&2
  exit 1
fi

echo
echo "== tag + push =="
git tag -f "$TAG" "$COMMIT"
git push origin "refs/tags/$TAG"

echo
echo "== re-pin local install =="
pi install "git:github.com/fakoli/anvil-extensions@$TAG"
echo
echo "Released $TAG at $COMMIT."