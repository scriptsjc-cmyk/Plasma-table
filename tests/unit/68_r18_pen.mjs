// r18 marker pen (Josh 23 Nov: "use a marker pen in the cnc to mark designs out with ink" … "floating head should be
// active when drawing and lift up till its not active when changing draws"). Every line becomes a pen line; the torch
// never comes on; pen down = probe until the floating head trips and stay there; pen up = rise past the switch + lift.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import fs from "node:fs";
import { SITE } from "../lib/site.mjs";
import { resolveEtch, throughCutInEtch, ETCH_START_PEN, PEN_DOWN, PEN_UP, PEN_FEED_MM_MIN } from "../../js/cut/etch.js";

const A = await load();
const t = new T("68_r18_pen");
const square = { pts: [[0, 0], [40, 0], [40, 40], [0, 40]], closed: true };
const hole = { pts: [[15, 15], [25, 15], [25, 25], [15, 25]], closed: true };
const penEtch = { ...resolveEtch(null, A.chart, null), tool: "scribe", pen: true };
const cam = A.designToGcode([square, hole].map((c) => ({ ...c, op: "mark" })), { kerf: 1.5, leadIn: 3, name: "pen", etch: penEtch });
const g = cam.gcode;
t.check("the design becomes one marker-pen pass", g.includes(ETCH_START_PEN) && (g.match(/PORTA-PEN DOWN/g) || []).length === 2 && (g.match(/PORTA-PEN UP/g) || []).length === 2, g);
t.check("no torch codes and no lead-ins in the pen pass", !/^\s*M0*[34]\b/m.test(g) && !/M8|M9/.test(g), g);
t.check("pen lines follow the drawing exactly (no kerf offset)", /G0 X0 Y0/.test(g) && /G1 X40 Y0/.test(g), g);
const c = A.cutFor(); c.etch = penEtch;
const job = A.prepareJob(g, c, A.machine, false);
const L = job.lines, text = L.join("\n");
t.check("the job is accepted with no torch-on at all", !!job && job.stats.pierces === 0 && !L.some((l) => /^M0*[34]\b/.test(l)), text);
t.check("the safety check finds nothing that could cut through", !throughCutInEtch(L), throughCutInEtch(L));
const down = L.indexOf("; pen down");
t.check("pen down: probe down until the floating head trips, then draw at that height (head stays pushed)", down > 0 && L[down + 1] === "G91" && /^G38\.2 Z-/.test(L[down + 2]) && L[down + 3] === "G90" && L[down + 4] === `G1 F${PEN_FEED_MM_MIN}`, L.slice(down, down + 6));
const up = L.indexOf("; pen up");
const lift = A.machine.probe.switch_offset_mm + A.machine.torch.safe_lift_mm;
t.check("pen up: rise past the floating-head switch travel plus the safe lift before moving to the next line", up > down && L[up + 1] === "G91" && L[up + 2] === `G0 Z${lift}` && L[up + 3] === "G90" && L[up + 4] === "G4 P0.01", L.slice(up, up + 5));
const firstG0After = L.findIndex((l, i) => i > up && /^G0 X/.test(l));
t.check("the pen is up before every travel move", firstG0After > up + 3, L.slice(up, firstG0After + 1));
t.check("the drawn length and time are counted", job.stats.pen_length_mm >= 200 && job.stats.estimated_seconds > 0, job.stats);
const dry = A.prepareJob(g, c, A.machine, true);
t.check("practice run with the pen: no Z probing", !dry.lines.some((l) => /G38/.test(l)), dry.lines.join("\n"));
const stray = A.prepareJob("G0 X0 Y0\n" + PEN_DOWN + "\nG1 X10\n" + PEN_UP + "\nM3\nG1 X20\nM5", A.cutFor(), A.machine, false);
t.check("a pen marker outside a pen pass is ignored (never a Z probe)", !stray.lines.some((l) => /pen down/.test(l)) && stray.warnings.some((w) => /pen move outside/.test(w)), stray.warnings);
const html = fs.readFileSync(SITE + "html/cut.html", "utf8");
t.check("the cut screen has the Marker pen switch at the top of More cut options", /id="advCut"[\s\S]{0,200}id="penRun" role="switch"/.test(html));
const prep = fs.readFileSync(SITE + "js/cut/prepare.js", "utf8");
t.check("a G-code file can't be drawn with the pen (it says why)", /Marker pen draws parts made or opened here/.test(prep));
t.done();
