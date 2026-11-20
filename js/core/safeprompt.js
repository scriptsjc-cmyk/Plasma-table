// In-app confirm. Native window.confirm() freezes the page, so STOP and Space
// would not work; this overlay starts below the header and the safety banners, and never captures them.
import { $, bannerBottom, placeToast } from "./dom.js";

let queue = Promise.resolve();
let closeOpen = null;            // answers the confirm on screen (if any) with "no"

// STOP answers any open confirm with Cancel, so a "Start anyway" can't be left waiting behind a latched E-stop (r7 U6)
export function cancelConfirm() { if (closeOpen) closeOpen(false); }

export function askConfirm({ title = "Please confirm", body = "", ok = "OK", cancel = "Cancel", danger = false, okDisabled = false, okDisabledReason = "", ticks = null, compact = false, lines = null } = {}) {
  const run = async () => {
    const msg = [title, body].filter(Boolean).join("\n");
    try {
      if (typeof window !== "undefined" && typeof window.__reportSafeConfirm === "function") {
        const auto = await window.__reportSafeConfirm(msg);
        if (auto === "accept") return !okDisabled;
        if (auto === "dismiss") return false;
      }
    } catch (e) { /* show the dialog */ }
    return new Promise((resolve) => {
    const dlg = $("safeDlg"), titleEl = $("safeDlgTitle"), bodyEl = $("safeDlgBody");
    const noteEl = $("safeDlgNote"), okBtn = $("safeDlgOk"), cancelBtn = $("safeDlgCancel");
    const ticksEl = $("safeDlgTicks");
    const card = dlg.querySelector(".safedlg-card");
    const linesEl = $("safeDlgLines");
    if (!dlg || !okBtn || !cancelBtn) { resolve(false); return; }
    if (card) card.classList.toggle("is-compact", !!compact);
    const tickList = Array.isArray(ticks) ? ticks.filter(Boolean) : [];
    const allTicked = () => !tickList.length || (ticksEl && [...ticksEl.querySelectorAll("input[type=checkbox]")].every((c) => c.checked));
    const blocked = () => !!okDisabled || !allTicked();
    const syncOk = () => {
      const off = blocked();
      okBtn.disabled = off;
      okBtn.classList.toggle("go", !off && !danger);
      okBtn.classList.toggle("warn", !off && !!danger);
      if (noteEl) {
        const note = okDisabled ? (okDisabledReason || "This action isn't available right now.")
          : (tickList.length && !allTicked() ? (tickList.length === 1 ? "Tick the check first." : "Tick each check first.") : "");
        noteEl.textContent = note;
        noteEl.classList.toggle("hidden", !note);
      }
    };
    const fillTicks = () => {
      if (!ticksEl) return;
      ticksEl.innerHTML = "";
      if (!tickList.length) { ticksEl.classList.add("hidden"); return; }
      ticksEl.classList.remove("hidden");
      tickList.forEach((label, i) => {
        const row = document.createElement("label");
        row.className = "safedlg-tick";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "safeDlgTick" + i;
        cb.addEventListener("change", syncOk);
        const span = document.createElement("span");
        span.textContent = label;
        row.append(cb, span);
        ticksEl.append(row);
      });
    };
    const finish = (yes) => {
      closeOpen = null;
      dlg.classList.add("hidden");
      dlg.setAttribute("aria-hidden", "true");
      okBtn.onclick = cancelBtn.onclick = null;
      if (ticksEl) { ticksEl.innerHTML = ""; ticksEl.classList.add("hidden"); }
      if (linesEl) { linesEl.innerHTML = ""; linesEl.classList.add("hidden"); }
      if (bodyEl) bodyEl.classList.remove("hidden");
      if (card) card.classList.remove("is-compact");
      document.removeEventListener("keydown", onKey, true);
      resolve(!!yes);
    };
    const focusables = () => {
      const boxes = ticksEl ? [...ticksEl.querySelectorAll("input[type=checkbox]")] : [];
      return [...boxes, cancelBtn, okBtn].filter((b) => b && !b.disabled);
    };
    const onKey = (e) => {
      if (dlg.classList.contains("hidden")) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); return; }
      if (e.key === "Enter" && document.activeElement === okBtn && !okBtn.disabled) { e.preventDefault(); finish(true); return; }
      if (e.key === "Enter" && document.activeElement === cancelBtn) { e.preventDefault(); finish(false); return; }
      if (e.key === "Tab") {
        const list = focusables();
        if (!list.length) return;
        e.preventDefault();
        const i = list.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i === list.length - 1 || i < 0 ? 0 : i + 1);
        list[next].focus();
      }
      // Do not let Space click OK/Cancel; do not stop it, so flow.js can still E-stop.
      if (e.key === " " || e.code === "Space") { e.preventDefault(); return; }
    };
    titleEl.textContent = title;
    bodyEl.textContent = body;
    if (linesEl) {
      const list = Array.isArray(lines) ? lines.filter(Boolean) : [];
      linesEl.innerHTML = "";
      if (list.length) {
        list.forEach((s) => { const li = document.createElement("li"); li.textContent = s; linesEl.append(li); });
        linesEl.classList.remove("hidden");
        if (bodyEl) bodyEl.classList.toggle("hidden", !body);
      } else {
        linesEl.classList.add("hidden");
        if (bodyEl) bodyEl.classList.remove("hidden");
      }
    }
    okBtn.textContent = ok;
    cancelBtn.textContent = cancel;
    fillTicks();
    syncOk();
    dlg.style.top = Math.ceil(bannerBottom()) + "px";
    dlg.classList.remove("hidden");
    dlg.setAttribute("aria-hidden", "false");
    closeOpen = finish;
    placeToast();
    okBtn.onclick = () => { if (!okBtn.disabled) finish(true); };
    cancelBtn.onclick = () => finish(false);
    document.addEventListener("keydown", onKey, true);
    try { cancelBtn.focus(); } catch (e) { /* ignore */ }
    });
  };
  const next = queue.then(run, run);
  queue = next.then(() => {}, () => {});
  return next;
}
