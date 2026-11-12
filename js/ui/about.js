// New-version banner and the About lines: reads version.json and offers a reload when a new release is out.
import { $ } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { H } from "./host.js";
import { VERSION } from "../version.js";

// The version this page is running. The deploy writes version.json (commit id) next to the files, so the page reads the id
// from there when it starts (js/version.js is only the fallback). That way the footer/About always show the deployed commit
// and the "New version" banner only appears when version.json changes AFTER this page loaded.
export let RUN = VERSION;
// ================================================================ version + update banner
async function fetchLatest() {
  try {
    const r = await fetch("version.json?" + Date.now(), { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.id ? j : null;
  } catch (e) { return null; }
}
function showUpdate(info) {
  const bar = $("updateBar"); if (!bar) return;
  $("updateText").textContent = `Version ${info.id} is ready${H.jobRunning() ? ". Finish the cut first, then reload." : ". Reload to get it."}`;
  bar.classList.remove("hidden");
  if ($("aboutNote")) $("aboutNote").textContent = `A newer version (${info.id}) is available. You are on ${RUN.id}.`;
}
async function doReload() {
  if (H.jobRunning()) { H.toast("A job is running. Reload after it finishes.", true); return; }
  if (H.dirtyDesign() && !(await askConfirm({ title: "Reload now?", body: "The shape you are drawing is not saved to your account.", ok: "Reload", cancel: "Cancel", danger: true }))) return;
  navigator.serviceWorker && navigator.serviceWorker.getRegistration && navigator.serviceWorker.getRegistration()
    .then((r) => { if (r && r.waiting) r.waiting.postMessage("skip"); }).catch(() => {});
  location.reload();
}
async function checkVersion(manual) {
  const j = await fetchLatest();
  if (j && j.id !== RUN.id) { showUpdate(j); return "new"; }
  if (manual && $("aboutNote")) $("aboutNote").textContent = j ? `You are on the latest version (${RUN.id}).` : "Couldn't check right now (offline?). You are on " + RUN.id + ".";
  return j ? "same" : "offline";
}
function versionText() { return `Version ${RUN.id}${RUN.commit && RUN.commit !== "pending" && !String(RUN.id).includes(RUN.commit) ? " · " + RUN.commit : ""}`; }
export function paintVersionLines() {
  const t = versionText();
  if ($("verLine")) $("verLine").textContent = t;
  if ($("footVer")) $("footVer").textContent = t;
}
export function paintAbout() {
  if ($("aboutVer")) $("aboutVer").innerHTML = `<b>${RUN.id}</b><br><span class="muted small">commit ${RUN.commit} · built ${RUN.built}</span>`;
}
export function bindVersion() {
  window.addEventListener("pt-new-version", (e) => {
    const d = e && e.detail;
    if (d && d.id && d.id !== "new") showUpdate(d);
    else checkVersion(false);
  });
  if ($("btnReload")) $("btnReload").onclick = doReload;
  if ($("btnAboutReload")) $("btnAboutReload").onclick = doReload;
  if ($("btnCheckVer")) $("btnCheckVer").onclick = async () => {
    $("aboutNote").textContent = "Checking…";
    try { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch (e) { /* offline */ }
    checkVersion(true);
  };
  setTimeout(() => checkVersion(false), 5000);
  setInterval(() => { if (document.visibilityState === "visible") checkVersion(false); }, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkVersion(false); });
}
// Starts watching version.json: the first answer sets the version this page shows, later answers raise the banner.
export function startVersionWatch() {
  fetchLatest().then((j) => { if (j) { RUN = { id: j.id, commit: j.commit || VERSION.commit, built: j.built || VERSION.built }; paintVersionLines(); paintAbout(); } });
}
