#!/bin/bash
# Serve this app over HTTP so a browser may open FluidNC at ws://<ip>:81.
# Usage: ./scripts/serve-local.sh [port]
# Then open http://127.0.0.1:<port>/
cd "$(dirname "$0")/.."
PORT="${1:-8080}"
echo "Open http://127.0.0.1:$PORT/  (HTTP, so FluidNC ws:// on the LAN is allowed)"
if command -v python3 >/dev/null; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
fi
echo "python3 is needed to serve the files."
exit 1
