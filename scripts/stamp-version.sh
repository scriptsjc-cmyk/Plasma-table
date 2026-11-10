#!/usr/bin/env bash
# Stamp a release: ./scripts/stamp-version.sh [release-id] [commit]
# Rewrites version.json, js/version.js and the service-worker cache name so the three always agree.
# release-id defaults to today's date + "-r" + the short commit; commit defaults to `git rev-parse --short HEAD`.
set -e
cd "$(dirname "$0")/.."
COMMIT=${2:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}
ID=${1:-$(date +%Y.%m.%d)-$COMMIT}
BUILT=$(date +%Y-%m-%d)
printf '{"id":"%s","commit":"%s","built":"%s"}\n' "$ID" "$COMMIT" "$BUILT" > version.json
cat > js/version.js <<JS
// The release this copy of the app belongs to. scripts/stamp-version.sh rewrites this file, version.json and the
// service-worker cache name together, so a new release always gets a new cache and the "New version" banner.
export const VERSION = { id: "$ID", commit: "$COMMIT", built: "$BUILT" };
JS
sed -i "s|^const CACHE = .*|const CACHE = \"plasma-cad-$ID\";|" sw.js
echo "stamped $ID ($COMMIT)"
