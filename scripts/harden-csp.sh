#!/usr/bin/env bash
# Make sure the page's Content-Security-Policy has no ws:/wss: in connect-src.
#   ./scripts/harden-csp.sh [dir]     (default: the repo root; used by the Pages deploy workflow)
# Idempotent: if the policy is already clean, leave it and exit 0.
set -e
DIR="${1:-$(dirname "$0")/..}"
F="$DIR/index.html"
test -f "$F" || { echo "harden-csp: no index.html in $DIR"; exit 1; }
if grep -q "connect-src 'self' ws: " "$F"; then
  sed -i "s#connect-src 'self' ws: #connect-src 'self' #" "$F"
fi
if grep -Eq "connect-src[^;]*\bwss?:" "$F"; then echo "harden-csp: a ws:/wss: source is still in connect-src"; exit 1; fi
echo "hardened CSP in $F: no ws:/wss: in connect-src"
