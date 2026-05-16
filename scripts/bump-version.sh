#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/bump-version.sh [major|minor|patch]
# Defaults to patch bump.
#
# Updates the version in:
#   - desktop/package.json
#   - desktop/package-lock.json
#   - README.md (all download links)
#   - landing/components/hero.tsx (fallback download URLs)
# Then commits with message: release: vX.Y.Z-alpha

BUMP="${1:-patch}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ---------------------------------------------------------------------------
# Read current version from desktop/package.json
# ---------------------------------------------------------------------------
CURRENT_VERSION=$(node -p "require('${ROOT}/desktop/package.json').version")
echo "Current version: ${CURRENT_VERSION}"

# Strip the -alpha suffix to work with semver parts
BASE_VERSION="${CURRENT_VERSION%-alpha}"
IFS='.' read -r MAJOR MINOR PATCH <<< "${BASE_VERSION}"

# ---------------------------------------------------------------------------
# Compute new version
# ---------------------------------------------------------------------------
case "${BUMP}" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "Unknown bump type '${BUMP}'. Use: major | minor | patch" >&2
    exit 1
    ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}-alpha"
echo "New version:     ${NEW_VERSION}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
replace_in_file() {
  local file="$1"
  local old="$2"
  local new="$3"
  sed -i '' "s|${old}|${new}|g" "${file}"
}

# ---------------------------------------------------------------------------
# desktop/package.json
# ---------------------------------------------------------------------------
replace_in_file "${ROOT}/desktop/package.json" \
  "\"version\": \"${CURRENT_VERSION}\"" \
  "\"version\": \"${NEW_VERSION}\""

# ---------------------------------------------------------------------------
# desktop/package-lock.json
# ---------------------------------------------------------------------------
replace_in_file "${ROOT}/desktop/package-lock.json" \
  "\"version\": \"${CURRENT_VERSION}\"" \
  "\"version\": \"${NEW_VERSION}\""

# ---------------------------------------------------------------------------
# README.md  (all occurrences of the old version string in URLs)
# ---------------------------------------------------------------------------
replace_in_file "${ROOT}/README.md" \
  "${CURRENT_VERSION}" \
  "${NEW_VERSION}"

# ---------------------------------------------------------------------------
# landing/components/hero.tsx  (fallback download URL strings)
# ---------------------------------------------------------------------------
replace_in_file "${ROOT}/landing/components/hero.tsx" \
  "${CURRENT_VERSION}" \
  "${NEW_VERSION}"

echo ""
echo "Version bumped: ${CURRENT_VERSION} → ${NEW_VERSION}"
echo ""
echo "Files updated:"
echo "  desktop/package.json"
echo "  desktop/package-lock.json"
echo "  README.md"
echo "  landing/components/hero.tsx"
echo ""

# ---------------------------------------------------------------------------
# Optional: commit
# ---------------------------------------------------------------------------
read -r -p "Commit changes with 'release: v${NEW_VERSION}'? [y/N] " CONFIRM
if [[ "${CONFIRM}" =~ ^[Yy]$ ]]; then
  git -C "${ROOT}" add \
    desktop/package.json \
    desktop/package-lock.json \
    README.md \
    landing/components/hero.tsx
  git -C "${ROOT}" commit -m "release: v${NEW_VERSION}"
  echo "Committed: release: v${NEW_VERSION}"
else
  echo "Skipped commit. Stage and commit manually when ready."
fi
