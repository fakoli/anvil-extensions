#!/usr/bin/env bash
# release.sh — one-command release. Makes a red tag structurally impossible:
# the tag is cut only AFTER CI is green on the exact commit being tagged.
#
# Usage: scripts/release.sh anvil-vX.Y.Z [commit-ish]
# Env:   INSTALL_LOCAL=1 — explicitly re-pin this host after publication
set -euo pipefail

# Self-sufficient PATH: gh (~/.local/bin) and bun (~/.bun/bin) are not on
# a non-interactive shell's default PATH.
export PATH="$PATH:$HOME/.local/bin:$HOME/.bun/bin"

TAG="${1:?usage: release.sh anvil-vX.Y.Z [commit-ish]}"
REF="${2:-HEAD}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMMIT="$(git rev-parse "$REF")"
if ! [[ "$TAG" =~ ^anvil-v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid release tag: $TAG" >&2; exit 1
fi
git fetch origin main
if [ "$COMMIT" != "$(git rev-parse origin/main)" ] || [ "$COMMIT" != "$(git rev-parse HEAD)" ]; then
  echo "Release HEAD must be the already merged origin/main commit." >&2; exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Release checkout must be clean." >&2; exit 1
fi
if git rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1 ||
   [ -n "$(git ls-remote --tags origin "refs/tags/$TAG")" ]; then
  echo "Release tag already exists; tags are immutable." >&2; exit 1
fi
echo "== clean-room verification =="
"$SCRIPT_DIR/release-verify.sh"

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

if [ "${RUN_SHA:-}" != "$COMMIT" ] || [ "${RUN_REST:-}" != "completed success" ]; then
  echo "✗ CI did not reach green in time — tag not created." >&2
  exit 1
fi

echo
echo "== tag + push =="
git tag "$TAG" "$COMMIT"
git push origin "refs/tags/$TAG"

echo
if [ "${INSTALL_LOCAL:-0}" = "1" ]; then
  echo "== explicitly re-pin local install =="
  pi install "git:github.com/fakoli/anvil-extensions@$TAG"
else
  echo "Local Pi selection preserved (INSTALL_LOCAL=1 opts in)."
fi
echo
echo "Released $TAG at $COMMIT."
