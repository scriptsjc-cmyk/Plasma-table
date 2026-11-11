// Node environment stubs so the Sketch class (canvas editor) can run headless against the real site code.
import { pathToFileURL } from "node:url";
export const SITE = (process.env.SITE_DIR || new URL("../../", import.meta.url).pathname).replace(/\/?$/, "/");
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), _m: store };
globalThis.devicePixelRatio = 1; globalThis.window = globalThis;
const noop = () => {};
globalThis.document = { addEventListener: noop, removeEventListener: noop, activeElement: null, visibilityState: "visible" };
globalThis.addEventListener = noop; globalThis.removeEventListener = noop; globalThis.requestAnimationFrame = noop; globalThis.HTMLElement = function () {};
function mockCanvas() {
  const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 8 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  return { width: 390, height: 400, clientWidth: 390, clientHeight: 400, style: {}, classList: { toggle() {} }, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 400 }), addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, offsetParent: {}, closest: () => null };
}
export async function load() {
  const imp = (f) => import(pathToFileURL(SITE + f).href);
  const [shapes, geom, variants, expr, sketch, cam, job, check] = await Promise.all(["js/shapes.js", "js/geom.js", "js/variants.js", "js/expr.js", "js/sketch.js", "js/cam.js", "js/job.js", "js/check.js"].map(imp));
  const fs = await import("node:fs");
  const machine = JSON.parse(fs.readFileSync(SITE + "config/machine.json", "utf8"));
  const chart = JSON.parse(fs.readFileSync(SITE + "config/cut_chart.json", "utf8"));
  const messages = [];
  const newSketch = () => { store.clear(); const sk = new sketch.Sketch(mockCanvas(), { onMessage: (m) => messages.push(m) }); sk.setActive(true); sk.draw = () => {}; sk.items = []; sk.nextId = 1; sk.past = []; sk.future = []; sk.messages = messages; return sk; };
  const cutFor = (mat = "Mild steel", th = 3) => { const m = chart.materials.find((x) => x.name === mat); const r = m.rows.find((x) => x.thickness_mm === th) || m.rows[0];
    return { feed_mm_min: r.feed_mm_min, pierce_delay_s: r.pierce_delay_s, pierce_height_mm: r.pierce_height_mm ?? chart.pierce_height_mm, cut_height_mm: r.cut_height_mm ?? chart.cut_height_mm }; };
  return { ...shapes, ...geom, ...variants, ...expr, ...sketch, ...cam, ...job, ...check, machine, chart, newSketch, cutFor, store, SITE };
}
