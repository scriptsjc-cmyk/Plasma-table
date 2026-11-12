// Practice-table helpers: set up the edges, fit dressing, jump to pierce.
import { $ } from "../core/dom.js";
import { H, wait } from "./host.js";

// ================================================================ demo: "set up the edges for me"
export function bindDemo() {
  const b = $("btnDemoEdges"); if (b) b.onclick = demoEdges;
}
export async function demoEdges() {
  const S = H.S, sim = S.demo, M = H.M();
  if (!sim || !M.grbl) { H.toast("This only works in the demo.", true); return; }
  if (S.job && S.job.running) { H.toast("A job is running.", true); return; }
  const btn = $("btnDemoEdges"); if (btn) btn.disabled = true;
  const tp = async (p) => { for (let i = 0; i < 40; i++) { if (sim.demoTeleport(p)) return true; await wait(100); } throw new Error("The demo didn't settle. Try again in a moment."); };
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(80); } return false; };
  try {
    H.toast("Demo: finding home…");
    if (M.state() === "Alarm") H.cmd("unlock");
    await wait(150);
    if (!S.safety.referenced) {
      H.cmd("home");
      if (!await until(() => S.safety.referenced && M.state() === "Idle", 20000)) throw new Error("The demo didn't finish homing.");
    }
    const t = H.cfg().travel_mm;
    await tp([t.x - 10, t.y - 10, 0]);
    await until(() => Math.abs((S.status.MPos || [0])[0] - (t.x - 10)) < 1, 3000);
    H.cmd("limits_far");
    // pretend the floating head is pushed up by a slat: the demo's simulated probe input turns on
    const sheet = sim.sheetZ - sim.switchOffset - 0.5;
    await tp([t.x - 10, t.y - 10, sheet]);
    await until(() => S.status.inputs && S.status.inputs.probe, 3000);
    H.cmd("limits_zbottom");
    await tp([t.x - 10, t.y - 10, 0]);
    await wait(200);
    H.cmd("limits_save");
    await tp([0, 0, 0]);
    await until(() => S.safety.limits && S.safety.referenced, 3000);
    H.toast("Demo edges set up ✓ (nothing real moved)");
  } catch (e) { H.toast(e.message, true); }
  finally { if (btn) btn.disabled = false; }
}
export function bindPierceJump() {
  const toTorch = $("btnPierceJump");
  if (toTorch) toTorch.onclick = () => {
    const tab = document.querySelector('#settingsTabs [data-settab="torch"]');
    if (tab) tab.click();
    const el = $("setPierceH");
    if (el) { el.scrollIntoView({ block: "center" }); el.focus(); }
  };
  const toSpeed = $("btnPierceSpeed");
  if (toSpeed) toSpeed.onclick = () => {
    const dlg = $("settingsDlg");
    if (dlg) dlg.classList.add("hidden");
    const cut = document.querySelector('.tab[data-tab="cut"]');
    if (cut) cut.click();
    if (H && H.goStep) H.goStep(2);
    const el = $("spSlider");
    if (el) setTimeout(() => { el.scrollIntoView({ block: "center" }); el.focus(); }, 60);
  };
}
