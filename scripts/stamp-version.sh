#!/usr/bin/env bash
# Stamp a release: ./scripts/stamp-version.sh [release-id] [commit]
# Rewrites version.json, js/version.js, the service-worker cache name AND its precache list (the app-shell files that exist) so they always agree.
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
# precache list: the page, styles (style.css and css/**), scripts (js/**), config and icons that are really there (so a renamed, moved or new file can never be missed or 404 the install)
LIST=$( { echo "./"; echo index.html; [ -f style.css ] && echo style.css; echo manifest.json; echo version.json
          ls favicon.svg favicon-32.png icon-*.png logo.svg 2>/dev/null
          find css -type f -name '*.css' 2>/dev/null | LC_ALL=C sort            # every stylesheet, in any sub-folder
          find js -type f -name '*.js' | LC_ALL=C sort                          # every module, in any sub-folder (js/core, js/make, js/cut, ...)
          ls config/machine.json config/cut_chart.json config/grblhal_settings.txt config/fluidnc-plasma.yaml 2>/dev/null; } | awk 'NF && !seen[$0]++ { printf "  \"%s\",\n", $0 }' )
awk -v list="$LIST" '
  /\/\* precache:start \*\//    { print; print list; skip = 1; next }
  /\/\* precache:end \*\//      { skip = 0 }
  !skip { print }' sw.js > sw.js.new && mv sw.js.new sw.js
echo "stamped $ID ($COMMIT)"
