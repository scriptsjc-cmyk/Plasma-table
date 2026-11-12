// Tabs, slots and interlocking joints.
import { roundedRect, slot, holeIn, poly, clamp, shape } from "./helpers.js";

export const TAB_PRESETS = [
  shape("boxtab", "Box tab", "⊓", "tabslots", "box tab folded joint",
    "A plate with a centred protruding tab for a box joint.",
    [["w", "Plate width", 80], ["h", "Plate height", 50], ["tabw", "Tab width", 24], ["tabh", "Tab length", 16]],
    (p) => {
      const tw = clamp(p.tabw, 4, p.w - 4), th = Math.max(4, p.tabh);
      const x = (p.w - tw) / 2;
      return [poly([[0, 0], [p.w, 0], [p.w, p.h], [x + tw, p.h], [x + tw, p.h + th], [x, p.h + th], [x, p.h], [0, p.h]])];
    }),
  shape("tslotplate", "T-slot plate", "⊤", "tabslots", "t slot plate tee slot",
    "Plate with a T-slot cut from one edge.",
    [["w", "Width", 120], ["h", "Height", 80], ["stem", "Slot stem width", 12], ["stemh", "Stem depth", 20], ["headw", "T-head width", 32], ["headh", "T-head depth", 12]],
    (p) => {
      const sw = clamp(p.stem, 4, p.w - 8), hw = clamp(p.headw, sw + 4, p.w - 8);
      const sh = clamp(p.stemh, 4, p.h - 8), hh = clamp(p.headh, 4, p.h - sh - 4);
      const sx = (p.w - sw) / 2, hx = (p.w - hw) / 2;
      return [poly([
        [0, 0], [p.w, 0], [p.w, p.h], [sx + sw, p.h], [sx + sw, p.h - sh],
        [hx + hw, p.h - sh], [hx + hw, p.h - sh - hh], [hx, p.h - sh - hh], [hx, p.h - sh],
        [sx, p.h - sh], [sx, p.h], [0, p.h],
      ])];
    }),
  shape("fingerstrip", "Finger-joint strip", "☰", "tabslots", "finger joint box joint strip",
    "A strip with evenly spaced fingers along one edge (for a box joint).",
    [["w", "Overall length", 200], ["h", "Strip height", 30], ["fingers", "Number of fingers", 5], ["depth", "Finger depth", 14]],
    (p) => {
      const n = Math.max(2, Math.min(20, Math.round(p.fingers) || 5));
      const d = clamp(p.depth, 4, p.h - 4);
      const pitch = p.w / n;
      const fw = pitch / 2;
      const pts = [[0, 0], [p.w, 0], [p.w, p.h - d]];
      for (let i = n - 1; i >= 0; i--) {
        const x1 = (i + 0.5) * pitch + fw / 2;
        const x0 = (i + 0.5) * pitch - fw / 2;
        // fingers centred in each pitch, sticking up
        const a = i * pitch, b = a + fw;
        pts.push([b, p.h - d], [b, p.h], [a, p.h], [a, p.h - d]);
      }
      pts.push([0, p.h - d]);
      return [poly(pts)];
    }),
  shape("slottedstrap3", "Slotted strap (3 slots)", "▬", "tabslots", "strap three slots",
    "Strap with three evenly spaced slots.",
    [["w", "Length", 240], ["h", "Width", 28], ["slotl", "Each slot length", 30], ["slotw", "Slot width", 8], ["r", "End radius", 14]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, Math.min(p.r, p.h / 2))];
      const sl = clamp(p.slotl, p.slotw, p.w / 4), sw = clamp(p.slotw, 2, p.h - 4);
      for (const x of [p.w * 0.2, p.w * 0.5, p.w * 0.8]) c.push(slot(x, p.h / 2, sl, sw));
      return c;
    }),
  shape("tearslot", "Teardrop slot plate", "💧", "tabslots", "teardrop slot keyhole plate",
    "Plate with a teardrop (keyhole-style) slot.",
    [["w", "Width", 80], ["h", "Height", 40], ["d", "Round end Ø", 14], ["slotl", "Slot length", 22], ["r", "Corner radius", 4]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const d = clamp(p.d, 10, p.h - 8), sl = clamp(p.slotl, d, p.w - 16);
      c.push(slot(p.w / 2 - sl * 0.1, p.h / 2, sl, d));
      return c;
    }),
shape("dogboneslot", "Dog-bone slot plate", "🦴", "tabslots", "dogbone slot cnc t-slot",
    "Plate with a dog-bone slot (over-cut ends so a square tab fits).",
    [["w", "Width", 120], ["h", "Height", 50], ["slotl", "Slot length", 50], ["slotw", "Slot width", 10], ["r", "Corner radius", 4]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const sl = clamp(p.slotl, p.slotw + 8, p.w - 12), sw = clamp(p.slotw, 4, p.h - 8);
      const x = (p.w - sl) / 2, y = (p.h - sw) / 2, rr = sw / 2;
      // rounded-end slot is already a dog-bone-ish; add slightly larger end circles by using slot
      c.push(slot(p.w / 2, p.h / 2, sl, sw));
      return c;
    }),
  shape("intertab", "Interlocking tab", " shamrock", "tabslots", "interlocking hook tab puzzle",
    "A plate with a T-shaped interlocking tab on one end and a matching socket on the other.",
    [["w", "Body width", 40], ["h", "Body height", 30], ["tabw", "Tab stem width", 12], ["headw", "Tab head width", 22], ["tabh", "Tab length", 14]],
    (p) => {
      const tw = clamp(p.tabw, 6, p.w - 4), hw = clamp(p.headw, tw + 4, p.w + 20);
      const th = Math.max(6, p.tabh), hh = th * 0.45;
      const sx = (p.w - tw) / 2, hx = (p.w - hw) / 2;
      // tab on the right, socket on the left (clearance 0.0 — user can tweak)
      const body = [
        // left socket opening (mirror of the tab, slightly — same size so it's a tight template)
        [0, 0], [0, (p.h - hw) / 2], [th - hh, (p.h - hw) / 2], [th - hh, (p.h - tw) / 2],
        [th, (p.h - tw) / 2], [th, (p.h + tw) / 2], [th - hh, (p.h + tw) / 2],
        [th - hh, (p.h + hw) / 2], [0, (p.h + hw) / 2], [0, p.h],
        [p.w, p.h],
        // right tab
        [p.w, p.h / 2 + tw / 2], [p.w + th - hh, p.h / 2 + tw / 2], [p.w + th - hh, p.h / 2 + hw / 2],
        [p.w + th, p.h / 2 + hw / 2], [p.w + th, p.h / 2 - hw / 2], [p.w + th - hh, p.h / 2 - hw / 2],
        [p.w + th - hh, p.h / 2 - tw / 2], [p.w, p.h / 2 - tw / 2],
        [p.w, 0],
      ];
      return [poly(body)];
    }),
  shape("cliptab", "Clip tab", "⌐", "tabslots", "clip tab snap hook catch",
    "A snap-clip tab: a hook-shaped catch on a small plate.",
    [["w", "Base width", 30], ["h", "Base height", 24], ["arm", "Clip arm length", 28], ["t", "Arm thickness", 6], ["gap", "Clip opening", 8]],
    (p) => {
      const t = clamp(p.t, 4, 16), g = clamp(p.gap, 4, 40);
      const arm = clamp(p.arm, 8, 400);
      return [poly([
        [0, 0], [p.w, 0], [p.w, p.h], [p.w + p.arm, p.h], [p.w + p.arm, p.h + g],
        [p.w + t, p.h + g], [p.w + t, p.h + g + t], [p.w + p.arm, p.h + g + t],
        [p.w + p.arm, p.h + g + t + t], [p.w, p.h + g + t + t], [p.w, p.h + t + g + t],
        [0, p.h],
      ])];
    }),
  shape("bayonettab", "Bayonet tab", "⊢", "tabslots", "bayonet tab twist lock",
    "Bayonet / twist-lock tab: an L-shaped lug on a plate.",
    [["w", "Plate width", 60], ["h", "Plate height", 40], ["lugw", "Lug width", 12], ["lugh", "Lug reach", 16], ["lugl", "Lug hook length", 14]],
    (p) => {
      const lw = clamp(p.lugw, 4, Math.max(4, p.h - 4));
      const reach = clamp(p.lugh, 2, 400);
      const hook = clamp(p.lugl, 2, 400);
      const y = (p.h - lw) / 2;
      return [poly([
        [0, 0], [p.w, 0], [p.w, y], [p.w + reach, y], [p.w + reach, y - hook],
        [p.w + reach + lw, y - hook], [p.w + reach + lw, y + lw], [p.w, y + lw], [p.w, p.h], [0, p.h],
      ])];
    }),
  shape("doubleslot", "Double-ended slot plate", "▬", "tabslots", "double ended slot",
    "Narrow plate with one long slot almost from end to end.",
    [["w", "Length", 180], ["h", "Width", 28], ["slotw", "Slot width", 8], ["end", "Metal left at each end", 14], ["r", "End radius", 14]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, Math.min(p.r, p.h / 2))];
      const sw = clamp(p.slotw, 2, p.h - 4), end = clamp(p.end, sw, p.w / 2 - 4);
      c.push(slot(p.w / 2, p.h / 2, p.w - 2 * end, sw));
      return c;
    }),
  shape("keyslotplate", "Key-slot hanging plate", "⚿", "tabslots", "key slot hanging plate",
    "Plate with two downward keyhole slots for hanging on screw heads.",
    [["w", "Width", 100], ["h", "Height", 70], ["d", "Keyhole Ø", 10], ["slotl", "Slot length", 12], ["inset", "From the top / sides", 16], ["r", "Corner radius", 6]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const d = clamp(p.d, 6, p.h / 2), sl = clamp(p.slotl, 6, p.h / 2);
      for (const x of [p.inset, p.w - p.inset]) {
        const cy = p.h - p.inset;
        const hole = [];
        const r = d / 2;
        for (let i = 0; i <= 16; i++) {
          const th = Math.PI + (i * Math.PI) / 16; // bottom half of the circle (downward slot? hanging: big hole at top, slot down)
          hole.push([x + r * Math.cos(th), cy + r * Math.sin(th)]);
        }
        // actually keyhole hanging: large hole at the bottom of the slot so it drops onto the screw, slot goes up
        // redo: circle at cy - sl, slot up to cy
        const hole2 = [];
        const cyc = p.h - p.inset - sl;
        for (let i = 0; i <= 18; i++) {
          const th = -Math.PI / 2 + (i * 2 * Math.PI) / 18;
          // only the lower 3/4 — use full circle + slot rectangle merged: just a slot with a larger round end
          hole2.push([x + r * Math.cos(th), cyc + r * Math.sin(th)]);
        }
        c.push(slot(x, (cyc + (p.h - p.inset)) / 2, d, sl + d));
      }
      // the slot() call is horizontal length x vertical width — slot(cx,cy,len,wid) along x.
      // I need a vertical slot. Build it as a rounded rect hole (vertical stadium).
      c.splice(1);
      for (const x of [p.inset, p.w - p.inset]) {
        const r = d / 2;
        const y2 = p.h - p.inset, y1 = y2 - sl;
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const th = Math.PI + (i * Math.PI) / 12;
          pts.push([x + r * Math.cos(th), y1 + r * Math.sin(th)]);
        }
        for (let i = 0; i <= 12; i++) {
          const th = (i * Math.PI) / 12;
          pts.push([x + r * Math.cos(th), y2 + r * Math.sin(th)]);
        }
        c.push({ pts, closed: true });
      }
      return c;
    }),
  shape("halftab", "Half-lap tab", "⌐", "tabslots", "half lap joint tab",
    "Plate with a half-width tab on one end, for a half-lap joint.",
    [["w", "Body width", 80], ["h", "Height", 40], ["tabw", "Tab width", 40], ["tabh", "Tab length", 20]],
    (p) => {
      const tw = clamp(p.tabw, 8, p.w), th = Math.max(6, p.tabh);
      return [poly([[0, 0], [p.w, 0], [p.w, p.h], [tw, p.h], [tw, p.h + th], [0, p.h + th]])];
    }),
];
