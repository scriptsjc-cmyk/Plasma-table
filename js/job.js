// Turn a CAM G-code file into a plasma job (same rules as plasma/job.py).
//
// The file only needs XY moves with M3 (torch on) / M5 (torch off).
//  * Z, F, S words and tool changes are removed.
//  * Before every M3: probe down -> lift (switch offset + pierce height) ->
//    torch on -> pierce delay -> drop to cut height -> set cut feed.
//  * After every M5: lift clear for the next rapid.

export class JobError extends Error {}

const WORD_RE = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

function stripComments(line) {
  return line.replace(/\(.*?\)/g, "").split(";")[0].trim().toUpperCase();
}

export function fmt(v) {
  let s = Number(v).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0" || s === "") s = "0";
  return s;
}

function arcPoints(x0, y0, x1, y1, i, j, clockwise, stepDeg = 6) {
  const cx = x0 + i, cy = y0 + j;
  const r = Math.hypot(x0 - cx, y0 - cy);
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let sweep = clockwise ? a0 - a1 : a1 - a0;
  while (sweep <= 1e-9) sweep += 2 * Math.PI;
  if (Math.abs(x0 - x1) < 1e-6 && Math.abs(y0 - y1) < 1e-6) sweep = 2 * Math.PI;
  const n = Math.max(2, Math.floor((sweep * 180) / Math.PI / stepDeg));
  const pts = [];
  for (let k = 1; k <= n; k++) {
    const a = clockwise ? a0 - (sweep * k) / n : a0 + (sweep * k) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  pts[pts.length - 1] = [x1, y1];
  return { pts, length: r * sweep };
}

export function prepareJob(gcodeText, cut, machine, dryRun = false) {
  const probe = machine.probe, torch = machine.torch;
  const feed = Number(cut.feed_mm_min);
  const pierceH = Number(cut.pierce_height_mm);
  const cutH = Number(cut.cut_height_mm);
  const delay = Number(cut.pierce_delay_s);
  if (!(feed > 0)) throw new JobError("Feed rate must be above zero.");
  if (!(pierceH > 0) || !(cutH > 0)) throw new JobError("Pierce and cut heights must be above zero.");

  const out = ["; prepared by plasma-operator", "G21 G90 G17 G94", "M5", `G1 F${fmt(feed)}`];
  const park = machine.z_park_machine;
  if (park !== null && park !== undefined) out.push(`G53 G0 Z${fmt(park)}`);
  const warnings = [];

  let x = 0, y = 0, posKnown = false, motion = 0, torchOn = false, pierces = 0;
  let cutLen = 0, rapidLen = 0, current = null, sawM3 = false;
  const cuts = [], rapids = [];
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;

  const startPoly = (kind) => {
    current = { kind, pts: [[x, y]] };
    (kind === "cut" ? cuts : rapids).push(current);
  };

  const lines = gcodeText.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx++) {
    const lineno = idx + 1;
    const line = stripComments(lines[idx]);
    if (!line || line.startsWith("%")) continue;
    if (line.startsWith("$")) { warnings.push(`Line ${lineno}: removed settings command '${line}'.`); continue; }
    const words = [...line.replace(/ /g, "").matchAll(WORD_RE)].map((m) => [m[1], m[2]]);
    if (!words.length) continue;

    const gcodes = words.filter(([k]) => k === "G").map(([, v]) => parseFloat(v));
    const mcodes = words.filter(([k]) => k === "M").map(([, v]) => Math.trunc(parseFloat(v)));
    const axes = {};
    for (const [k, v] of words) if ("XYIJ".includes(k)) axes[k] = parseFloat(v);

    for (const g of gcodes) {
      if (g === 20) throw new JobError("This file is in inches (G20). Export it in millimetres.");
      if (g === 91) throw new JobError("This file uses relative moves (G91). Export it with absolute moves (G90).");
      if ([0, 1, 2, 3].includes(g)) motion = g;
      if (g === 28 || g === 30) warnings.push(`Line ${lineno}: removed G${Math.trunc(g)} (go-home move).`);
    }
    const keptG = gcodes.filter((g) => [0, 1, 2, 3, 17, 90].includes(g));

    if (mcodes.includes(5) && torchOn) {
      torchOn = false;
      current = null;
      out.push(dryRun ? "; dry run: torch off" : "M5");
      out.push("G91", `G0 Z${fmt(torch.safe_lift_mm)}`, "G90");
    }

    if ("X" in axes || "Y" in axes) {
      const nx = "X" in axes ? axes.X : x;
      const ny = "Y" in axes ? axes.Y : y;
      const parts = [`G${motion}`];
      if ("X" in axes) parts.push(`X${fmt(nx)}`);
      if ("Y" in axes) parts.push(`Y${fmt(ny)}`);
      if (motion === 2 || motion === 3) {
        if (!("I" in axes) && !("J" in axes)) throw new JobError(`Line ${lineno}: arc without I/J (R-format arcs are not supported).`);
        parts.push(`I${fmt(axes.I ?? 0)}`, `J${fmt(axes.J ?? 0)}`);
      }
      out.push(parts.join(" "));

      const kind = torchOn && motion !== 0 ? "cut" : "rapid";
      if (!current || current.kind !== kind) startPoly(kind);
      let pts, length;
      if (motion === 2 || motion === 3) ({ pts, length } = arcPoints(x, y, nx, ny, axes.I ?? 0, axes.J ?? 0, motion === 2));
      else { pts = [[nx, ny]]; length = Math.hypot(nx - x, ny - y); }
      current.pts.push(...pts);
      if (kind === "cut") {
        cutLen += length;
        for (const [px, py] of [[x, y], ...pts]) {
          minx = Math.min(minx, px); maxx = Math.max(maxx, px);
          miny = Math.min(miny, py); maxy = Math.max(maxy, py);
        }
      } else rapidLen += length;
      x = nx; y = ny; posKnown = true;
    } else {
      const other = keptG.filter((g) => ![0, 1, 2, 3].includes(g));
      if (other.length) out.push(other.map((g) => `G${fmt(g)}`).join(" "));
    }

    if ((mcodes.includes(3) || mcodes.includes(4)) && !torchOn) {
      sawM3 = true;
      if (!posKnown) warnings.push(`Line ${lineno}: torch on before any XY move; pierce will be at the start point.`);
      torchOn = true;
      pierces += 1;
      current = null;
      out.push(`; --- pierce ${pierces} ---`);
      if (dryRun) out.push("G4 P0.1");
      else {
        out.push("G91",
          `G38.2 Z-${fmt(probe.probe_distance_mm)} F${fmt(probe.probe_feed)}`,
          `G0 Z${fmt(probe.switch_offset_mm + pierceH)}`,
          `M3 S${fmt(torch.spindle_s)}`,
          `G4 P${fmt(delay)}`);
        if (Math.abs(cutH - pierceH) > 1e-6) out.push(`G1 Z${fmt(cutH - pierceH)} F${fmt(probe.plunge_feed)}`);
        out.push("G90");
      }
      out.push(`G1 F${fmt(feed)}`);
    }
    if (mcodes.includes(2) || mcodes.includes(30)) break;
  }

  if (torchOn) {
    warnings.push("File ended with the torch still on; added torch off.");
    out.push("M5", "G91", `G0 Z${fmt(torch.safe_lift_mm)}`, "G90");
  }
  out.push("M5");
  if (park !== null && park !== undefined) out.push(`G53 G0 Z${fmt(park)}`);

  if (!sawM3) throw new JobError("No torch-on (M3) found. Export from your CAM with a plasma or laser post so cuts start with M3 and end with M5.");

  if (minx === Infinity) minx = miny = maxx = maxy = 0;
  const travel = machine.travel_mm;
  const width = maxx - minx, height = maxy - miny;
  if (width > travel.x || height > travel.y)
    warnings.push(`Job is ${Math.round(width)} x ${Math.round(height)} mm, bigger than the table (${travel.x} x ${travel.y} mm).`);
  if (minx < -0.01 || miny < -0.01) warnings.push("Part of the job is left of / below the zero point. Check where you set XY zero.");

  const rapidFeed = machine.rapid_feed_estimate || 6000;
  const probeTime = (probe.probe_distance_mm / Math.max(probe.probe_feed, 1)) * 60 * 0.3;
  const est = (cutLen / feed) * 60 + (rapidLen / rapidFeed) * 60 + pierces * (delay + probeTime + 1.0);
  const r2 = (v) => Math.round(v * 100) / 100;
  const simplify = (polys) => polys.filter((p) => p.pts.length > 1).map((p) => p.pts.map(([a, b]) => [r2(a), r2(b)]));

  return {
    lines: out,
    preview: { cuts: simplify(cuts), rapids: simplify(rapids) },
    stats: {
      pierces,
      cut_length_mm: Math.round(cutLen * 10) / 10,
      bounds: [r2(minx), r2(miny), r2(maxx), r2(maxy)],
      width_mm: Math.round(width * 10) / 10,
      height_mm: Math.round(height * 10) / 10,
      estimated_seconds: Math.round(est),
      line_count: out.length,
    },
    warnings,
  };
}

export function touchoffTestLines(cut, machine) {
  const p = machine.probe;
  return ["G21 G91", `G38.2 Z-${fmt(p.probe_distance_mm)} F${fmt(p.probe_feed)}`,
    `G0 Z${fmt(p.switch_offset_mm + Number(cut.pierce_height_mm))}`, "G90"];
}

export function torchTestLines(machine) {
  const t = machine.torch;
  return [`M3 S${fmt(t.spindle_s)}`, `G4 P${fmt(t.test_seconds)}`, "M5"];
}
