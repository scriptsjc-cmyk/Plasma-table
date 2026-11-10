#!/usr/bin/env python3
"""Plasma table Wi-Fi bridge for a Raspberry Pi (no extra packages needed).

* Serves the plasma website over Wi-Fi (http://plasma.local).
* Passes commands between the website and the controller's USB port.
* Runs each cut job itself, so a Wi-Fi dropout or a phone going to sleep
  can't stall the torch in the middle of a cut. Reconnect and you see the job again.
* If the website disconnects while jogging, it cancels the jog.

Run:  python3 bridge.py --site /home/pi/plasma --port 80
"""
import argparse, asyncio, base64, glob, hashlib, json, mimetypes, os, struct, sys, termios, time, tty

RX_SIZE = 127                 # controller's receive buffer (grbl character counting)
RT_RESET, RT_HOLD, RT_JOG_CANCEL = b"\x18", b"!", b"\x85"
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ------------------------------------------------------------------ serial (USB) port, raw mode via termios
class Serial:
    def __init__(self, path, baud, on_line, on_state):
        self.path, self.baud, self.on_line, self.on_state = path, baud, on_line, on_state
        self.fd = None
        self.buf = b""

    def find(self):
        if self.path != "auto":
            return self.path
        for pat in ("/dev/ttyACM*", "/dev/ttyUSB*", "/dev/serial/by-id/*"):
            hits = sorted(glob.glob(pat))
            if hits:
                return hits[0]
        return None

    def open(self):
        path = self.find()
        if not path or not os.path.exists(path):
            return False
        fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        tty.setraw(fd)
        attrs = termios.tcgetattr(fd)
        speed = getattr(termios, f"B{self.baud}", termios.B115200)
        attrs[4] = attrs[5] = speed
        attrs[2] |= termios.CLOCAL | termios.CREAD
        attrs[2] &= ~termios.HUPCL
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        self.fd, self.buf = fd, b""
        asyncio.get_running_loop().add_reader(fd, self._readable)
        log("controller connected on", path)
        self.on_state(True)
        return True

    def _readable(self):
        try:
            data = os.read(self.fd, 4096)
        except (BlockingIOError, InterruptedError):
            return
        except OSError:
            data = b""
        if not data:
            return self.close()
        self.buf += data
        while b"\n" in self.buf:
            line, self.buf = self.buf.split(b"\n", 1)
            line = line.decode("latin-1").strip()
            if line:
                self.on_line(line)

    def write(self, data: bytes):
        if self.fd is None:
            return False
        try:
            while data:
                n = os.write(self.fd, data)
                data = data[n:]
            return True
        except BlockingIOError:
            time.sleep(0.002)
            return self.write(data)
        except OSError:
            self.close()
            return False

    def close(self):
        if self.fd is None:
            return
        try:
            asyncio.get_running_loop().remove_reader(self.fd)
        except Exception:
            pass
        try:
            os.close(self.fd)
        except OSError:
            pass
        self.fd = None
        log("controller unplugged")
        self.on_state(False)

    @property
    def ok(self):
        return self.fd is not None


# ------------------------------------------------------------------ the bridge: one controller, one website at a time
class Bridge:
    def __init__(self, args):
        self.args = args
        self.client = None                 # current website connection (WebSocket)
        self.inflight = []                 # lines in the controller's buffer, oldest first: (owner, nbytes, line)
        self.queue = []                    # job lines still to send
        self.job = None
        self.kept = None                   # what the website asked us to remember (where home is)
        self.serial = Serial(args.serial, args.baud, self.on_line, self.on_serial_state)

    # ---- job streaming on the Pi
    def job_state(self):
        j = self.job
        if not j:
            return None
        return {k: j[k] for k in ("total", "sent", "acked", "errors", "running", "result", "message", "started")}

    def start_job(self, lines):
        if self.job and self.job["running"]:
            return self.say_job()
        body = [l.strip() for l in lines if l.strip() and not l.strip().startswith(";")]
        self.job = {"total": len(body), "sent": 0, "acked": 0, "errors": 0, "running": True, "result": None,
                    "message": "", "started": time.time()}
        self.queue = list(body)
        log(f"job started: {len(body)} lines")
        self.pump()
        self.say_job()

    def finish_job(self, result, message):
        j = self.job
        if j and j["running"]:
            j["running"], j["result"], j["message"] = False, result, message
            self.queue = []
            log("job", result, "-", message)
            self.say_job()

    def pump(self):
        while self.queue and self.serial.ok:
            line = self.queue[0]
            n = len(line) + 1
            used = sum(x[1] for x in self.inflight)
            if used + n > RX_SIZE and self.inflight:
                break
            self.queue.pop(0)
            self.inflight.append(("job", n, line))
            self.serial.write((line + "\n").encode("latin-1"))
            self.job["sent"] += 1

    def ack(self, ok, text):
        if not self.inflight:
            return self.send({"t": "l", "d": text})          # nobody waiting: pass it on
        owner, _, line = self.inflight.pop(0)
        if owner == "web":
            self.send({"t": "l", "d": text})
        elif self.job:
            self.job["acked"] += 1
            if not ok:
                self.job["errors"] += 1
                self.send({"t": "l", "d": f"[MSG:Job line rejected: {line} -> {text}]"})
                self.finish_job("error", f"Job stopped: controller rejected '{line}'.")
                self.serial.write(RT_HOLD)
                asyncio.get_running_loop().call_later(0.25, lambda: self.serial.write(RT_RESET))  # reset = torch off
            elif self.job["running"] and self.job["acked"] >= self.job["total"]:
                self.finish_job("done", "Job sent. Waiting for the last moves to finish.")
            else:
                self.say_job(throttle=True)
        self.pump()

    # ---- controller -> website
    def on_line(self, line):
        if line == "ok":
            return self.ack(True, line)
        if line.startswith("error"):
            return self.ack(False, line)
        if line.startswith("ALARM"):
            self.inflight, self.queue = [], []
            self.finish_job("alarm", f"Job stopped by {line}.")
            if line.split(":")[-1].strip() in ("1", "2", "3", "10", "13"):
                self.kept = None                         # position lost
        elif line.lower().startswith("grbl"):            # controller restarted
            self.inflight, self.queue = [], []
            self.finish_job("stopped", "Controller reset.")
            self.kept = None
        self.send({"t": "l", "d": line})

    def on_serial_state(self, ok):
        if not ok:
            self.inflight, self.queue, self.kept = [], [], None
            self.finish_job("error", "Job stopped: controller unplugged from the Pi.")
        self.send({"t": "serial", "ok": ok})

    # ---- website -> controller
    def from_web(self, msg):
        t = msg.get("t")
        if t == "w":                                     # raw bytes/lines from the website
            data = msg.get("d", "").encode("latin-1", "replace")
            if RT_RESET in data:
                self.inflight, self.queue = [], []
                self.finish_job("stopped", "Stopped by operator.")
            # complete lines go into the shared buffer accounting so 'ok's reach the right owner
            for line in data.split(b"\n")[:-1]:
                clean = bytes(c for c in line if c < 0x80 and c not in b"?!~\x18").strip()
                if clean:
                    self.inflight.append(("web", len(clean) + 1, clean.decode("latin-1")))
            self.serial.write(data)
        elif t == "job":
            self.start_job(msg.get("lines") or [])
        elif t == "keep":
            self.kept = msg.get("data")

    # ---- websocket plumbing
    _last_job_say = 0.0

    def say_job(self, throttle=False):
        now = time.time()
        if throttle and now - self._last_job_say < 0.1:
            return
        self._last_job_say = now
        self.send({"t": "job", "job": self.job_state()})

    def send(self, obj):
        if self.client:
            self.client.send_text(json.dumps(obj))

    async def keep_serial(self):
        while True:
            if not self.serial.ok:
                try:
                    self.serial.open()
                except OSError as e:
                    log("can't open the controller port:", e)
            await asyncio.sleep(2)


# ------------------------------------------------------------------ tiny HTTP + WebSocket server (stdlib only)
class WSClient:
    def __init__(self, writer):
        self.w = writer
        self.closed = False

    def send_text(self, text):
        if self.closed:
            return
        data = text.encode("utf-8")
        n = len(data)
        head = bytes([0x81]) + (bytes([n]) if n < 126 else (bytes([126]) + struct.pack(">H", n) if n < 65536 else bytes([127]) + struct.pack(">Q", n)))
        try:
            self.w.write(head + data)
        except Exception:
            self.closed = True

    def close(self):
        self.closed = True
        try:
            self.w.close()
        except Exception:
            pass


async def read_frames(reader, client):
    """Yield complete text messages from a browser WebSocket."""
    parts, opcode0 = [], None
    while True:
        b1, b2 = await reader.readexactly(2)
        fin, op, masked, n = b1 & 0x80, b1 & 0x0F, b2 & 0x80, b2 & 0x7F
        if n == 126:
            n = struct.unpack(">H", await reader.readexactly(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", await reader.readexactly(8))[0]
        if n > 8_000_000:
            raise ValueError("message too big")
        mask = await reader.readexactly(4) if masked else b"\0\0\0\0"
        data = bytearray(await reader.readexactly(n))
        for i in range(n):
            data[i] ^= mask[i % 4]
        if op == 0x8:                                    # close
            return
        if op == 0x9:                                    # ping -> pong
            client.w.write(bytes([0x8A, len(data)]) + bytes(data[:125]))
            continue
        if op == 0xA:
            continue
        if op in (0x1, 0x2):
            parts, opcode0 = [bytes(data)], op
        elif op == 0x0:
            parts.append(bytes(data))
        if fin:
            yield b"".join(parts).decode("utf-8", "replace")
            parts = []


def make_handler(bridge: Bridge, site):
    site = os.path.realpath(site)

    async def handle(reader, writer):
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 20)
        except Exception:
            writer.close()
            return
        lines = head.decode("latin-1").split("\r\n")
        try:
            method, target, _ = lines[0].split(" ", 2)
        except ValueError:
            writer.close()
            return
        hdr = {}
        for l in lines[1:]:
            if ":" in l:
                k, v = l.split(":", 1)
                hdr[k.strip().lower()] = v.strip()
        path = target.split("?", 1)[0]

        if path == "/ws" and hdr.get("upgrade", "").lower() == "websocket":
            key = hdr.get("sec-websocket-key", "")
            accept = base64.b64encode(hashlib.sha1((key + WS_MAGIC).encode()).digest()).decode()
            writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                          f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
            client = WSClient(writer)
            if bridge.client:                            # newest screen takes over
                bridge.client.send_text(json.dumps({"t": "taken"}))
                bridge.client.close()
            bridge.client = client
            log("screen connected from", writer.get_extra_info("peername"))
            client.send_text(json.dumps({"t": "hello", "serial": bridge.serial.ok, "job": bridge.job_state(),
                                         "name": bridge.args.name, "keep": bridge.kept}))
            try:
                async for text in read_frames(reader, client):
                    try:
                        bridge.from_web(json.loads(text))
                    except Exception as e:
                        log("bad message:", e)
            except (asyncio.IncompleteReadError, ConnectionError, ValueError):
                pass
            finally:
                if bridge.client is client:
                    bridge.client = None
                    log("screen disconnected")
                    if not (bridge.job and bridge.job["running"]):
                        bridge.serial.write(RT_JOG_CANCEL)      # never leave a jog gliding
                client.close()
            return

        if method not in ("GET", "HEAD"):
            writer.write(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n")
        elif path == "/bridge.json":
            body = json.dumps({"bridge": True, "name": bridge.args.name, "serial": bridge.serial.ok}).encode()
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n"
                         + f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
        else:
            rel = path.lstrip("/") or "index.html"
            if rel.endswith("/"):
                rel += "index.html"
            full = os.path.realpath(os.path.join(site, rel))
            if not full.startswith(site + os.sep) or not os.path.isfile(full) or "/." in full[len(site):]:
                writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot found")
            else:
                with open(full, "rb") as f:
                    body = f.read()
                ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
                if full.endswith(".js"):
                    ctype = "text/javascript"
                writer.write(f"HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nCache-Control: no-cache\r\n"
                             f"Content-Length: {len(body)}\r\n\r\n".encode() + (body if method == "GET" else b""))
        try:
            await writer.drain()
        finally:
            writer.close()

    return handle


async def main():
    ap = argparse.ArgumentParser(description="Plasma table Wi-Fi bridge")
    ap.add_argument("--site", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    help="folder with index.html (default: the folder above this script)")
    ap.add_argument("--port", type=int, default=80)
    ap.add_argument("--serial", default="auto", help="controller port, e.g. /dev/ttyACM0 (default: find it)")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--name", default="Plasma table")
    args = ap.parse_args()
    bridge = Bridge(args)
    server = await asyncio.start_server(make_handler(bridge, args.site), "0.0.0.0", args.port)
    log(f"serving {args.site} on port {args.port}")
    asyncio.create_task(bridge.keep_serial())
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
