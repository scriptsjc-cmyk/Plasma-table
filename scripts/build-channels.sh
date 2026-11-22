#!/usr/bin/env bash
# r15 9.1 release channels. Run by the Pages deploy, after the main site is stamped:   ./scripts/build-channels.sh [site-dir]
#   stable/      the newest release Josh promoted (a git tag stable-*, made by the "Promote to stable" workflow after a real cut)
#   v/<id>/      the newest 3 promoted releases (the first is the same as stable/), kept for rollback
# With no stable-* tag yet it does nothing, so the deploy is exactly what it was. Each copy is stamped with its own release id
# and the channel name, its service worker gets its own cache prefix (so channels never delete each other's offline copy),
# and its page gets the same CSP tightening as the main site. tests/ and docs/ are left out of the copies.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT}"
cd "$ROOT"
KEEP=3
TAGS=$(git for-each-ref --sort=-creatordate --format='%(refname:short)' 'refs/tags/stable-*' | head -n "$KEEP")
if [ -z "$TAGS" ]; then echo "channels: no stable release yet (no stable-* tag); nothing added"; exit 0; fi
rm -rf "$OUT/stable" "$OUT/v"
copy() {   # copy <tag> <dir> <channel> <cache-prefix>
  local tag="$1" dir="$2" channel="$3" prefix="$4"
  local sha; sha=$(git rev-list -n 1 "$tag"); local short=${sha:0:7}
  local day; day=$(git log -1 --format=%cd --date=format:%Y.%m.%d "$sha")
  local id="$day-$short"
  mkdir -p "$dir"
  git archive "$sha" | tar -x -C "$dir" --exclude='tests' --exclude='docs' --exclude='.github'
  if [ ! -x "$dir/scripts/stamp-version.sh" ]; then echo "channels: $tag has no scripts/stamp-version.sh"; exit 1; fi
  ( cd "$dir" && GITHUB_SHA="$sha" ./scripts/stamp-version.sh "$id" "$short" >/dev/null )
  # the channel name in version.json and js/version.js, and a cache prefix of its own in sw.js
  sed -i "s|^{\"id\":\"$id\"|{\"id\":\"$id\",\"channel\":\"$channel\",\"tag\":\"$tag\"|" "$dir/version.json"
  sed -i "s|^export const VERSION = { id: \"$id\"|export const VERSION = { channel: \"$channel\", id: \"$id\"|" "$dir/js/version.js"
  sed -i "s|^const CACHE = \"plasma-cad-|const CACHE = \"$prefix|; s|^const PREFIX = \"plasma-cad-\";|const PREFIX = \"$prefix\";|" "$dir/sw.js"
  grep -q "^const PREFIX = \"$prefix\";" "$dir/sw.js" || { echo "channels: could not give $dir/sw.js its own cache prefix"; exit 1; }
  ./scripts/harden-csp.sh "$dir" >/dev/null
  echo "channels: $channel <- $tag ($id) in ${dir#$OUT/}"
}
FIRST=$(echo "$TAGS" | head -n 1)
copy "$FIRST" "$OUT/stable" stable "plasma-cad-stable-"
for tag in $TAGS; do
  sha=$(git rev-list -n 1 "$tag"); short=${sha:0:7}
  copy "$tag" "$OUT/v/$short" "v-$short" "plasma-cad-v-$short-"
done
# a small index of what is kept, for the app's About and for rolling back
{ printf '{"stable":"%s","kept":[' "$FIRST"; first=1; for tag in $TAGS; do sha=$(git rev-list -n 1 "$tag"); [ $first = 1 ] || printf ','; first=0; printf '{"tag":"%s","commit":"%s","path":"v/%s/"}' "$tag" "${sha:0:7}" "${sha:0:7}"; done; printf ']}\n'; } > "$OUT/channels.json"
cat "$OUT/channels.json"
