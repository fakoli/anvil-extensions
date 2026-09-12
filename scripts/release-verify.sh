#!/usr/bin/env bash
# release-verify.sh — clean-room release gate.
#
# Reproduces, in a scratch clone, everything that can break only in a clean
# environment: lockfile/manifest sync, workspace resolution (the symlink class
# of regressions), hardcoded host paths, identity leakage, and the full test
# matrix. Run this BEFORE cutting a release tag; scripts/release.sh calls it
# automatically. Exits non-zero on any failure — never tag on red.
set -euo pipefail

# Self-sufficient PATH: gh (~/.local/bin) and bun (~/.bun/bin) are not on
# a non-interactive shell's default PATH.
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MATRIX="$REPO_ROOT/scripts/test-matrix.txt"
BUNDLE_VERSION="${BUNDLE_VERSION:-0.85.1}"
SCRATCH="${TMPDIR:-/tmp}/anvil-extensions-verify.$$"
HOSTP_A=""; HOSTP_B=""; IDENT_A=""; IDENT_B=""; IDENT_C=""; FAILED=0

cleanup() { rm -rf "$SCRATCH"; }
trap cleanup EXIT

fail() { echo "✗ $*" >&2; FAILED=1; }
ok()   { echo "✓ $*"; }

echo "== clean-room clone =="
mkdir -p "$SCRATCH"
git -C "$REPO_ROOT" archive HEAD | tar -x -C "$SCRATCH"
ok "archive of HEAD extracted to $SCRATCH"

echo
echo "== static checks =="
# Patterns are assembled at runtime so this script never matches itself.
HOSTP="${HOSTP_A}/data/apps/dev${HOSTP_B}tools"
# 1. No hardcoded host install paths in tracked files — they break any other
#    machine and once broke CI for five packages at once.
if grep -rn "$HOSTP" --include="*" \
     --exclude-dir=node_modules "$SCRATCH" >/dev/null 2>&1; then
  grep -rln "$HOSTP" --exclude-dir=node_modules "$SCRATCH" | sed 's/^/  /' >&2
  fail "hardcoded host paths present (use PI_INSTALL_DIR resolution chain)"
else
  ok "no hardcoded host paths"
fi

# 2. Identity scrub patterns must not appear in the tree.
IDENT_RE="${IDENT_A}sek${IDENT_B}ou|doum${IDENT_C}bouya|@(gmail|outlook|proton)\."
if grep -rniE "$IDENT_RE" \
     --exclude-dir=node_modules --exclude-dir=.git \
     "$SCRATCH" >/dev/null 2>&1; then
  grep -rliE "$IDENT_RE" "$SCRATCH" | sed 's/^/  /' >&2
  fail "identity-shaped strings in tracked files"
else
  ok "no identity-shaped strings in tree"
fi

# 3. Runtime noise must never be tracked.
if git -C "$REPO_ROOT" ls-files | grep -qE "^\.pi/|^\.pi-subagents/|node_modules/"; then
  fail "runtime noise is tracked (check .gitignore)"
else
  ok "no runtime noise tracked"
fi

echo
echo "== clean install (lockfile fidelity, workspace symlinks) =="
cd "$SCRATCH"
if npm ci --no-audit --no-fund >/dev/null 2>&1; then
  ok "npm ci against the committed lockfile"
else
  fail "npm ci failed — lockfile out of sync with manifests?"
fi

if npm audit --audit-level=high; then
  ok "dependency security audit"
else
  fail "dependency security audit failed"
fi

for ws in $(sed 's/#.*//' "$MATRIX" | grep -v '^$'); do
  if [ -e "node_modules/$ws" ]; then
    ok "workspace resolved: $ws"
  else
    fail "workspace NOT resolved in node_modules: $ws (symlink regression?)"
  fi
done

echo
echo "== pi bundle for module aliases =="
mkdir -p "$SCRATCH/../anvil-verify-bundle"
(cd "$SCRATCH/../anvil-verify-bundle"
  [ -f package.json ] || npm init -y >/dev/null 2>&1
  npm install "@earendil-works/pi-coding-agent@$BUNDLE_VERSION" --no-audit --no-fund >/dev/null 2>&1)
export PI_INSTALL_DIR="$SCRATCH/../anvil-verify-bundle/node_modules/@earendil-works/pi-coding-agent"
ok "bundle $BUNDLE_VERSION at $PI_INSTALL_DIR"

echo
echo "== test matrix =="
while IFS= read -r ws; do
  [ -z "$ws" ] && continue
  echo "-- $ws"
  if npm test --workspace "$ws" >/dev/null 2>&1; then
    ok "$ws"
  else
    fail "$ws (npm test --workspace failed)"
  fi
done < <(sed 's/#.*//' "$MATRIX" | grep -v '^$')

echo
if [ "$FAILED" -ne 0 ]; then
  echo "RELEASE BLOCKED — fix the failures above before tagging." >&2
  exit 1
fi
echo "ALL CHECKS PASSED — safe to release."