// Putting a FluidNC controller on the customer's own Wi-Fi: scan ($Wifi/ListAPs), then $Sta/SSID, $Sta/Password,
// $Sta/IPMode=DHCP and $WiFi/Mode=STA>AP (join the home Wi-Fi, fall back to its own "FluidNC" access point if that fails).
// The password is only ever written to the controller: never logged (the console shows ********), stored or shown back.

// FluidNC's line protocol is plain ASCII: a space, %, or any non-ASCII character is sent as %XX bytes (UTF-8), as its wiki says
export function encodeFluidValue(s) {
  let out = "";
  for (const b of new TextEncoder().encode(String(s))) out += b > 0x20 && b < 0x7f && b !== 0x25 ? String.fromCharCode(b) : "%" + b.toString(16).padStart(2, "0");
  return out;
}
// {"AP_LIST":[{"SSID":"Home","SIGNAL":"82","IS_PROTECTED":"1"}, ...]} -> [{ ssid, signal, locked }], strongest first, one row per name
export function parseApList(lines) {
  for (const l of [].concat(lines || [])) {
    const t = String(l), i = t.indexOf("{");
    if (i < 0 || !t.includes("AP_LIST")) continue;
    try {
      const list = JSON.parse(t.slice(i)).AP_LIST || [], best = new Map();
      for (const a of list) {
        const ssid = String(a.SSID || "").trim(), signal = Math.max(0, Math.min(100, Number(a.SIGNAL) || 0));
        if (!ssid) continue;
        if (!best.has(ssid) || best.get(ssid).signal < signal) best.set(ssid, { ssid, signal, locked: String(a.IS_PROTECTED) === "1" });
      }
      return [...best.values()].sort((a, b) => b.signal - a.signal);
    } catch (e) { /* not the list line */ }
  }
  return null;
}
// the lines that put the controller on a network; secret lines are masked in the console
export function wifiCommands(ssid, password) {
  const cmds = [{ line: "$Sta/SSID=" + encodeFluidValue(ssid) }];
  if (password) cmds.push({ line: "$Sta/Password=" + encodeFluidValue(password), secret: true });
  cmds.push({ line: "$Sta/IPMode=DHCP" }, { line: "$WiFi/Mode=STA>AP" });
  return cmds;
}
// "$Hostname=plasma" -> "plasma"
export function parseHostname(lines) {
  for (const l of [].concat(lines || [])) { const m = String(l).match(/^\$Hostname=(\S+)/i); if (m) return m[1]; }
  return "";
}
// what stops the set-up right now, in plain words ("" = go ahead)
export function wifiBlocker({ connected, viaPi, jobRunning }) {
  if (!connected) return "Connect to the table with the USB cable first (or join its FluidNC Wi-Fi and connect).";
  if (viaPi) return "This table talks through the Wi-Fi Pi, which already has its own Wi-Fi set-up.";
  if (jobRunning) return "Wait until the job has finished.";
  return "";
}
export async function scanNetworks(link) {
  const r = await link.ask("$Wifi/ListAPs", { timeout: 12000 });
  const host = await link.ask("$Hostname", { timeout: 3000 }).catch(() => null);
  return { list: r.ok ? parseApList(r.lines) : null, error: r.ok ? "" : r.error || "no answer", hostname: host && host.ok ? parseHostname(host.lines) : "" };
}
export async function joinNetwork(link, ssid, password) {
  for (const c of wifiCommands(ssid, password)) {
    const r = await link.ask(c.line, { secret: c.secret, timeout: 5000 });
    if (!r.ok) return { ok: false, failed: c.secret ? "$Sta/Password" : c.line.split("=")[0], error: r.error || "" };
  }
  return { ok: true };
}
