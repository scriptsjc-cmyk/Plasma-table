// child process: run one shape/param/value through contours + CAM; prints a JSON line. Used so a hang/OOM can't kill the suite.
import { load } from "../lib/env.mjs";
const [, , id, key, val] = process.argv; const v = JSON.parse(val);
const A = await load(); const sk = A.newSketch(); sk.add(id, true); sk.items[0].p[key] = v;
const t0 = Date.now(); const cs = sk.contours(); const t1 = Date.now();
let g = null; try { g = A.designToGcode(cs, { kerf: 1.5, leadIn: 3 }); } catch (e) { g = { err: e.message }; }
console.log(JSON.stringify({ contours: cs.length, ms_contours: t1 - t0, ms_total: Date.now() - t0, gcodeLines: g.gcode ? g.gcode.split("\n").length : 0, err: g.err || null }));
