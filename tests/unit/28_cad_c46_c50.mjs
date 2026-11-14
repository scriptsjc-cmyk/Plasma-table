// Stage 7 (C46–C50): layout helpers, last-used CAD values, fillet preview, library favs.
// Also re-checks the Stage 5 offset-disc regression: Offset turns a disc into a custom
// outline that still carries .circle so G-code stays G2/G3.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { PRIMARY_TOOL_IDS } from "../../js/make/quickbar.js";
import { DEFAULT_TOOL_IDS } from "../../js/make/toolbarcustom.js";
import { filletPreviewGeom, linearArrayShifts } from "../../js/make/cadpreview.js";
import { CAD_SHORTCUTS } from "../../js/make/shortcuts.js";
import { listFavs, listRecent, toggleFav, rememberRecent } from "../../js/make/presetbrowser.js";
import { defaultPrefs, sanitizePrefs } from "../../js/core/prefs.js";

const A = await load();
const t = new T("28_cad_c46_c50");

const railPrimary = PRIMARY_TOOL_IDS.filter((id) => DEFAULT_TOOL_IDS.includes(id));
t.check("C46: the on-rail primary tools are a subset of the default toolbar, with a More overflow left",
  railPrimary.length >= 8 && railPrimary.length < DEFAULT_TOOL_IDS.length,
  `primary-on-rail=${railPrimary.length} default=${DEFAULT_TOOL_IDS.length} all-primary=${PRIMARY_TOOL_IDS.length}`, "C46-RAIL");
t.check("C46: most-used Draw, Measure, Offset, Fillet and Snap stay on the rail",
  ["draw", "measure", "offset", "fillet", "snap", "rect", "disc"].every((id) => PRIMARY_TOOL_IDS.includes(id)),
  PRIMARY_TOOL_IDS.join(","), "C46-RAIL");

{
  const A0 = [0, 10], P = [0, 0], Q = [10, 0];
  const g = filletPreviewGeom(A0, P, Q, 2, "round");
  t.check("C49: fillet preview for a square corner has a centre and two tangents",
    !!(g && g.C && g.T1 && g.T2 && Math.abs(g.r - 2) < 1e-9 && Math.abs(g.C[0] - 2) < 0.05 && Math.abs(g.C[1] - 2) < 0.05),
    JSON.stringify(g), "C49-FILLET");
  const ch = filletPreviewGeom(A0, P, Q, 2, "chamfer");
  t.check("C49: chamfer preview is a straight cut between the tangents",
    !!(ch && ch.kind === "chamfer" && ch.T1 && ch.T2 && !ch.C), JSON.stringify(ch), "C49-FILLET");
  const rel = filletPreviewGeom(A0, P, Q, 4, "relief");
  t.check("C49: relief preview is a circle into the material",
    !!(rel && rel.kind === "relief" && rel.C && rel.r === 2 && rel.C[0] > 0 && rel.C[1] > 0),
    JSON.stringify(rel), "C49-FILLET");
}

{
  const box = [0, 0, 20, 10];
  const sh = linearArrayShifts(4, 5, 0, box);
  t.check("C49: linear array preview has n-1 steps, gap added to the box width",
    sh.length === 3 && sh[0][0] === 25 && sh[0][1] === 0 && sh[2][0] === 75,
    JSON.stringify(sh), "C49-ARRAY");
}

{
  const keys = CAD_SHORTCUTS.map((r) => r.keys).join(" | ");
  const does = CAD_SHORTCUTS.map((r) => r.does).join(" ");
  t.check("C49: shortcut list includes Ctrl+D, Del, arrows, H/V, ? and Ctrl+K or /",
    keys.includes("Ctrl+D") && keys.includes("Del") && keys.includes("Arrow") && keys.includes("H") && keys.includes("V")
    && keys.includes("?") && keys.includes("Ctrl+K"),
    keys, "C49-KEYS");
  const space = CAD_SHORTCUTS.find((r) => r.keys === "Space");
  t.check("C49: Space is documented as STOP, never as search or pan",
    !!(space && /STOP/.test(space.does) && /never pans/.test(space.does) && /never searches/.test(space.does)),
    space && space.does, "C49-KEYS");
}

{
  const clean = sanitizePrefs({
    cadLast: { "Linear array": { n: 7, gx: 12, gy: 0, junk: { x: 1 }, too: "x".repeat(300) } },
    pbFavs: ["rect", "rect", "nope-ok", 1, ""],
    pbRecent: ["disc", "rect", "disc"],
  });
  t.check("C49: last-used CAD numbers are kept in prefs",
    clean.cadLast["Linear array"].n === 7 && clean.cadLast["Linear array"].gx === 12 && clean.cadLast["Linear array"].junk == null,
    JSON.stringify(clean.cadLast), "C49-LAST");
  t.check("C50: favourite and recent preset ids are kept, unique, in order",
    JSON.stringify(clean.pbFavs) === JSON.stringify(["rect", "nope-ok"]) && JSON.stringify(clean.pbRecent) === JSON.stringify(["disc", "rect"]),
    JSON.stringify({ favs: clean.pbFavs, recent: clean.pbRecent }), "C50-LIB");
  t.check("C50: default prefs include empty favs, recent and cadLast",
    Array.isArray(defaultPrefs().pbFavs) && Array.isArray(defaultPrefs().pbRecent) && !!defaultPrefs().cadLast,
    "", "C50-LIB");
}

{
  // preset helpers use getPrefs; in the node test env they should not throw
  let ok = true, favs = [], recent = [];
  try {
    toggleFav("rect");
    favs = listFavs();
    rememberRecent("disc");
    recent = listRecent();
  } catch (e) { ok = false; t.check("C50: library helpers ran", false, String(e), "C50-LIB"); }
  if (ok) {
    t.check("C50: toggleFav and rememberRecent work without a browser window",
      Array.isArray(favs) && Array.isArray(recent), JSON.stringify({ favs, recent }), "C50-LIB");
  }
}

{
  const sk = A.newSketch();
  sk.add("disc", true);
  const it = sk.items[0];
  it.p.d = 40; it.x = 10; it.y = 10;
  sk.pick([it.id]);
  sk.offsetBy(4);
  const out = sk.items.find((i) => i.type === "custom") || sk.items[0];
  const cs = sk.contoursOf(out);
  const circle = !!(cs[0] && cs[0].circle && Math.abs(cs[0].circle.r - 24) < 0.2);
  t.check("offset disc becomes an editable custom outline that stays a true circle",
    out.type === "custom" && circle,
    JSON.stringify({ type: out.type, circle: cs[0] && cs[0].circle }), "OFFSET-DISC");
}

process.exit(t.done() ? 1 : 0);
