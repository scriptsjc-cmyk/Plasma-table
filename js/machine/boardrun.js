// Run a cut from FluidNC's on-board flash so a USB/Bluetooth drop does not stop it.
// Upload: $Xmodem/Receive=/job.nc (XModem-CRC, see xmodem.js). Run: $LocalFS/Run=/job.nc.
// Status reports progress as |SD:<pct>,<path> (InputFile.cpp / Report.cpp in FluidNC v4.1.1).
// Soft reset (0x18), feed hold (!) and resume (~) are the same realtime characters as a streamed job,
// but only after the upload has finished — during XModem, 0x18 is CAN and '?' would corrupt the file.

import { sendXmodem, abortXmodem, CAN } from "./xmodem.js";

export const JOB_PATH = "/job.nc";
export const RUN_CMD = `$LocalFS/Run=${JOB_PATH}`;
export const RECEIVE_CMD = `$Xmodem/Receive=${JOB_PATH}`;
export const LOST_BOARD = {
  title: "The connection dropped but the table carries on cutting by itself.",
  text: "Reconnect to watch it or to stop it. Use the table's own E-stop if you need to stop it now.",
};
export const CHECK_LINE = "The cut runs on the table itself. If the laptop disconnects it keeps going, so stay with the table and know where its E-stop is.";

export function parseFileField(v) {
  const s = String(v == null ? "" : v);
  if (/: Sent\s*$/.test(s)) {
    return { pct: 100, name: s.replace(/: Sent\s*$/, "").trim(), sent: true };
  }
  const c = s.indexOf(",");
  if (c < 0) return null;
  const pct = Number(s.slice(0, c));
  if (!Number.isFinite(pct)) return null;
  return { pct, name: s.slice(c + 1), sent: false };
}

export function fileRunActive(st) {
  if (!st || !st.file || st.file.sent) return false;
  return st.state === "Run" || st.state === "Hold";
}

function encodeJob(lines) {
  const body = lines.filter((l) => String(l).trim() && !String(l).trim().startsWith(";")).map((l) => String(l).trim());
  const text = body.join("\n") + (body.length ? "\n" : "");
  return { body, bytes: new TextEncoder().encode(text) };
}

function bytePump() {
  const q = [];
  let wake = null;
  return {
    push(u8) {
      const a = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
      for (let i = 0; i < a.length; i++) q.push(a[i]);
      if (wake) { const w = wake; wake = null; w(); }
    },
    readByte(ms) {
      if (q.length) return Promise.resolve(q.shift());
      return new Promise((resolve) => {
        const t = setTimeout(() => { if (wake === to) { wake = null; resolve(-1); } }, ms);
        const to = () => { clearTimeout(t); resolve(q.length ? q.shift() : -1); };
        wake = to;
      });
    },
    drain() { const out = q.slice(); q.length = 0; return out; },
  };
}

function feedLines(g, bytes) {
  if (!bytes || !bytes.length) return "";
  const text = new TextDecoder().decode(Uint8Array.from(bytes));
  const raw = (g._rawTail || "") + text;
  g._rawTail = "";
  const parts = raw.split(/\r?\n/);
  if (!raw.endsWith("\n") && !raw.endsWith("\r")) g._rawTail = parts.pop();
  else if (parts[parts.length - 1] === "") parts.pop();
  for (const line of parts) {
    const l = line.replace(/\r$/, "").trim();
    if (l) g._line(l);
  }
  return text;
}

export function attachBoardRun(g, st, previous) {
  if (!fileRunActive(st)) return null;
  const prev = previous || (g.job && g.job.boardRun ? g.job : null);
  const pct = st.file.pct || 0;
  const total = (prev && prev.total) || 1;
  g.job = {
    total,
    sent: total,
    acked: Math.round((pct / 100) * total),
    errors: 0,
    running: true,
    started: (prev && prev.started) || Date.now(),
    finished: null,
    result: null,
    boardRun: true,
    phase: "run",
    pct,
    sawFile: true,
    attached: !prev || !!prev.unwatched,
    unwatched: false,
    path: st.file.name || JOB_PATH,
  };
  g._emit("job", g.jobProgress());
  g._emit("log", { text: `Reconnected: the table is still running ${g.job.path}.`, level: "info" });
  return g.job;
}

export function startBoardJob(g, lines) {
  if (g.job && g.job.running) throw new Error("A job is already running.");
  const { body, bytes } = encodeJob(lines);
  g.job = {
    total: body.length, sent: 0, acked: 0, errors: 0,
    running: true, started: Date.now(), finished: null, result: null,
    boardRun: true, phase: "upload", pct: 0, sawFile: false, unwatched: false, path: JOB_PATH,
  };
  g._emit("job", g.jobProgress());
  g._uploadLogs = [];
  const ac = new AbortController();
  g._uploadAbort = ac;
  const p = uploadThenRun(g, bytes, ac.signal).catch((e) => {
    if (g.job && g.job.running && g.job.phase === "upload") {
      g._finishJob("error", uploadErrorMessage(g, e));
    }
  }).finally(() => { if (g._uploadAbort === ac) g._uploadAbort = null; });
  g._boardRun = p;
  return p;
}

async function uploadThenRun(g, bytes, signal) {
  g.pausePoll();
  const pump = bytePump();
  g.setRaw(true, (u8) => pump.push(u8));
  let leftover = [];
  try {
    await g.t.write(RECEIVE_CMD + "\n");
    const io = {
      write: (b) => g.t.write(b),
      readByte: (ms) => pump.readByte(ms),
    };
    await sendXmodem(bytes, io, {
      blockSize: 1024,
      signal,
      onProgress: (p) => {
        if (g.job && g.job.phase === "upload") {
          g.job.pct = p.total ? (100 * p.sent) / p.total : 0;
          g.job.sent = Math.round((g.job.pct / 100) * g.job.total);
          g._emit("job", g.jobProgress());
        }
      },
    });
    leftover = pump.drain();
  } catch (e) {
    leftover = pump.drain();
    if (signal && signal.aborted) {
      try { await abortXmodem({ write: (b) => g.t.write(b) }); } catch (x) { /* ignore */ }
    }
    throw (signal && signal.aborted) ? new Error("Upload cancelled.") : e;
  } finally {
    g.setRaw(false);
    g.resumePoll();
    feedLines(g, leftover);
  }
  if (signal && signal.aborted) throw new Error("Upload cancelled.");
  const confirmed = await waitUploadOk(g, 4000);
  if (!confirmed.ok) throw new Error(confirmed.error || "The table did not confirm the file arrived.");

  if (g.job && g.job.running) { g.job.phase = "run"; g.job.pct = 0; g.job.sent = g.job.total; g._emit("job", g.jobProgress()); }
  g.send(RUN_CMD);
  const started = await waitRunStarted(g, 5000);
  if (!started) throw new Error("The table accepted the file but did not start the cut.");
}


function uploadErrorMessage(g, e) {
  const text = ((g._uploadLogs || []).join("\n") + " " + ((e && e.message) || "")).trim();
  if (/not enough free space/i.test(text)) return "The table hasn't enough free space for this cut.";
  if (/Reception failed/i.test(text) || /^error/im.test(text)) return "The table could not store the cut.";
  return (e && e.message) ? e.message : "Couldn't send the cut to the table.";
}

function waitUploadOk(g, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const logs = g._uploadLogs || [];
      const text = logs.join("\n");
      if (/Received \d+ bytes/i.test(text) || logs.includes("ok")) { resolve({ ok: true }); return; }
      if (logs.some((l) => /^error/i.test(l)) || /not enough free space/i.test(text) || /Reception failed/i.test(text)) {
        const space = /not enough free space/i.test(text);
        resolve({ ok: false, error: space ? "The table hasn't enough free space for this cut." : "The table could not store the cut." });
        return;
      }
      if (Date.now() - t0 > ms) resolve({ ok: false, error: "The table did not confirm the file arrived." });
      else setTimeout(tick, 50);
    };
    tick();
  });
}

function waitRunStarted(g, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (g.job && g.job.sawFile) { resolve(true); return; }
      const st = g.status || {};
      if (fileRunActive(st)) { if (g.job) g.job.sawFile = true; resolve(true); return; }
      const logs = g._uploadLogs || [];
      if (logs.some((l) => /^error/i.test(l))) { resolve(false); return; }
      if (Date.now() - t0 > ms) resolve(false);
      else setTimeout(tick, 50);
    };
    tick();
  });
}

// Hook from GrblLink._line / _closed / stop / status. Keeps board-run bookkeeping out of the streaming path.
export function onBoardLine(g, line) {
  if (g.job && g.job.boardRun && (g.job.phase === "upload" || !g.job.sawFile)) {
    g._uploadLogs = g._uploadLogs || [];
    g._uploadLogs.push(line);
    if (g._uploadLogs.length > 40) g._uploadLogs.shift();
  }
}

export function onBoardStatus(g, st) {
  if (g.job && g.job.running && g.job.boardRun && g.job.phase === "run") {
    if (st.file && Number.isFinite(st.file.pct)) {
      g.job.pct = st.file.pct;
      g.job.acked = Math.round((st.file.pct / 100) * g.job.total);
      g.job.sawFile = true;
      g.job.path = st.file.name || g.job.path;
      g._emit("job", g.jobProgress());
    }
    if (g.job.sawFile && st.state === "Idle" && !st.file) {
      g._finishJob("done", "Job finished on the table.");
    }
    return;
  }
  if (!(g.job && g.job.running) && fileRunActive(st)) attachBoardRun(g, st, null);
}

export function onBoardClosed(g) {
  if (g.job && g.job.running && g.job.boardRun && g.job.phase === "run") {
    g.job.unwatched = true;
    g._emit("job", g.jobProgress());
    g._emit("log", { text: "Connection dropped; the table is still running the cut by itself.", level: "warn" });
    return true;
  }
  return false;
}

export async function abortBoardUpload(g) {
  const ac = g._uploadAbort;
  if (ac) try { ac.abort(); } catch (e) { /* ignore */ }
  try { await abortXmodem({ write: (b) => g.t.write(b) }); } catch (e) { /* ignore */ }
  // 0x18 is CAN during XModem; once raw mode ends, a real reset is sent by stop().
  try { await g.t.write(new Uint8Array([CAN, CAN, CAN])); } catch (e) { /* ignore */ }
}
