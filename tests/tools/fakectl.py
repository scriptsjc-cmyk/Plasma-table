#!/usr/bin/env python3
"""Runs the Pi bridge (test copy, bound to 127.0.0.1) against a *pty pair* standing in for the controller.
Everything the bridge writes to 'serial' is appended to <out>. Never touches a real serial device."""
import os, pty, subprocess, sys, threading, time, tty
site, port, out = sys.argv[1], sys.argv[2], sys.argv[3]
master, slave = pty.openpty(); tty.setraw(master)
sname = os.ttyname(slave)
src = open(os.path.join(site, "pi/bridge.py")).read().replace('"0.0.0.0", args.port', '"127.0.0.1", args.port')   # test-only: loopback bind
open("/tmp/bridge_local.py", "w").write(src)
p = subprocess.Popen([sys.executable, "/tmp/bridge_local.py", "--site", site, "--port", port, "--serial", sname, "--name", "FAKE"], stdout=sys.stderr, stderr=sys.stderr)
def pump():
    with open(out, "ab", buffering=0) as f:
        while True:
            try: d = os.read(master, 4096)
            except OSError: return
            f.write(d)
            if b"G0" in d or b"$J" in d or b"\n" in d:
                os.write(master, b"ok\r\n")           # pretend to be a happy controller
threading.Thread(target=pump, daemon=True).start()
try: p.wait()
except KeyboardInterrupt: p.terminate()
