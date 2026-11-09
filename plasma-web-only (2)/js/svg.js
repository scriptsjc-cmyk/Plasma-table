// Read 2D shapes from an SVG (Inkscape, Illustrator, online designers).
// Supports path (all commands), rect, circle, ellipse, line, polyline, polygon, and
// transforms. Sizes: if the SVG width/height are in mm/cm/in they're used; plain pixels
// are taken as 96 per inch (Inkscape's standard).

import { TOL, arcPoints, circleContour, cleanPts } from "./geom.js";

const UNIT = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };

export function parseSVG(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg || doc.querySelector("parsererror")) throw new Error("This doesn't look like an SVG file.");
  const warnings = [];

  // user units -> mm
  const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const len = (s) => { const m = /^([\d.]+)\s*([a-z]*)$/i.exec((s || "").trim()); return m ? [parseFloat(m[1]), m[2].toLowerCase()] : null; };
  const W = len(svg.getAttribute("width"));
  let k = UNIT.px;
  if (W && vb.length === 4 && vb[2] > 0) k = (W[0] * (UNIT[W[1]] ?? UNIT.px)) / vb[2];
  else if (W && UNIT[W[1]] !== undefined && W[1] !== "" && W[1] !== "px") k = UNIT[W[1]];

  const contours = [];
  const skipped = {};
  walk(svg, [1, 0, 0, 1, 0, 0]);
  if (!contours.length) throw new Error("No shapes found in the SVG. In Inkscape use Path → Object to Path, and convert text to paths.");

  function walk(el, m) {
    for (const child of el.children) {
      const tag = child.tagName.replace(/^.*:/, "").toLowerCase();
      if (["defs", "clippath", "mask", "pattern", "symbol", "metadata", "title", "desc", "style", "lineargradient", "radialgradient"].includes(tag)) continue;
      if (child.getAttribute("display") === "none") continue;
      const mm = mul(m, parseTransform(child.getAttribute("transform")));
      if (tag === "g" || tag === "svg" || tag === "a") { walk(child, mm); continue; }
      const sub = shapeToContours(tag, child);
      if (sub === null) { if (!["text", "image", "use"].includes(tag)) continue; skipped[tag] = (skipped[tag] || 0) + 1; continue; }
      for (const c of sub) {
        const pts = c.pts.map(([x, y]) => apply(mm, [x, y])).map(([x, y]) => [x * k, -y * k]); // flip Y: SVG y goes down
        let circle;
        if (c.circle && Math.abs(mm[1]) < 1e-9 && Math.abs(mm[2]) < 1e-9 && Math.abs(Math.abs(mm[0]) - Math.abs(mm[3])) < 1e-9) {
          const [cx, cy] = apply(mm, [c.circle.cx, c.circle.cy]);
          circle = { cx: cx * k, cy: -cy * k, r: c.circle.r * Math.abs(mm[0]) * k };
        }
        contours.push({ pts: cleanPts(pts, c.closed), closed: c.closed, circle });
      }
    }
  }
  for (const [t, n] of Object.entries(skipped)) {
    warnings.push(`Ignored ${n} ${t} item(s)` + (t === "text" ? " – convert text to paths first (Inkscape: Path → Object to Path)." : "."));
  }
  return { contours, warnings, units: "mm" };
}

function num(el, a, d = 0) { const v = parseFloat(el.getAttribute(a)); return Number.isFinite(v) ? v : d; }

function shapeToContours(tag, el) {
  switch (tag) {
    case "rect": {
      const x = num(el, "x"), y = num(el, "y"), w = num(el, "width"), h = num(el, "height");
      let rx = num(el, "rx", NaN), ry = num(el, "ry", NaN);
      if (!Number.isFinite(rx)) rx = Number.isFinite(ry) ? ry : 0;
      rx = Math.min(rx, w / 2);
      if (w <= 0 || h <= 0) return [];
      if (rx <= 0) return [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
      const r = rx, p = [];
      p.push([x + r, y], [x + w - r, y], ...arcPoints(x + w - r, y + r, r, -Math.PI / 2, 0, true));
      p.push([x + w, y + h - r], ...arcPoints(x + w - r, y + h - r, r, 0, Math.PI / 2, true));
      p.push([x + r, y + h], ...arcPoints(x + r, y + h - r, r, Math.PI / 2, Math.PI, true));
      p.push([x, y + r], ...arcPoints(x + r, y + r, r, Math.PI, 1.5 * Math.PI, true));
      return [{ pts: p, closed: true }];
    }
    case "circle": { const c = circleContour(num(el, "cx"), num(el, "cy"), num(el, "r")); return num(el, "r") > 0 ? [c] : []; }
    case "ellipse": {
      const cx = num(el, "cx"), cy = num(el, "cy"), rx = num(el, "rx"), ry = num(el, "ry"), p = [];
      for (let i = 0; i < 96; i++) { const t = (i / 96) * 2 * Math.PI; p.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
      return [{ pts: p, closed: true }];
    }
    case "line": return [{ pts: [[num(el, "x1"), num(el, "y1")], [num(el, "x2"), num(el, "y2")]], closed: false }];
    case "polyline": case "polygon": {
      const n = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
      const p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]);
      return [{ pts: p, closed: tag === "polygon" }];
    }
    case "path": return pathToContours(el.getAttribute("d") || "");
    default: return null;
  }
}

// ---------------------------------------------------------------- path data
export function pathToContours(d) {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, cur = null, lastC = null, lastQ = null;
  const isCmd = (t) => /[a-zA-Z]/.test(t);
  const n = () => parseFloat(toks[i++]);
  const finish = (closed) => { if (cur && cur.length > 1) out.push({ pts: cur, closed }); cur = null; };
  while (i < toks.length) {
    if (isCmd(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "Z") { if (cur) { finish(true); } x = sx; y = sy; lastC = lastQ = null; if (i < toks.length && !isCmd(toks[i])) i++; continue; }
    if (C === "M") {
      finish(false);
      x = ox + n(); y = oy + n(); sx = x; sy = y; cur = [[x, y]];
      cmd = rel ? "l" : "L"; lastC = lastQ = null; continue;
    }
    if (!cur) cur = [[x, y]];
    if (C === "L") { x = ox + n(); y = oy + n(); cur.push([x, y]); lastC = lastQ = null; }
    else if (C === "H") { x = ox + n(); cur.push([x, y]); lastC = lastQ = null; }
    else if (C === "V") { y = oy + n(); cur.push([x, y]); lastC = lastQ = null; }
    else if (C === "C" || C === "S") {
      let x1, y1;
      if (C === "C") { x1 = ox + n(); y1 = oy + n(); }
      else { x1 = lastC ? 2 * x - lastC[0] : x; y1 = lastC ? 2 * y - lastC[1] : y; }
      const x2 = ox + n(), y2 = oy + n(), x3 = ox + n(), y3 = oy + n();
      cubic(cur, [x, y], [x1, y1], [x2, y2], [x3, y3]);
      lastC = [x2, y2]; lastQ = null; x = x3; y = y3;
    } else if (C === "Q" || C === "T") {
      let x1, y1;
      if (C === "Q") { x1 = ox + n(); y1 = oy + n(); }
      else { x1 = lastQ ? 2 * x - lastQ[0] : x; y1 = lastQ ? 2 * y - lastQ[1] : y; }
      const x2 = ox + n(), y2 = oy + n();
      cubic(cur, [x, y], [x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y)], [x2 + (2 / 3) * (x1 - x2), y2 + (2 / 3) * (y1 - y2)], [x2, y2]);
      lastQ = [x1, y1]; lastC = null; x = x2; y = y2;
    } else if (C === "A") {
      const rx = Math.abs(n()), ry = Math.abs(n()), rot = n(), large = n(), sweep = n();
      const x2 = ox + n(), y2 = oy + n();
      svgArc(cur, [x, y], rx, ry, rot, large, sweep, [x2, y2]);
      x = x2; y = y2; lastC = lastQ = null;
    } else { i++; } // unknown token
  }
  finish(false);
  // a path that ends where it started counts as closed
  for (const c of out) {
    if (!c.closed && c.pts.length > 2) {
      const a = c.pts[0], b = c.pts[c.pts.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3) c.closed = true;
    }
  }
  return out;
}

function cubic(out, p0, p1, p2, p3, depth = 0) {
  // flat enough? (control points close to the chord)
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1];
  const d1 = Math.abs((p1[0] - p3[0]) * dy - (p1[1] - p3[1]) * dx), d2 = Math.abs((p2[0] - p3[0]) * dy - (p2[1] - p3[1]) * dx);
  if (depth > 12 || (d1 + d2) ** 2 < 0.05 * TOL * (dx * dx + dy * dy) || (dx === 0 && dy === 0 && depth > 6)) { out.push([...p3]); return; }
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p01 = m(p0, p1), p12 = m(p1, p2), p23 = m(p2, p3), p012 = m(p01, p12), p123 = m(p12, p23), mid = m(p012, p123);
  cubic(out, p0, p01, p012, mid, depth + 1);
  cubic(out, mid, p123, p23, p3, depth + 1);
}

function svgArc(out, p1, rx, ry, rotDeg, large, sweep, p2) {
  if (rx === 0 || ry === 0) { out.push([...p2]); return; }
  const phi = (rotDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p1[0] - p2[0]) / 2, dy = (p1[1] - p2[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sgn = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const co = sgn * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (co * rx * y1) / ry, cy1 = (-co * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p1[0] + p2[0]) / 2, cy = sin * cx1 + cos * cy1 + (p1[1] + p2[1]) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(4, Math.ceil(Math.abs(dt) / (2 * Math.acos(Math.max(-1, 1 - TOL / Math.max(rx, ry, TOL))))));
  for (let i = 1; i <= segs; i++) {
    const t = t1 + (dt * i) / segs, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    out.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  out[out.length - 1] = [...p2];
}

// ---------------------------------------------------------------- transforms
function parseTransform(s) {
  let m = [1, 0, 0, 1, 0, 0];
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let r;
  while ((r = re.exec(s))) {
    const a = r[2].trim().split(/[\s,]+/).map(Number);
    let t;
    switch (r[1]) {
      case "matrix": t = a; break;
      case "translate": t = [1, 0, 0, 1, a[0], a[1] || 0]; break;
      case "scale": t = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0]; break;
      case "rotate": {
        const c = Math.cos((a[0] * Math.PI) / 180), si = Math.sin((a[0] * Math.PI) / 180);
        t = [c, si, -si, c, 0, 0];
        if (a.length === 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case "skewX": t = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0]; break;
      case "skewY": t = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = mul(m, t);
  }
  return m;
}
function mul(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function apply(m, [x, y]) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
