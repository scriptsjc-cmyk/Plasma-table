// r18 (Josh 23 Nov: "adjust the cnc depending on what plazma cutter is being used … a reboot as well but made default what
// it is now"): which plasma drives the table. The ANDELI CUT-65DS is the default; the Reboot 60A is the other choice.
// Changing it swaps the cut chart (amps, air, speeds, limits) straight away – no reload – and the torch start type follows
// it unless Settings › Torch › Cutter type is set by hand.
import { S, M } from "../core/state.js";
import { expandChart } from "./plasmaprofile.js";

export const PLASMAS = [
  { id: "andeli-cut65ds", name: "ANDELI CUT-65DS", note: "65 A, pilot arc – sold with the table", file: "config/cut_chart.json" },
  { id: "reboot60", name: "Reboot 60A", note: "60 A, touch start, P-80 torch", file: "config/cut_chart_reboot60.json" },
];
export const DEFAULT_PLASMA = "andeli-cut65ds";
const KEY = "plasma.profile";

export function plasmaById(id) { return PLASMAS.find((p) => p.id === id) || PLASMAS.find((p) => p.id === DEFAULT_PLASMA); }
export function currentPlasmaId() {
  let id = null; try { id = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  return plasmaById(id).id;
}
export function plasmaChosen() { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } }
export function chartFileFor(id) { return plasmaById(id).file; }

// Why the plasma can't be changed right now (null = it can)
export function plasmaChangeBlocked() {
  try { if (M && M.jobRunning && M.jobRunning()) return "A cut is running. Change the plasma when it has finished."; } catch (e) { /* ignore */ }
  return null;
}

// Load the chosen plasma's chart and use it everywhere. `after` repaints the screens that show it.
export async function setPlasma(id, { fetchText, after } = {}) {
  const p = plasmaById(id);
  const why = plasmaChangeBlocked();
  if (why) return { ok: false, why };
  const get = fetchText || ((u) => fetch(u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); }));
  let chart;
  try { chart = expandChart(JSON.parse(await get(p.file))); } catch (e) { return { ok: false, why: "Couldn't load that plasma's cut chart: " + e.message }; }
  try { localStorage.setItem(KEY, p.id); } catch (e) { /* ignore */ }
  S.chart = chart;
  try { if (M) M.chart = chart; } catch (e) { /* ignore */ }
  const mats = chart.materials || [];
  if (!mats.some((m) => m.name === S.material) && mats.length) S.material = mats[0].name;
  try { if (after) after(chart); } catch (e) { /* ignore */ }
  return { ok: true, chart, plasma: p };
}
