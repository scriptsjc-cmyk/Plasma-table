// r8 items 4–5: the cut-status box next to the Cut tab. Yellow and pulsing when something is
// wrong; calm when all is fine. Hover, focus or a tap shows the list. A setup problem (edges,
// homing) offers a link to Machine setup in the main Menu.
import { $ } from "../core/dom.js";
import { S } from "../core/state.js";
import { blockers } from "./checklist.js";

function isSetupIssue(text) {
  return /edges? not set|not set up|homing|needs homing|Machine setup|referenced/i.test(text);
}

export function cutStatusIssues() {
  const out = [];
  const seen = new Set();
  const add = (text, kind) => {
    const t = String(text || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ text: t, kind: kind || (isSetupIssue(t) ? "setup" : "cut") });
  };
  // The tick-box is only relevant on Bed & start, just before Start cutting.
  const skipTick = S.cur !== 3;
  for (const t of blockers()) {
    if (skipTick && /Tick the safety check box/i.test(t)) continue;
    add(t);
  }
  if (S.check && S.check.groups) {
    for (const g of S.check.groups) {
      if (g.level === "ok") continue;
      add((g.n ? g.n + " " : "") + g.text, "check");
    }
  }
  return out;
}

export function paintCutStatus() {
  const btn = $("cutStatus"), pop = $("cutStatusPop");
  if (!btn) return;
  const issues = cutStatusIssues();
  const bad = issues.length > 0;
  btn.hidden = false;
  btn.classList.remove("hidden");
  btn.classList.toggle("is-bad", bad);
  btn.classList.toggle("is-ok", !bad);
  btn.setAttribute("aria-expanded", pop && !pop.hidden ? "true" : "false");
  const label = bad ? `Check the cut: ${issues.length} warning${issues.length === 1 ? "" : "s"}` : "Check cut";
  // the label may be shortened with … when the header is crowded (r13: it gives way, the step tabs don't overlap); full text on hover
  btn.innerHTML = `<span class="cutstatus-dot" aria-hidden="true"></span><span class="cutstatus-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
  btn.removeAttribute("title");
  if (pop) {
    const rows = issues.map((i) => {
      const link = i.kind === "setup"
        ? ` <button type="button" class="cutstatus-setup" data-goto="setup">Open Machine setup</button>`
        : "";
      return `<li>${escapeHtml(i.text)}${link}</li>`;
    }).join("");
    pop.innerHTML = bad
      ? `<p class="cutstatus-head">What's wrong</p><ul>${rows}</ul>`
      : `<p class="cutstatus-head">All clear</p><p>Nothing is blocking the cut.</p>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// r15: on a laptop the pop-up opens over the bed drawing (below its top chips), not over the Part / Setup panels it
// used to cover from the header; a phone (or no drawing on screen) keeps it under the button.
function placePop(pop) {
  const cv = $("preview"), r = cv && cv.getBoundingClientRect();
  const laptop = matchMedia("(min-width: 1280px) and (hover: hover) and (pointer: fine)").matches;
  if (laptop && r && r.width >= 320 && r.height >= 200) {
    Object.assign(pop.style, { position: "fixed", left: Math.round(r.left + 8) + "px", top: Math.round(r.top + 44) + "px",
      maxWidth: Math.round(Math.min(420, r.width - 16)) + "px", maxHeight: Math.round(r.height - 52) + "px", marginTop: "0" });
  } else {
    for (const k of ["position", "left", "top", "maxWidth", "maxHeight", "marginTop"]) pop.style[k] = "";
  }
}
function setOpen(on) {
  const btn = $("cutStatus"), pop = $("cutStatusPop");
  if (!btn || !pop) return;
  pop.hidden = !on;
  pop.classList.toggle("hidden", !on);
  btn.setAttribute("aria-expanded", on ? "true" : "false");
  if (on) { paintCutStatus(); placePop(pop); }
}

export function bindCutStatus() {
  const btn = $("cutStatus"), pop = $("cutStatusPop");
  if (!btn || !pop) return;
  // a click pins it open (the pop-up sits over the drawing, away from the button, so the pointer may cross other things
  // on its way there); hovering only peeks
  let pinned = false;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    pinned = !pinned || pop.hidden || pop.classList.contains("hidden");
    setOpen(pinned);
  });
  btn.addEventListener("mouseenter", () => setOpen(true));
  btn.addEventListener("focus", () => setOpen(true));
  const hideSoon = () => { setTimeout(() => {
    if (pinned || btn.matches(":hover, :focus, :focus-visible") || pop.matches(":hover, :focus-within")) return;
    setOpen(false);
  }, 200); };
  btn.addEventListener("mouseleave", hideSoon);
  btn.addEventListener("blur", hideSoon);
  pop.addEventListener("mouseleave", hideSoon);
  pop.addEventListener("click", (e) => {
    const b = e.target.closest("[data-goto=setup]");
    if (!b) return;
    e.preventDefault();
    pinned = false;
    setOpen(false);
    import("../ui/flow.js").then((f) => f.showScreen("cut"));
    import("../ui/nav.js").then((n) => n.showTab("setup"));
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { pinned = false; setOpen(false); } });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#cutStatus, #cutStatusPop")) return;
    pinned = false;
    setOpen(false);
  });
  paintCutStatus();
}
