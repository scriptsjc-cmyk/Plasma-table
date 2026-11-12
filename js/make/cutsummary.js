// Round 5 item 9: the cut settings, read-only on Make a part in both modes, with one way to change them
// (the cutting screen's Material step and More cut options). Beginner keeps "Change" behind an Advanced fold.
import { kerfNow, leadNow } from "../cut/prepare.js";
import { row } from "../cut/material.js";
import { showScreen } from "../ui/flow.js";
import { goStep, useShape } from "../core/hooks.js";
import { $, esc } from "../core/dom.js";
import { formatLen } from "../core/prefs.js";
import * as Acc from "../account/account.js";
import { S, sketch } from "../core/state.js";

const num = (id) => { const el = $(id), v = el ? el.value.trim() : ""; return v !== "" && Number.isFinite(Number(v)) ? Number(v) : null; };
export function cutSettings() {
  const r = row();
  return [
    ["Material", S.material || "–"],
    ["Thickness", formatLen(S.thickness, 2)],
    ["Cut width (kerf)", formatLen(kerfNow(), 2)],
    ["Pierce delay", `${num("ovDelay") ?? r.pierce_delay_s} s`],
    ["Cut speed", S.speed ? `${S.speed} mm/min` : "–"],
    ["Lead-in", formatLen(leadNow(), 2)],
    ["Practice run", ($("dryRun") && $("dryRun").checked) || (Acc && Acc.hasLinkedMachine && !Acc.hasLinkedMachine())
      ? (Acc && Acc.hasLinkedMachine && !Acc.hasLinkedMachine() ? "On (no machine linked)" : "On – torch stays off")
      : "Off"],
  ];
}
// painted in two places from the same values: under the size boxes (Beginner) and at the foot of the Pro inspector
export function paintCutSummary() {
  if (!S.chart) return;
  let rows; try { rows = cutSettings(); } catch (e) { return; }       // the cut chart is not loaded yet
  const list = `<dl class="cutsum">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  const change = `<button type="button" class="cutsum-change" data-cutsum="change">Change cut settings</button>`;
  const beg = $("cutSummary"), pro = $("ptInspCutSum");
  if (beg) beg.innerHTML = `<h3>Cut settings</h3>${list}<details class="cutsum-adv"><summary>Advanced</summary><p class="muted small">These are set on the cutting screen, for the material you pick there.</p>${change}</details>`;
  if (pro) pro.innerHTML = `<h3>Cut settings</h3>${list}${change}`;
}
// "Change": the cutting screen's first step, with the material list in view and More cut options open
export function changeCutSettings() {
  if (S.src === "shape" && sketch && sketch.items.length) useShape();
  if (!showScreen("cut")) return;
  goStep(1);
  const adv = $("advCut"); if (adv) adv.open = true;
  const at = $("matLine") || adv; if (at) at.scrollIntoView({ block: "start" });
}
export function bindCutSummary() {
  document.addEventListener("click", (e) => { if (e.target.closest(".cutsummary [data-cutsum=change]")) changeCutSettings(); });
  ["dryRun", "ovKerf", "ovLead", "ovDelay"].forEach((id) => { const el = $(id); if (el) el.addEventListener("change", paintCutSummary); });
}
