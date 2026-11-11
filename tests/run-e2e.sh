#!/usr/bin/env bash
# Run the end-to-end suites against the site in the repo root (or SITE_DIR=/path/to/another/build).
# usage: tests/run-e2e.sh [suite-number ...]     e.g.  tests/run-e2e.sh 20 41
# SAFE: Chrome on a local static server, the practice (demo) controller and a pty/loopback fake bridge only. Local demo accounts only:
# no real credentials, no Supabase keys or SQL, no live machine. Needs: node, google-chrome, python3, `npm install` in tests/.
cd "$(dirname "$0")"; mkdir -p results screenshots
SUITES=("$@"); [ ${#SUITES[@]} -eq 0 ] && SUITES=(10 11 20 30 40 41 45 46 47 48 49 50 55 56 62)
for n in "${SUITES[@]}"; do
  f=$(ls e2e/${n}_*.mjs 2>/dev/null | head -1); [ -z "$f" ] && { echo "no suite $n"; continue; }
  echo "=== $f"; timeout 900 node "$f" 2>&1 | grep -v "dbus\|pid=\|^$" | cut -c1-300
done
