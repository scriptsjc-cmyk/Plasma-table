// Stage 4 (C32 incl. C24): Score/Mark is a real etch pass that always runs
// before cuts and can never become a through-cut.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import {
  emitEtchGcode, throughCutInEtch, sanitizeMcode, resolveEtch, isEtchOp,
  ETCH_START_PLASMA, ETCH_START_SCRIBE, ETCH_END, defaultEtchSettings, sanitizeEtchSettings,
} from "../../js/cut/etch.js";

const A = await load();
const t = new T("25_cad_etch");

const cut = () => {
  const c = A.cutFor();
  c.etch = resolveEtch(null, A.chart, { tool: "plasma" });
  return c;
};

function etchBody(text) {
  const src = Array.isArray(text) ? text.join("\n") : String(text);
  const i = src.search(/PORTA-ETCH (PLASMA|SCRIBE)/i);
  const j = src.search(/PORTA-ETCH END/i);
  return i >= 0 && j > i ? src.slice(i, j + ETCH_END.length) : "";
}

// ---- settings + M-codes ----
{
  t.check("C32: default etch tool is plasma", defaultEtchSettings().tool === "plasma", defaultEtchSettings().tool, "C32-SET");
  t.check("C32: scribe M3 is refused", sanitizeMcode("M3", "M8") === null, sanitizeMcode("M3", "M8"), "C32-SET");
  t.check("C32: scribe M5 is refused", sanitizeMcode("M5", "M9") === null, sanitizeMcode("M5", "M9"), "C32-SET");
  t.check("C32: M8 / M9 are accepted", sanitizeMcode("m8") === "M8" && sanitizeMcode("M09") === "M9", "", "C32-SET");
  const bad = sanitizeEtchSettings({ tool: "scribe", scribe: { on: "M3", off: "M9" } });
  t.check("C32: settings reject torch-on as a scribe code", bad.errors.length > 0 && bad.settings.scribe.on === "M8", bad, "C32-SET");
}

// ---- emit: plasma never pierces ----
{
  const line = { pts: [[0, 0], [40, 0]], closed: false, op: "score" };
  const r = emitEtchGcode([line], { resolved: resolveEtch(null, A.chart, { tool: "plasma" }) });
  const g = r.lines.join("\n");
  t.check("C32: plasma etch is flagged", g.includes(ETCH_START_PLASMA) && g.includes(ETCH_END), g, "C32-EMIT");
  t.check("C32: plasma etch uses M3/M5 on the line", /M3/.test(g) && /M5/.test(g) && /G1 X40/.test(g), g, "C32-EMIT");
  t.check("C32: plasma etch has no pierce delay", !/\bG4\s*P(?!0(?:\.0+)?\b)[0-9.]/.test(g) && !/\bG4\s*P[1-9]/.test(g), g, "C32-EMIT");
}

// ---- emit: scribe + offset ----
{
  const line = { pts: [[0, 0], [10, 0]], closed: false, op: "mark" };
  const r = emitEtchGcode([line], { resolved: resolveEtch(null, A.chart, { tool: "scribe", scribe: { on: "M8", off: "M9", offsetX: 2, offsetY: 3 } }) });
  const g = r.lines.join("\n");
  t.check("C32: scribe etch is flagged and uses M8/M9, not the torch", g.includes(ETCH_START_SCRIBE) && /M8/.test(g) && /M9/.test(g) && !/\bM3\b/.test(g), g, "C32-SCRIBE");
  t.check("C32: scribe XY offset is applied", /G0 X2 Y3/.test(g) && /G1 X12 Y3/.test(g), g, "C32-SCRIBE");
}

// ---- through-cut guard ----
{
  const ok = [ETCH_START_PLASMA, "G0 X0 Y0", "M3", "G1 X10 Y0", "M5", ETCH_END, "G0 X0 Y0", "M3", "G1 X20 Y0", "M5"];
  t.check("C32: a well-formed etch pass is not a through-cut", throughCutInEtch(ok, { hasEtchItems: true }) === "", throughCutInEtch(ok, { hasEtchItems: true }), "C32-GUARD");
  t.check("C32: missing etch block with Score items is a through-cut", /cut through/.test(throughCutInEtch(["M3", "G1 X10"], { hasEtchItems: true })), throughCutInEtch(["M3", "G1 X10"], { hasEtchItems: true }), "C32-GUARD");
  const delayed = [ETCH_START_PLASMA, "M3", "G4 P0.8", "G1 X10", "M5", ETCH_END];
  t.check("C32: pierce delay inside plasma etch is a through-cut", /pierce delay/.test(throughCutInEtch(delayed, { hasEtchItems: true })), throughCutInEtch(delayed), "C32-GUARD");
  const torchScribe = [ETCH_START_SCRIBE, "M3", "G1 X10", "M5", ETCH_END];
  t.check("C32: torch inside a scribe pass is a through-cut", /scribe/i.test(throughCutInEtch(torchScribe, { hasEtchItems: true })), throughCutInEtch(torchScribe), "C32-GUARD");
}

// ---- CAM: etch first, cut-only unchanged (no etch flags) ----
{
  const rect = { pts: [[0, 0], [80, 0], [80, 50], [0, 50]], closed: true };
  const only = A.designToGcode([rect], { kerf: 1.5, leadIn: 3, name: "cut-only" });
  t.check("C32: cut-only G-code has no etch block", !/PORTA-ETCH/.test(only.gcode), only.gcode.slice(0, 200), "C32-CAM");
  const score = { pts: [[5, 5], [75, 5]], closed: false, op: "score" };
  const both = A.designToGcode([rect, score], { kerf: 1.5, leadIn: 3, name: "etched", etch: resolveEtch(null, A.chart, { tool: "plasma" }) });
  const g = both.gcode;
  const etchAt = g.indexOf("PORTA-ETCH PLASMA");
  const endAt = g.indexOf("PORTA-ETCH END");
  const firstCut = g.indexOf("\nM3", endAt);
  t.check("C32: etch is written before any cut", etchAt >= 0 && endAt > etchAt && firstCut > endAt, { etchAt, endAt, firstCut }, "C32-CAM");
  const body = etchBody(g);
  t.check("C32: the etch section has no pierce delay", body && !/\bG4\s*P[1-9]/.test(body) && !/\bG4\s*P0\.[1-9]/.test(body), body, "C32-CAM");
}

// ---- prepareJob: plasma etch skips pierce delay; later cuts still pierce ----
{
  const rect = { pts: [[0, 0], [80, 0], [80, 50], [0, 50]], closed: true };
  const score = { pts: [[5, 5], [75, 5]], closed: false, op: "score" };
  const cam = A.designToGcode([rect, score], { kerf: 1.5, leadIn: 3, name: "etched", etch: resolveEtch(null, A.chart, { tool: "plasma" }) });
  const job = A.prepareJob(cam.gcode, cut(), A.machine, false);
  const text = job.lines.join("\n");
  const body = etchBody(text);
  t.check("C32: prepared plasma etch has no positive dwell", body && !/\bG4\s*P(?!0(?:\.0*)?(?:\s|$))[0-9.]+/.test(body), body, "C32-JOB");
  const after = text.slice(text.indexOf(ETCH_END));
  t.check("C32: cuts after etch still have a pierce delay", /\bG4\s*P[0-9.]+/.test(after), after.slice(0, 400), "C32-JOB");
  t.check("C32: preview lists etch paths separately from cuts", Array.isArray(job.preview.etches) && job.preview.etches.length >= 1 && job.preview.cuts.length >= 1, job.preview, "C32-JOB");
  t.check("C32: prepared etch is not a through-cut", throughCutInEtch(job.lines, { hasEtchItems: true }) === "", throughCutInEtch(job.lines, { hasEtchItems: true }), "C32-JOB");
}

// ---- prepareJob: scribe-only job does not require M3 ----
{
  const line = { pts: [[0, 0], [30, 0]], closed: false, op: "mark" };
  const cam = A.designToGcode([line], { kerf: 1.5, leadIn: 0, name: "scribe-only", etch: resolveEtch(null, A.chart, { tool: "scribe", scribe: { on: "M8", off: "M9", offsetX: 0, offsetY: 0 } }) });
  const c = cut();
  c.etch = resolveEtch(null, A.chart, { tool: "scribe", scribe: { on: "M8", off: "M9", offsetX: 0, offsetY: 0 } });
  let job, err;
  try { job = A.prepareJob(cam.gcode, c, A.machine, false); } catch (e) { err = e.message; }
  t.check("C32: a scribe-only job is accepted without M3", !!job && !err, err || (job && job.lines.slice(0, 20)), "C32-SCRIBE");
  const text = job ? job.lines.join("\n") : "";
  t.check("C32: prepared scribe pass uses M8/M9 and not the torch", /M8/.test(text) && /M9/.test(text) && !/PORTA-ETCH PLASMA/.test(text) && !/\bM3\b/.test(etchBody(text)), text, "C32-SCRIBE");
}

// ---- fold presets: bend lines survive and can be etched ----
{
  const cs = A.makeShape("foldlbr", { a: 80, b: 60, len: 40, hole: 0, inset: 16 });
  const bends = (cs || []).filter((c) => c.role === "bend" || c.op === "score");
  t.check("C32: a folded L-bracket has an etchable bend line", !!(cs && cs.length >= 2 && bends.length >= 1 && bends[0].pts.length >= 2 && bends[0].closed === false), { n: cs && cs.length, bends: bends.length, ops: (cs || []).map((c) => [c.op, c.role, c.closed, c.pts.length]) }, "C32-FOLD");
  const cam = A.designToGcode(cs, { kerf: 1.5, leadIn: 3, name: "foldlbr", etch: resolveEtch(null, A.chart, { tool: "plasma" }) });
  t.check("C32: fold bend lines are etched before the outline is cut", /PORTA-ETCH PLASMA/.test(cam.gcode) && cam.gcode.indexOf("PORTA-ETCH END") < cam.gcode.lastIndexOf("\nM3"), cam.gcode.slice(0, 500), "C32-FOLD");
}

// ---- open 2-point score survives make / sketch ----
{
  const sk = A.newSketch();
  sk.opts.pro = true;
  const it = { id: sk.nextId++, type: "custom", p: { scale: 100 }, x: 0, y: 0, rot: 0, holes: {}, name: "Etch", op: "score",
    shape: { cs: [{ pts: [[0, 0], [25, 0]], closed: false, op: "score", bulges: [0, 0] }] } };
  const ok = sk.sanitizeItem(it);
  t.check("C32: an open 2-point etch line is kept", !!(ok && ok.op === "score" && ok.shape.cs[0].pts.length === 2 && ok.shape.cs[0].closed === false), ok, "C32-OPEN");
  sk.items.push(ok);
  const cs = sk.contours();
  t.check("C32: contours() stamps Score on the open line", cs.length === 1 && isEtchOp(cs[0].op) && cs[0].pts.length >= 2, cs, "C32-OPEN");
}

process.exit(t.done() ? 1 : 0);
