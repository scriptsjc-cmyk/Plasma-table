#!/usr/bin/env bash
# Stamp a release: ./scripts/stamp-version.sh [release-id] [commit]
# Rewrites version.json, js/version.js and the service-worker cache name so the three always agree.
# Run it INSIDE the deploy workflow, after checkout and before the files are published, so the id always comes from the commit being deployed:
#   - name: Stamp version
#     run: ./scripts/stamp-version.sh
# commit defaults to $GITHUB_SHA (short) or `git rev-parse --short HEAD`; release-id defaults to <date>-<commit>.
set -e
cd "$(dirname "$0")/.."
COMMIT=${2:-$( [ -n "$GITHUB_SHA" ] && echo "${GITHUB_SHA:0:7}" || git rev-parse --short HEAD 2>/dev/null || echo unknown )}
ID=${1:-$(date +%Y.%m.%d)-$COMMIT}
BUILT=$(date +%Y-%m-%d)
printf '{"id":"%s","commit":"%s","built":"%s"}\n' "$ID" "$COMMIT" "$BUILT" > version.json
cat > js/version.js <<JS
// The release this copy of the app belongs to. scripts/stamp-version.sh rewrites this file, version.json and the
// service-worker cache name together, so a new release always gets a new cache and the "New version" banner.
// (The page itself reads version.json at start-up, so footer/About match the deployed commit even if only that file is stamped.)
export const VERSION = { id: "$ID", commit: "$COMMIT", built: "$BUILT" };
JS
sed -i "s|^const CACHE = .*|const CACHE = \"plasma-cad-$ID\";|" sw.js
echo "stamped $ID ($COMMIT)"
