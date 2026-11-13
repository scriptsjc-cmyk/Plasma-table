// Unit tests for the XModem-CRC sender against a FluidNC-like mock receiver. No hardware.
import { T } from "../lib/t.mjs";
import { SOH, STX, EOT, ACK, NAK, CAN, CRC_C, CTRLZ, crc16, buildPacket, sendXmodem, abortXmodem } from "../../js/machine/xmodem.js";

const t = new T("93_xmodem");
const enc = new TextEncoder();

// CRC-16/XMODEM check: "123456789" -> 0x31C3
t.check("crc16 of 123456789 is 0x31C3 (CRC-16/XMODEM)", crc16(enc.encode("123456789")) === 0x31c3, crc16(enc.encode("123456789")).toString(16));

const pkt = buildPacket(128, 1, enc.encode("hi"), 0, true);
t.check("128-byte packet starts SOH, pkt 1, ~1", pkt[0] === SOH && pkt[1] === 1 && pkt[2] === 0xfe && pkt.length === 133);
t.check("128-byte packet payload starts with hi and pads with 0x1A", pkt[3] === 0x68 && pkt[4] === 0x69 && pkt[5] === CTRLZ && pkt[3 + 127] === CTRLZ);
t.check("128-byte packet CRC matches", crc16(pkt, 3, 128) === ((pkt[131] << 8) | pkt[132]));

const pkt1k = buildPacket(1024, 2, new Uint8Array(1024).fill(7), 0, true);
t.check("1K packet starts STX, pkt 2", pkt1k[0] === STX && pkt1k[1] === 2 && pkt1k[2] === 0xfd && pkt1k.length === 1029);

function mockIo(receiver) {
  const incoming = [];
  let wake = null;
  const pushIn = (b) => { incoming.push(b); if (wake) { const w = wake; wake = null; w(); } };
  const io = {
    writes: [],
    write(bytes) { io.writes.push(Uint8Array.from(bytes)); receiver(Uint8Array.from(bytes), pushIn); return Promise.resolve(); },
    readByte(ms) {
      if (incoming.length) return Promise.resolve(incoming.shift());
      return new Promise((resolve) => {
        const timer = setTimeout(() => { if (wake) { wake = null; resolve(-1); } }, ms);
        wake = () => { clearTimeout(timer); resolve(incoming.length ? incoming.shift() : -1); };
      });
    },
    inject: pushIn,
  };
  return io;
}

// FluidNC-like receiver: send 'C', accept SOH/STX CRC packets, ACK, EOT -> ACK, collect unpadded data.
function fluidncReceiver({ noSpace = false, failAt = 0, startWith = CRC_C, hang = false } = {}) {
  let expect = 1, mode = "hello", held = null, file = [];
  const rec = { file, cancelled: false, started: false };
  rec.handle = (bytes, out) => {
    if (hang) return;
    let i = 0;
    const take = () => bytes[i++];
    if (mode === "hello") {
      // sender may write the first packet as soon as it sees C; we already sent C via inject
      mode = "pkt";
    }
    while (i < bytes.length) {
      const c = take();
      if (mode === "eotwait" || c === EOT) {
        if (noSpace) { out(CAN); out(CAN); out(CAN); rec.cancelled = true; mode = "done"; return; }
        if (held) {
          let n = held.length; while (n > 0 && held[n - 1] === CTRLZ) n--;
          for (let k = 0; k < n; k++) file.push(held[k]);
          held = null;
        }
        out(ACK); mode = "done"; rec.done = true; return;
      }
      if (c === CAN) { rec.cancelled = true; out(ACK); mode = "done"; return; }
      if (c !== SOH && c !== STX) continue;
      const size = c === STX ? 1024 : 128;
      // rest of packet should be in this write (our sender writes a whole packet)
      const rest = bytes.subarray(i);
      if (rest.length < 2 + size + 2) return;
      const pktNo = rest[0], inv = rest[1], data = rest.subarray(2, 2 + size);
      const crc = (rest[2 + size] << 8) | rest[2 + size + 1];
      i += 2 + size + 2;
      if (inv !== ((~pktNo) & 0xff) || crc16(data) !== crc) { out(NAK); continue; }
      if (pktNo !== (expect & 0xff) && pktNo !== ((expect - 1) & 0xff)) { out(NAK); continue; }
      if (pktNo === (expect & 0xff)) {
        if (failAt && expect === failAt) { out(CAN); out(CAN); rec.cancelled = true; mode = "done"; return; }
        if (held) { for (let k = 0; k < held.length; k++) file.push(held[k]); }
        held = Uint8Array.from(data);
        expect = (expect + 1) & 0xff;
      }
      out(ACK);
      rec.started = true;
    }
  };
  rec.hello = startWith;
  return rec;
}

{ // happy path, 1K CRC, payload not a multiple of the block
  const rec = fluidncReceiver();
  const io = mockIo(rec.handle);
  io.inject(CRC_C);
  const payload = enc.encode("G0 X1\nG1 Y2 F1000\nM5\n");
  const prog = [];
  const r = await sendXmodem(payload, io, { blockSize: 1024, onProgress: (p) => prog.push(p) });
  t.check("upload ok: reports byte count", r.bytes === payload.length && r.blocks === 1, JSON.stringify(r));
  const got = Uint8Array.from(rec.file);
  t.check("upload ok: receiver file matches (ctrl-Z pad stripped)", got.length === payload.length && [...got].every((b, i) => b === payload[i]), `len ${got.length}`);
  t.check("upload ok: progress reached 100%", prog.length && prog[prog.length - 1].done && prog[prog.length - 1].sent === payload.length);
  t.check("upload ok: used a 1K STX packet", io.writes[0][0] === STX);
}

{ // 128-byte blocks, more than one packet
  const rec = fluidncReceiver();
  const io = mockIo(rec.handle);
  io.inject(CRC_C);
  const payload = new Uint8Array(200).map((_, i) => (i * 3) & 0xff);
  const r = await sendXmodem(payload, io, { blockSize: 128 });
  const got = Uint8Array.from(rec.file);
  t.check("128-byte: two blocks, file matches", r.blocks === 2 && got.length === 200 && [...got].every((b, i) => b === payload[i]), `blocks ${r.blocks} len ${got.length}`);
}

{ // NAK handshake (checksum mode) still works
  const rec = fluidncReceiver({ startWith: NAK });
  // checksum receiver: rewrite handle? our fluidncReceiver always checks CRC.
  // Use a checksum-capable variant:
  const file = [];
  let expect = 1, held = null;
  const io = mockIo((bytes, out) => {
    let i = 0;
    while (i < bytes.length) {
      const c = bytes[i++];
      if (c === EOT) {
        if (held) { let n = held.length; while (n > 0 && held[n - 1] === CTRLZ) n--; for (let k = 0; k < n; k++) file.push(held[k]); }
        out(ACK); return;
      }
      if (c !== SOH && c !== STX) continue;
      const size = c === STX ? 1024 : 128;
      const rest = bytes.subarray(i);
      const pktNo = rest[0], data = rest.subarray(2, 2 + size), cks = rest[2 + size];
      i += 2 + size + 1;
      let sum = 0; for (let k = 0; k < size; k++) sum = (sum + data[k]) & 0xff;
      if (sum !== cks || pktNo !== (expect & 0xff)) { out(NAK); continue; }
      if (held) for (let k = 0; k < held.length; k++) file.push(held[k]);
      held = Uint8Array.from(data); expect++; out(ACK);
    }
  });
  io.inject(NAK);
  const payload = enc.encode("checksum");
  await sendXmodem(payload, io, { blockSize: 128 });
  t.check("checksum/NAK handshake: file matches", String.fromCharCode(...file) === "checksum", String.fromCharCode(...file));
}

{ // no handshake
  const io = mockIo(() => {});
  let err = "";
  try { await sendXmodem(enc.encode("x"), io, { helloMs: 200, ackMs: 50 }); } catch (e) { err = e.message; }
  t.check("no handshake: clear error, nothing started", /did not start the file transfer/i.test(err), err);
}

{ // cancelled by receiver mid-file
  const rec = fluidncReceiver({ failAt: 1 });
  const io = mockIo(rec.handle);
  io.inject(CRC_C);
  let err = "";
  try { await sendXmodem(new Uint8Array(2000), io, { blockSize: 1024, ackMs: 200 }); } catch (e) { err = e.message; }
  t.check("receiver CAN: reports cancelled", /cancelled/i.test(err), err);
}

{ // abort via AbortSignal (STOP during upload)
  let recHandle;
  const rec = fluidncReceiver({ hang: true });
  const io = mockIo((b, o) => rec.handle(b, o));
  const ac = new AbortController();
  io.inject(CRC_C);
  setTimeout(() => ac.abort(), 30);
  let err = "";
  try { await sendXmodem(new Uint8Array(2000), io, { blockSize: 1024, ackMs: 1000, signal: ac.signal }); } catch (e) { err = e.message; }
  t.check("AbortSignal: reports cancelled", /cancelled/i.test(err), err);
}

{ // retries: first packet NAKed once, then ACK
  let naks = 1, got = 0;
  const io = mockIo((bytes, out) => {
    if (bytes[0] === EOT) { out(ACK); return; }
    if (bytes[0] === STX || bytes[0] === SOH) {
      if (naks) { naks--; out(NAK); return; }
      got++; out(ACK);
    }
  });
  io.inject(CRC_C);
  await sendXmodem(enc.encode("retry"), io, { blockSize: 128, ackMs: 200 });
  t.check("NAK once is retried and then succeeds", got === 1 && naks === 0);
}

t.check("abortXmodem writes three CAN bytes", await (async () => {
  const wrote = [];
  await abortXmodem({ write: (b) => { wrote.push(...b); return Promise.resolve(); } });
  return wrote.length === 3 && wrote.every((b) => b === CAN);
})());

process.exit(t.done() ? 1 : 0);
