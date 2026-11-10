#!/usr/bin/env python3
# Plasma table Wi-Fi bridge. Auth: a per-install pairing token (?token=) and an Origin check
# (Origin must match Host, or be on the allowlist). Optional --tls CERT KEY serves HTTPS/WSS.
"""Plasma table Wi-Fi bridge for a Raspberry Pi (no extra packages needed).

* Serves the plasma website over Wi-Fi (http://plasma.local).
* Passes commands between the website and the controller's USB port.
* Runs each cut job itself, so a Wi-Fi dropout or a phone going to sleep
  can't stall the torch in the middle of a cut. Reconnect and you see the job again.
* If the website disconnects while jogging, it cancels the jog.

Run:  python3 bridge.py --site /home/pi/plasma --port 80
"""
import argparse, asyncio, base64, glob, hashlib, hmac, ipaddress, json, mimetypes, os, re, secrets, ssl, struct, sys, termios, time, tty
from urllib.parse import urlparse, parse_qs, quote
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

RX_SIZE = 127                 # controller's receive buffer (grbl character counting)
RT_RESET, RT_HOLD, RT_JOG_CANCEL = b"\x18", b"!", b"\x85"
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
STALE_SECONDS = 6.0           # no frame from the screen for this long = dead connection (the app sends '?' every 100 ms)
MAX_LINE = 255                # longest typed line passed on (grblHAL's line buffer is 256)
NEVER_SERVE_DIRS = ("pi", "supabase", "scripts")    # bridge code / token / account config / database schema are not part of the website
NEVER_SERVE_EXT = (".py", ".sh", ".sql", ".token", ".pyc", ".log", ".env", ".pem", ".key")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def default_token_path():
    """Keep the token OUTSIDE the folder the website is served from (it used to be pi/bridge.token, which the
    static file server handed out to anyone)."""
    home = os.path.expanduser("~")
    if not home or home == "~" or not os.path.isdir(home):
        home = "/var/tmp"
    return os.path.join(home, ".plasma-bridge-token")


def load_or_create_token(path):
    """Per-install pairing token: required as ?token= on the WebSocket."""
    try:
        if os.path.isfile(path):
            tok = open(path, encoding="utf-8").read().strip()
            if tok:
                return tok
    except OSError:
        pass
    tok = secrets.token_urlsafe(24)
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(tok + "\n")
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        log("pairing token saved to", path)
    except OSError as e:
        log("could not write token file", path, e)
    return tok


def load_origin_allowlist(path, extra):
    out = list(extra or [])
    try:
        if path and os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                out.extend(l.strip() for l in f if l.strip() and not l.strip().startswith("#"))
    except OSError:
        pass
    return out


def host_ok(hdr, allowlist):
    """DNS-rebinding guard: the Host header must name the Pi itself (an IP address, localhost, a .local / bare
    LAN name, or something on the allowlist). A web page on evil.example that re-points its DNS at the Pi sends
    Host: evil.example, so Origin == Host would otherwise pass."""
    host = (hdr.get("host") or "").strip().lower()
    if not host:
        return False
    if host.startswith("["):                        # [::1]:80
        name = host[1:].split("]", 1)[0]
    else:
        name = host.rsplit(":", 1)[0] if host.count(":") == 1 else host
    if name.endswith("."):
        name = name[:-1]
    if not name:
        return False
    for a in allowlist:
        a = a.strip().lower()
        if a and (a == host or a == name or urlparse(a if "//" in a else "//" + a).netloc.lower() in (host, name)):
            return True
    try:
        ipaddress.ip_address(name)
        return True
    except ValueError:
        pass
    return name == "localhost" or name.endswith(".local") or ("." not in name and name.isascii())


def origin_ok(hdr, allowlist):
    """Require Origin to match the Host header, or to be on the allowlist. Host must itself be the Pi."""
    if not host_ok(hdr, allowlist):
        return False
    origin = (hdr.get("origin") or "").strip()
    host = (hdr.get("host") or "").strip()
    if origin:
        net = urlparse(origin).netloc
        if host and net.lower() == host.lower():
            return True
        if origin in allowlist or net in allowlist:
            return True
        return False
    # no Origin: allow same-host navigations via Referer (token still required for /ws)
    ref = (hdr.get("referer") or "").strip()
    if ref and host and urlparse(ref).netloc.lower() == host.lower():
        return True
    return False


# Realtime bytes pass straight through; line-oriented commands must look like g-code / $ settings.
_RT = set(b"?!~\x18\x84\x85\x9e") | set(range(0x80, 0xA0))
_LINE = re.compile(
    r"^\s*(\?|!|~|\$J=|\$X\b|\$H\b|\$\$|\$#|\$I|\$G|\$N|\$\d+=|;|\(|%|[GgMmFfSsTtPpXxYyZzIiJjKkRrNnHh]\s*[-+.\d])"
)


def filter_web_bytes(data: bytes) -> bytes:
    out = bytearray()
    buf = bytearray()
    for b in data:
        if b in _RT:
            out.append(b)            # realtime bytes go straight through; grbl itself strips them from a half-typed line
            continue
        if b in (10, 13):
            line = bytes(buf).decode("latin-1", "replace")
            if line.strip() and len(buf) <= MAX_LINE and _LINE.match(line):   # grblHAL's line buffer is 256: longer is never valid
                out.extend(buf)
                out.append(10)
            buf.clear()
        elif 32 <= b < 127 or b == 9:
            buf.append(b)
    if buf:
        line = bytes(buf).decode("latin-1", "replace")
        if len(buf) <= MAX_LINE and _LINE.match(line):
            out.extend(buf)
    return bytes(out)


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
        try:
            tty.setraw(fd)
            attrs = termios.tcgetattr(fd)
            speed = getattr(termios, f"B{self.baud}", termios.B115200)
            attrs[4] = attrs[5] = speed
            attrs[2] |= termios.CLOCAL | termios.CREAD
            attrs[2] &= ~termios.HUPCL
            termios.tcsetattr(fd, termios.TCSANOW, attrs)
        except Exception:
            os.close(fd)             # don't leak the descriptor if the port is half-gone / not a tty
            raise
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



def _account_fatal(msg):
    """The account check is a safety gate: if it was asked for but can't be set up, refuse to start
    rather than silently falling back to 'pairing token only'."""
    print("plasma bridge: ACCOUNT CHECK MISCONFIGURED -", msg, file=sys.stderr, flush=True)
    sys.exit(2)


def load_account_cfg(args):
    """Optional machine-account check (Supabase). OFF by default: it is only on when a Supabase URL, the
    anon key and this table's serial are ALL set (flags, env, or pi/bridge.account.json). Pairing token and
    Origin checks always apply. Half-configured, or an unreadable/invalid config file, is a fatal error
    (fail closed) so a typo can't quietly turn the check off. Values come from flags, env, or the file."""
    cfg = {}
    explicit = bool(args.account_file)
    path = args.account_file or os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge.account.json")
    if os.path.isfile(path):
        try:
            cfg = json.loads(open(path, encoding="utf-8").read())
        except Exception as e:
            _account_fatal(f"could not read {path}: {e}")
        if not isinstance(cfg, dict):
            _account_fatal(f"{path} must contain a JSON object")
    elif explicit:
        _account_fatal(f"--account-file {path} does not exist")
    url = args.supabase_url or os.environ.get("PLASMA_SUPABASE_URL") or cfg.get("supabase_url") or ""
    serial = args.machine_serial or os.environ.get("PLASMA_MACHINE_SERIAL") or cfg.get("machine_serial") or ""
    anon = os.environ.get("PLASMA_SUPABASE_ANON") or cfg.get("supabase_anon") or ""
    if args.supabase_anon_file:
        try:
            anon = open(args.supabase_anon_file, encoding="utf-8").read().strip()
        except Exception as e:
            _account_fatal(f"could not read anon key file: {e}")
    url, serial, anon = str(url).strip(), str(serial).strip(), str(anon).strip()
    if url and serial and anon:
        host = urlparse(url).hostname or ""
        if not (url.startswith("https://") or (url.startswith("http://") and host in ("127.0.0.1", "localhost"))):
            _account_fatal("supabase_url must be https:// (the user's session token is sent to it)")
        if anon.count(".") == 2 and "service_role" in _jwt_role(anon):
            _account_fatal("that is a service_role key. Use the anon / publishable key, never the service key.")
        # machines.serial is stored upper-case by admin_add_machine
        return {"url": url.rstrip("/"), "serial": serial.upper(), "anon": anon}
    if url or serial or anon:
        _account_fatal("account check incomplete (need supabase URL, anon key and machine serial). "
                       "Set all three, or none to leave it off.")
    return None


def _jwt_role(tok):
    """Best-effort read of the (unverified) role claim, only to refuse a service_role key at start-up."""
    try:
        body = tok.split(".")[1]
        body += "=" * (-len(body) % 4)
        return str(json.loads(base64.urlsafe_b64decode(body)).get("role", ""))
    except Exception:
        return ""


_JWT_RE = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$")


def verify_machine_user(cfg, jwt, timeout=8):
    """Return (ok, user_id, message). The bridge never parses or trusts the token itself: Supabase Auth
    verifies signature, expiry and session at /auth/v1/user (so alg=none / key confusion can't work),
    then machines is read with the USER's token, so row-level security has to agree this user owns
    this serial."""
    if not jwt or not isinstance(jwt, str):
        return False, None, "Sign in and link this table to your account, then connect again."
    if len(jwt) > 4096 or not _JWT_RE.match(jwt):
        return False, None, "Sign-in expired. Sign in again, then reconnect."
    headers = {"Authorization": "Bearer " + jwt, "apikey": cfg["anon"]}
    try:
        req = Request(cfg["url"] + "/auth/v1/user", headers=headers)
        with urlopen(req, timeout=timeout) as r:
            user = json.loads(r.read().decode())
    except HTTPError as e:
        log("account jwt rejected", e.code)
        return False, None, "Sign-in expired. Sign in again, then reconnect."
    except (URLError, TimeoutError, ValueError) as e:
        log("account lookup failed", type(e).__name__)
        return False, None, "Could not reach the account service. Try again in a moment."
    uid = user.get("id") if isinstance(user, dict) else None
    if not uid or not isinstance(uid, str) or user.get("is_anonymous") or user.get("aud") not in (None, "authenticated"):
        return False, None, "Sign-in expired. Sign in again, then reconnect."
    try:
        q = cfg["url"] + "/rest/v1/machines?select=serial,owner&serial=eq." + quote(cfg["serial"], safe="") + "&owner=eq." + quote(uid, safe="")
        req = Request(q, headers=headers)
        with urlopen(req, timeout=timeout) as r:
            rows = json.loads(r.read().decode())
    except Exception as e:
        log("machine ownership check failed", type(e).__name__)
        return False, uid, "Could not confirm this table is linked to your account."
    if not (isinstance(rows, list) and any(isinstance(x, dict) and x.get("owner") == uid
                                           and str(x.get("serial", "")).upper() == cfg["serial"] for x in rows)):
        return False, uid, "This account is not linked to this table. Ask the owner to transfer it, or claim it with the sticker code."
    return True, uid, "ok"


# ------------------------------------------------------------------ the bridge: one controller, one website at a time
class Bridge:
    def __init__(self, args):
        self.args = args
        self.client = None                 # current website connection (WebSocket)
        self.inflight = []                 # lines in the controller's buffer, oldest first: (owner, nbytes, line)
        self.queue = []                    # job lines still to send
        self.job = None
        self.kept = None                   # what the website asked us to remember (where home is)
        self.torch_web = False             # a typed M3/M4 has no matching M5 yet (not a bridge-run job)
        self.serial = Serial(args.serial, args.baud, self.on_line, self.on_serial_state)
        self.token = args.token
        self.origins = args.origins
        self.account = getattr(args, "account", None)

    # ---- job streaming on the Pi
    def job_state(self):
        j = self.job
        if not j:
            return None
        return {k: j[k] for k in ("total", "sent", "acked", "errors", "running", "result", "message", "started")}

    @staticmethod
    def clean_job_lines(lines):
        """Job lines get the same treatment as typed input: one controller line per entry, printable ASCII only,
        no realtime characters (? ! ~ would hold/reset the controller from inside a comment), and nothing that
        doesn't look like g-code or a $ command."""
        out = []
        if not isinstance(lines, list):
            return out
        for entry in lines:
            if not isinstance(entry, str):
                continue
            for l in re.split(r"[\r\n]+", entry):
                l = re.sub(r"[^\x20-\x7e\t]|[?!~]", "", l).strip()
                if l and not l.startswith(";") and _LINE.match(l):
                    out.append(l)
        return out

    def start_job(self, lines):
        if self.job and self.job["running"]:
            return self.say_job()
        body = self.clean_job_lines(lines)
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
            data = filter_web_bytes(msg.get("d", "").encode("latin-1", "replace"))
            if not data:
                return
            if RT_RESET in data:
                self.inflight, self.queue = [], []
                self.torch_web = False
                self.finish_job("stopped", "Stopped by operator.")
            for ln in data.split(b"\n"):
                u = bytes(c for c in ln if c < 0x80 and c not in b"?!~").upper()
                if re.search(rb"\bM0*5\b|\bM0*2\b|\bM30\b", u):
                    self.torch_web = False
                elif re.search(rb"\bM0*[34]\b", u):
                    self.torch_web = True      # torch lit by a typed command (torch test); cleared by M5 / reset
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
                except (OSError, termios.error) as e:       # termios.error is NOT an OSError: it used to kill this loop for good
                    log("can't open the controller port:", e)
            await asyncio.sleep(2)


# ------------------------------------------------------------------ tiny HTTP + WebSocket server (stdlib only)
class WSClient:
    def __init__(self, writer):
        self.w = writer
        self.closed = False
        self.user_id = None
        self.linked = False
        self.auth_tries = 0
        self.last_rx = time.time()
        self.peer = writer.get_extra_info("peername")

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
        client.last_rx = time.time()
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
        qparts = target.split("?", 1)
        path = qparts[0]
        qs = parse_qs(qparts[1], keep_blank_values=True) if len(qparts) > 1 else {}

        if path == "/ws" and hdr.get("upgrade", "").lower() == "websocket":
            tok = (qs.get("token") or [""])[0]
            if not origin_ok(hdr, bridge.origins) or not hmac.compare_digest(tok.encode("utf-8", "replace"), bridge.token.encode("utf-8", "replace")):
                log("ws rejected: origin or token", hdr.get("origin"), hdr.get("host"))
                writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
                try:
                    await writer.drain()
                finally:
                    writer.close()
                return
            if bridge.client and time.time() - bridge.client.last_rx > STALE_SECONDS:
                # the app polls the controller every 100 ms, so a socket that has been silent this long is a phone that
                # dropped off Wi-Fi without a goodbye. Let the operator back in instead of locking them out.
                log("dropping stale screen connection", bridge.client.peer)
                old, bridge.client = bridge.client, None
                old.close()
            if bridge.client:                            # single-client lock: never silently take over
                log("ws busy: operator already connected")
                writer.write(b"HTTP/1.1 409 Conflict\r\nContent-Length: 0\r\n\r\n")
                try:
                    await writer.drain()
                finally:
                    writer.close()
                return
            key = hdr.get("sec-websocket-key", "")
            accept = base64.b64encode(hashlib.sha1((key + WS_MAGIC).encode()).digest()).decode()
            writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                          f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
            client = WSClient(writer)
            bridge.client = client
            log("screen connected from", writer.get_extra_info("peername"))
            hello = {"t": "hello", "serial": bridge.serial.ok, "job": bridge.job_state(),
                     "name": bridge.args.name, "keep": bridge.kept,
                     "need_account": bool(bridge.account)}
            client.send_text(json.dumps(hello))
            try:
                async for text in read_frames(reader, client):
                    try:
                        msg = json.loads(text)
                    except Exception as e:
                        log("bad message:", e)
                        continue
                    if not isinstance(msg, dict):
                        continue
                    if msg.get("t") == "auth" and bridge.account:
                        client.auth_tries += 1
                        if client.auth_tries > 10:                      # each try costs two calls to Supabase
                            client.send_text(json.dumps({"t": "auth_err", "msg": "Too many sign-in attempts. Reconnect to try again."}))
                            break
                        ok, uid, err = await asyncio.to_thread(verify_machine_user, bridge.account, msg.get("jwt") or "")
                        client.user_id = uid
                        client.linked = bool(ok)
                        if ok:
                            log("account linked", uid)
                            client.send_text(json.dumps({"t": "auth_ok"}))
                        else:
                            log("account rejected", err)
                            client.send_text(json.dumps({"t": "auth_err", "msg": err}))
                        continue
                    if bridge.account and not client.linked and msg.get("t") in ("w", "job", "keep"):
                        # Not (yet) linked: no g-code, no jobs, no remembered position. But STOP must always
                        # work (e.g. the sign-in token expired while a job runs on the Pi): pass on only the
                        # realtime reset (0x18), feed hold (!) and jog cancel (0x85) bytes, nothing else.
                        if msg.get("t") == "w":
                            stop = "".join(c for c in str(msg.get("d", "")) if c in ("\x18", "!", "\x85"))
                            if stop:
                                bridge.from_web({"t": "w", "d": stop})
                        client.send_text(json.dumps({"t": "auth_err", "msg": "This account is not linked to this table."}))
                        continue
                    try:
                        bridge.from_web(msg)
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
                        if bridge.torch_web:                    # typed M3 with no M5 yet: don't leave the torch lit
                            bridge.torch_web = False
                            log("screen lost with the torch on: hold + reset")
                            bridge.serial.write(RT_HOLD)
                            asyncio.get_running_loop().call_later(0.25, lambda: bridge.serial.write(RT_RESET))
                client.close()
            return

        if not host_ok(hdr, bridge.origins):                # DNS-rebinding guard for every request
            writer.write(b"HTTP/1.1 421 Misdirected Request\r\nContent-Length: 0\r\n\r\n")
        elif method not in ("GET", "HEAD"):
            writer.write(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n")
        elif path == "/bridge.json":
            if not origin_ok(hdr, bridge.origins):
                writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
            else:
                body = json.dumps({"bridge": True, "name": bridge.args.name, "serial": bridge.serial.ok,
                                   "token": bridge.token}).encode()
                writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n"
                             + f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
        else:
            rel = path.lstrip("/") or "index.html"
            if rel.endswith("/"):
                rel += "index.html"
            full = os.path.realpath(os.path.join(site, rel))
            relp = full[len(site):].lstrip(os.sep)
            if (not full.startswith(site + os.sep) or not os.path.isfile(full) or "/." in full[len(site):]
                    or relp.split(os.sep)[0].lower() in NEVER_SERVE_DIRS or relp.lower().endswith(NEVER_SERVE_EXT)):
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
    ap.add_argument("--token-file", default=None, help="file holding the pairing token (created if missing)")
    ap.add_argument("--origin", action="append", default=[], help="extra allowed Origin (repeatable allowlist)")
    ap.add_argument("--origins-file", default=None, help="file of extra allowed Origins, one per line")
    # Optional TLS so the LAN can use HTTPS and WSS (a LAN-signed cert is fine).
    ap.add_argument("--tls", nargs=2, metavar=("CERT", "KEY"),
                    help="serve HTTPS and WSS with this certificate and key")
    ap.add_argument("--machine-serial", default=None,
                    help="this table's serial; with Supabase, require a linked account before G-code")
    ap.add_argument("--supabase-url", default=None, help="Supabase project URL for account checks")
    ap.add_argument("--supabase-anon-file", default=None,
                    help="file containing the Supabase anon key (do not pass the key on the command line)")
    ap.add_argument("--account-file", default=None,
                    help="JSON with supabase_url, supabase_anon, machine_serial (default: pi/bridge.account.json)")
    args = ap.parse_args()
    token_file = args.token_file or default_token_path()
    args.token = load_or_create_token(token_file)
    args.origins = load_origin_allowlist(args.origins_file, args.origin)
    args.account = load_account_cfg(args)
    if args.account:
        log("account check on for serial", args.account["serial"])
    bridge = Bridge(args)
    ssl_ctx = None
    if args.tls:
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_ctx.load_cert_chain(args.tls[0], args.tls[1])
        log(f"TLS enabled (wss) with cert {args.tls[0]}")
    server = await asyncio.start_server(make_handler(bridge, args.site), "0.0.0.0", args.port, ssl=ssl_ctx)
    log(f"serving {args.site} on port {args.port}")
    asyncio.create_task(bridge.keep_serial())
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
