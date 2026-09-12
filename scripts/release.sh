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
for _ in $(seq 1 40); do
  # Poll by branch (SHA indexing lags on the API), then verify the headSha.
  R="$(gh run list --repo fakoli/anvil-extensions --branch main --limit 1 \
      --json headSha,status,conclusion \
      -q 'if .[0] == null then "" else (.[0].headSha // "") + " " + (.[0].status // "") + " " + (.[0].conclusion // "") end' 2>/dev/null || true)"
  RUN_SHA="${R%% *}"
  RUN_REST="${R#* }"
  if [ "$RUN_SHA" = "$COMMIT" ]; then
    case "$RUN_REST" in
      "completed success")
        echo "✓ CI green on $COMMIT"
        break
        ;;
      completed*)
        echo "✗ CI FAILED ($RUN_REST) on $COMMIT — fix, commit, release aborted." >&2
        exit 1
        ;;
    esac
  fi
  printf "."; sleep 15
done

if [ "${RUN_REST:-}" != "completed success" ]; then
  echo "✗ CI did not reach green in time — tag not created." >&2
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