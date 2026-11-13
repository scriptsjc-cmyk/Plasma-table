// Screens and steps: menu, Make a part -> Get set up -> Cut, tabs and the stepper.
import { closeAccountUi, openAccount } from "../account/accounthome.js";
import { navLocked, screen, showScreen } from "./flow.js";
import * as Acc from "../account/account.js";
import * as Setup from "../cut/setup.js";
import { demoEdges } from "./demo.js";
import { $, $$, esc, toast } from "../core/dom.js";
import { host } from "../account/uibase.js";
import { S, sketch } from "../core/state.js";
import { loadJob, renderCutCheck } from "../cut/prepare.js";
import { renderMaterials } from "../cut/material.js";
import { applyBodyMode, syncModeSwitch } from "./mode.js";
import { syncPhoneUi } from "../make/phonesheet.js";
import { renderProTools, setShapeFs } from "../make/protools.js";
import { renderShapeForm } from "../make/shapeform.js";
import { drawPreview } from "../cut/preview.js";
import { renderChecklist } from "../cut/checklist.js";
import { paintChrome, refresh, renderQuickBar, showSource, useShape } from "../core/hooks.js";
import { resetPreviewCam } from "../cut/previewnav.js";
import { syncJogPadLabels } from "../cut/bedview.js";

// ------------------------------------------------------------------ screens (login -> menu -> make | cut)
// body[data-screen] is owned by flow.js; this is what each screen shows.
export const testBypass = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && new URLSearchParams(location.search).has("test") && !new URLSearchParams(location.search).has("gate");
export function paintMenu() {
  const u = Acc.currentUser();
  const nm = u && (u.display_name || (u.email || "").split("@")[0]);
  $("menuHello").textContent = nm ? `Hi ${nm}. What do you want to do?` : "What do you want to do?";
  $("menuMachine").textContent = Acc.hasLinkedMachine() ? "Your machine is linked." : (Acc.isSignedIn() ? "No machine linked yet. You can make parts and practise now; link a machine to cut for real." : "");
  paintMenuRecent();
}
// round 5 item 27: the menu's status row also offers the last few saved parts, one tap from opening in Make a part
let recentTurn = 0;
async function paintMenuRecent() {
  const wrap = $("menuRecentWrap"), box = $("menuRecent"), turn = ++recentTurn;
  if (!wrap || !box) return;
  let rows = [];
  if (Acc.isSignedIn()) { try { rows = (await Acc.listParts()).slice(0, 3); } catch (e) { rows = []; } }
  if (turn !== recentTurn) return;                       // a newer paint (sign out, another account) already ran
  wrap.classList.toggle("hidden", !rows.length);
  box.innerHTML = rows.map((p) => `<button type="button" class="small" data-part="${esc(p.id)}">${esc(p.name || "Untitled part")}</button>`).join("");
}
async function openRecentPart(id) {
  try {
    const p = await Acc.loadPart(id);
    if (host && host.loadDesign) host.loadDesign(p);
    showScreen("make");
    toast("Opened “" + p.name + "”");
  } catch (e) { toast(e.message, true); }
}
// B5 21: a signed-in user's very first job is a Practice run by default (move only, torch off). Once any job has been started,
// Practice goes back to being their own choice. Tracked per account on this device.
const firstJobKey = () => { const u = Acc.currentUser(); return u ? "plasma.firstJobDone." + (u.id || u.email || "user") : null; };
function firstJobDone() { const k = firstJobKey(); if (!k) return true; try { return localStorage.getItem(k) === "1"; } catch (e) { return false; } }
export function markFirstJobDone() { const note = $("dryFirstNote"); if (note) note.classList.add("hidden"); const k = firstJobKey(); if (!k) return; try { localStorage.setItem(k, "1"); } catch (e) { /* private mode */ } }
function applyFirstJobDefault() {
  const k = firstJobKey(), cb = $("dryRun");
  if (!k || !cb || firstJobDone() || S._firstJobFor === k) return;
  S._firstJobFor = k;
  if (!cb.checked) { cb.checked = true; if (S.prepared) loadJob(); renderMaterials(); }
  const note = $("dryFirstNote"); if (note) note.classList.remove("hidden");
  // round 5 item 18: said once, in the step text beside the box (#dryFirstNote), not in a toast over the preview
}
export function onScreen(name, prev) {
  if (prev === "cut") S.cutStep = S.cur;
  $("menuView").classList.toggle("hidden", name !== "menu");
  if (name !== "cut" && name !== "make") { $("cutView").classList.add("hidden"); $("setupView").classList.add("hidden"); }
  applyBodyMode();
  try { syncPhoneUi(); } catch (e) { /* ignore */ }
  const gate = $("accountDlg");
  gate.classList.toggle("loginpage", name === "login");
  if (name === "login") openAccount("in");
  else if (prev === "login") closeAccountUi();
  if (name !== "make") setShapeFs(false);          // round 5 item 12: the full-screen editor's Done / Save bar never follows you off Make a part
  if (name === "menu") paintMenu();
  if (name === "cut") applyFirstJobDefault();
  if (name === "make") {
    S.tab = "cut"; showTab("cut");
    S.src = "shape";
    showSource("shape");
    goStep(1);
    syncModeSwitch(); renderProTools(); renderShapeForm(); renderQuickBar();
  } else if (name === "cut") {
    showTab(S.tab === "setup" ? "setup" : "cut");
    goStep(S.prepared && S.cutStep >= 3 ? Math.min(S.cutStep, S.job ? 4 : 3) : 1);
    renderMaterials();
  }
  try { renderCutCheck(); } catch (e) { /* ignore */ }
  try { paintChrome(); refresh(); } catch (e) { /* ignore */ }
  window.scrollTo(0, 0);
}
// Make a part -> the cutting screen, starting at material / thickness (step 1), not the bed.
export function sendToCutting() {
  if (S.src === "shape" && sketch) useShape();
  if (!S.prepared) { toast("Pick or draw a part first.", true); return; }
  try { resetPreviewCam(); } catch (e) { /* ignore */ }
  if (!showScreen("cut")) return;
  goStep(1);
}
// signed in -> menu; signed out -> the sign-in page
export function routeAuth() {
  const signed = Acc.isSignedIn();
  if (testBypass()) { if (screen() === "boot") showScreen("menu", { force: true }); return; }
  if (signed && (screen() === "login" || screen() === "boot")) showScreen("menu", { force: true });
  else if (!signed && screen() !== "login") { S.cutStep = 1; showScreen("login", { force: true }); }
}
// ------------------------------------------------------------------ tabs & steps
export function showTab(name) {
  if (name !== "setup") name = "cut";
  if (name !== S.tab && screen() === "cut" && navLocked()) { toast("Not while the machine is cutting. Press the red E-STOP first.", true); return; }
  const scr = screen();
  $$(".tab").forEach((t) => t.classList.toggle("sel", t.dataset.tab === name));
  $("cutView").classList.toggle("hidden", !(scr === "make" || (scr === "cut" && name === "cut")));
  $("setupView").classList.toggle("hidden", !(scr === "cut" && name === "setup"));
  S.tab = name;
  document.body.dataset.tab = (scr === "cut" && name === "setup") ? "setup" : (scr === "cut" ? "cut" : "");
  if (name === "cut") drawPreview();
  syncJogPadLabels();
}
export function canGo(n) {
  if (n === 4) return !!S.job;
  if (n >= 2) return !!S.prepared;
  return true;
}
export function goStep(n) {
  if (screen() === "make") n = 1;                // Make a part is one page; the numbered steps belong to the cutting screen
  if (n === 2) n = 3;                            // (the old Material step now lives on step 1)
  if (!canGo(n)) return;
  if (S.job && S.job.running && n !== 4) { toast("A job is running. Pause or stop it first.", true); return; }
  if (n !== 1 && S.shapeFs) setShapeFs(false);
  S.cur = n; document.body.dataset.step = String(n);
  $$(".step").forEach((el) => el.classList.toggle("hidden", Number(el.dataset.step) !== n));
  $$("#stepper li").forEach((li) => {
    const k = Number(li.dataset.step);
    li.classList.toggle("cur", k === n);
    li.classList.toggle("done", k < n);
  });
  if (n !== 3) Setup.leave();
  if (n === 3 && screen() === "cut") { Setup.enter(); renderChecklist(); }
  refresh();
  window.scrollTo({ top: 0, behavior: "smooth" });
  const sp = document.querySelector(".stepPane"); if (sp) sp.scrollTop = 0;
  syncJogPadLabels();
}
export function syncSteps() {
  $$(".steps button").forEach((b) => b.classList.toggle("sel", Number(b.dataset.step) === S.jogStep));
}
export function bindNav() {
  $("menuRecent").addEventListener("click", (e) => { const b = e.target.closest("button[data-part]"); if (b) openRecentPart(b.dataset.part); });
  $$(".tab").forEach((t) => (t.onclick = () => showTab(t.dataset.tab)));
  $$("#stepper li").forEach((li) => (li.onclick = () => goStep(Number(li.dataset.step))));
  $$("[data-go]").forEach((b) => (b.onclick = () => goStep(Number(b.dataset.go))));
  $("next1").onclick = () => (screen() === "make" ? sendToCutting() : goStep(3));
  $("btnChangeMat").onclick = () => goStep(1);
  $("btnEditParts").onclick = () => {          // the layout only places parts: shape and size changes happen in Make a part, with the picked part still picked
    const it = sketch && sketch.selected(), id = it ? ((sketch.hostPart(it) || it).id) : null;
    showScreen("make");
    if (id && sketch.item(id)) { sketch.pick([id]); sketch.onSelect(); sketch.draw(); }
  };
  if ($("fit")) $("fit").addEventListener("click", () => {
    if (!$("fit").classList.contains("unknown")) return;
    if (S.demo && S.connected) { demoEdges(); return; }
    if (screen() === "cut") showTab("setup");
  });
}
