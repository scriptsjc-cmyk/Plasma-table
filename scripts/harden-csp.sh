#!/usr/bin/env bash
# Public (https) release only: remove WebSocket access from the page's Content-Security-Policy.
#   ./scripts/harden-csp.sh [dir]     (default: the repo root; used by the Pages deploy workflow)
# The repo copy of index.html keeps `ws:` in connect-src so a copy served over plain http on your LAN (or by the Pi) can open
# ws://<fluidnc-ip>:81. The public site is https, and a browser never lets an https page open ws:// (mixed content), so there
# the permission is useless and only widens what a hostile script could try. This removes it, leaving 'self' and Supabase.
set -e
DIR=${1:-$(cd "$(dirname "$0")/.." && pwd)}
F="$DIR/index.html"
grep -q "connect-src 'self' ws: " "$F" || { echo "harden-csp: expected connect-src 'self' ws: ... in $F (already hardened, or the policy changed)"; exit 1; }
sed -i "s#connect-src 'self' ws: #connect-src 'self' #" "$F"
if grep -Eq "connect-src[^;]*\bwss?:" "$F"; then echo "harden-csp: a ws:/wss: source is still in connect-src"; exit 1; fi
echo "hardened CSP in $F: no ws:/wss: in connect-src"
