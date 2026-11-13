// XModem-CRC sender for FluidNC $Xmodem/Receive (v4.1.1, tag fdc17a2).
// FluidNC's receiver is FluidNC/src/xmodem.cpp (Georges Menie core):
//   handshake starts with 'C' (CRC-16/XMODEM) for 16 tries of 2 s, then falls back to NAK checksum;
//   SOH = 128-byte blocks, STX = 1K blocks; EOT ends; two CAN bytes abort; last block is padded with 0x1A
//   which the receiver strips only on the final packet. We default to 1K+CRC. Never talks to hardware itself.

export const SOH = 0x01, STX = 0x02, EOT = 0x04, ACK = 0x06, NAK = 0x15, CAN = 0x18, CRC_C = 0x43, CTRLZ = 0x1A;
export const DLY_ACK_MS = 5000, DLY_HELLO_MS = 10000, MAX_RETRIES = 10;

export function crc16(buf, start = 0, len = buf.length - start) {
  let crc = 0;
  for (let i = 0; i < len; i++) {
    crc = ((crc << 8) ^ CRC16TAB[((crc >> 8) ^ buf[start + i]) & 0xff]) & 0xffff;
  }
  return crc;
}

// Same CCITT table as FluidNC xmodem.cpp (crc16_ccitt).
const CRC16TAB = new Uint16Array([
  0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef,
  0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6, 0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de,
  0x2462, 0x3443, 0x0420, 0x1401, 0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
  0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc,
  0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823, 0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b,
  0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
  0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49,
  0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70, 0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78,
  0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c, 0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
  0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e, 0x02b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256,
  0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d, 0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
  0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
  0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x08e1, 0x3882, 0x28a3,
  0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a, 0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92,
  0xfd2e, 0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
  0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0x0ed1, 0x1ef0,
]);

export function buildPacket(blockSize, packetNo, data, offset, crc) {
  const head = blockSize === 1024 ? STX : SOH;
  const pkt = new Uint8Array(3 + blockSize + (crc ? 2 : 1));
  pkt[0] = head;
  pkt[1] = packetNo & 0xff;
  pkt[2] = (~packetNo) & 0xff;
  const n = Math.min(blockSize, Math.max(0, data.length - offset));
  if (n) pkt.set(data.subarray(offset, offset + n), 3);
  if (n < blockSize) pkt.fill(CTRLZ, 3 + n, 3 + blockSize);
  if (crc) {
    const sum = crc16(pkt, 3, blockSize);
    pkt[3 + blockSize] = (sum >> 8) & 0xff;
    pkt[3 + blockSize + 1] = sum & 0xff;
  } else {
    let cks = 0;
    for (let i = 0; i < blockSize; i++) cks = (cks + pkt[3 + i]) & 0xff;
    pkt[3 + blockSize] = cks;
  }
  return pkt;
}

export async function abortXmodem(io) {
  try { await io.write(new Uint8Array([CAN, CAN, CAN])); } catch (e) { /* best effort */ }
}

// io.write(Uint8Array) -> Promise; io.readByte(timeoutMs) -> Promise<number|-1>
// opts.blockSize 128 or 1024; opts.onProgress({ sent, total, block, blocks }); opts.signal AbortSignal
export async function sendXmodem(data, io, opts = {}) {
  const blockSize = opts.blockSize === 128 ? 128 : 1024;
  const onProgress = opts.onProgress || (() => {});
  const signal = opts.signal;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const blocks = Math.max(1, Math.ceil(bytes.length / blockSize) || 1);
  const thrown = () => { if (signal && signal.aborted) throw new Error("Upload cancelled."); };

  const read = (ms) => {
    thrown();
    return Promise.race([
      io.readByte(ms),
      signal && signal.aborted ? Promise.reject(new Error("Upload cancelled.")) :
        new Promise((resolve, reject) => {
          if (!signal) return;
          const on = () => { signal.removeEventListener("abort", on); reject(new Error("Upload cancelled.")); };
          signal.addEventListener("abort", on, { once: true });
        }),
    ]);
  };

  let useCrc = true, hello = -1, waited = 0;
  const helloStep = 250;
  while (waited < (opts.helloMs || DLY_HELLO_MS)) {
    thrown();
    hello = await io.readByte(helloStep);
    if (hello === CRC_C) { useCrc = true; break; }
    if (hello === NAK) { useCrc = false; break; }
    if (hello === CAN) {
      const next = await io.readByte(1000);
      await abortXmodem(io);
      throw new Error("The table cancelled the upload.");
    }
    waited += helloStep;
  }
  if (hello !== CRC_C && hello !== NAK) throw new Error("The table did not start the file transfer (no XModem handshake).");

  let packetNo = 1;
  for (let i = 0; i < blocks; i++) {
    thrown();
    const pkt = buildPacket(blockSize, packetNo, bytes, i * blockSize, useCrc);
    let acked = false;
    for (let tries = 0; tries < (opts.retries || MAX_RETRIES); tries++) {
      thrown();
      await io.write(pkt);
      const r = await read(opts.ackMs || DLY_ACK_MS);
      if (r === ACK) { acked = true; break; }
      if (r === CAN) { await abortXmodem(io); throw new Error("The table cancelled the upload."); }
      if (r !== NAK && r >= 0) continue;       // ignore leftover text / status noise
    }
    if (!acked) { await abortXmodem(io); throw new Error("The table did not accept a block of the file (too many retries)."); }
    const sent = Math.min(bytes.length, (i + 1) * blockSize);
    onProgress({ sent, total: bytes.length, block: i + 1, blocks });
    packetNo = (packetNo + 1) & 0xff;
  }

  let eotOk = false;
  for (let tries = 0; tries < (opts.retries || MAX_RETRIES); tries++) {
    thrown();
    await io.write(new Uint8Array([EOT]));
    const r = await read(opts.ackMs || DLY_ACK_MS);
    if (r === ACK) { eotOk = true; break; }
    if (r === CAN) { await abortXmodem(io); throw new Error("The table cancelled the upload."); }
  }
  if (!eotOk) { await abortXmodem(io); throw new Error("The table did not confirm the end of the file transfer."); }
  onProgress({ sent: bytes.length, total: bytes.length, block: blocks, blocks, done: true });
  return { bytes: bytes.length, blocks };
}
