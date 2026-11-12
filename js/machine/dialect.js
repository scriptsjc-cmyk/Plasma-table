// Turn the app's prepared GRBL/grblHAL job into another controller dialect.
// The source lines already have $ settings stripped (see job.js).

function nfmt(n) {
  const s = Number(n).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return s || "0";
}

// GRBL G4 P is seconds. Mach3 G4 P is also seconds. Some posts emit milliseconds;
// we keep seconds and write a comment so a Mach3 user can see it.
function mach3Delay(line) {
  const m = line.match(/^G0?4\s*P(-?\d*\.?\d+)\s*$/i);
  if (!m) return line;
  return "G4 P" + nfmt(Number(m[1])) + "  (seconds)";
}

// Mach3 only knows (parenthesis) comments, and older builds choke on anything outside ASCII.
function mach3Comment(text) {
  const t = String(text).replace(/[^\x20-\x7e]/g, "-").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  return t ? "(" + t + ")" : "";
}

function addLineNumbers(lines) {
  let n = 10;
  return lines.map((l) => {
    if (!l || l.startsWith(";") || l.startsWith("(") || l === "%") return l;
    const out = "N" + n + " " + l;
    n += 10;
    return out;
  });
}

export const DIALECTS = [
  { id: "grbl", name: "GRBL / grblHAL", ext: ".nc" },
  { id: "fluidnc", name: "FluidNC", ext: ".nc" },
  { id: "mach3", name: "Mach3", ext: ".tap" },
];

export function convertGcode(text, dialect, { lineNumbers = false } = {}) {
  const d = String(dialect || "grbl").toLowerCase();
  let lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  // drop trailing empty
  while (lines.length && lines[lines.length - 1] === "") lines.pop();

  if (d === "mach3") {
    const out = [];
    out.push("%");
    out.push("(Porta Plazma CNC - Mach3 dialect)");
    out.push("(Torch on/off is M3/M5. Dwell G4 P is in seconds.)");
    out.push("G21 G90 G17 G40 G49 G80");
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("$")) continue;           // never legal in Mach3
      if (/^[!~?\x18]+$/.test(line)) continue;      // grbl realtime bytes
      if (line.startsWith(";")) { const c = mach3Comment(line.slice(1)); if (c) out.push(c); continue; }
      if (/^(M30|M2)$/i.test(line)) continue;       // one program end, added below
      if (line === "%") continue;                     // the wrapper is added below
      if (/^G53\b/i.test(line)) {
        // Machine-coordinate rapids: Mach3 understands G53, keep it.
        out.push(line);
        continue;
      }
      if (/^G0?4\s*P/i.test(line)) { out.push(mach3Delay(line)); continue; }
      // Mach3 probes with G31 (G38.2 is a LinuxCNC / GRBL word). Same Z move and feed, stops when the probe input trips.
      if (/^G38\.2\b/i.test(line)) { out.push(line.replace(/^G38\.2\b/i, "G31").replace(/;.*$/, "").trim()); continue; }
      out.push(line.replace(/;.*$/, "").trim() || mach3Comment(line.slice(line.indexOf(";") + 1)));
    }
    out.push("M5");                                  // the torch is always off at the end
    out.push("M30");
    out.push("%");
    lines = out;
  } else if (d === "fluidnc") {
    const out = ["; Porta Plazma CNC - FluidNC dialect", "; Settings live in config.yaml, not $ numbers."];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("$")) continue;
      if (/^[!~?\x18]+$/.test(line)) continue;
      out.push(line);
    }
    lines = out;
  } else {
    // grbl / grblHAL: leave as prepared, still drop any leftover $
    lines = lines.filter((l) => !/^\s*\$/.test(l) && !/^\s*[!~?\x18]+\s*$/.test(l));
  }

  if (lineNumbers) lines = addLineNumbers(lines);
  return lines.join("\n") + "\n";
}

export function dialectExtension(id) {
  return (DIALECTS.find((d) => d.id === id) || DIALECTS[0]).ext;
}
