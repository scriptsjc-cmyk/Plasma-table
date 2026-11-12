// In-app confirm. Native window.confirm() freezes the page, so STOP and Space
// would not work; this overlay starts below the header and never captures them.
import { $ } from "./dom.js";

let queue = Promise.resolve();

export function safeDlgOpen() {
  const el = $("safeDlg");
  return !!(el && !el.classList.contains("hidden"));
}

export function askConfirm({ title = "Please confirm", body = "", ok = "OK", cancel = "Cancel", danger = false, okDisabled = false, okDisabledReason = "" } = {}) {
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
    if (!dlg || !okBtn || !cancelBtn) { resolve(false); return; }
    const finish = (yes) => {
      dlg.classList.add("hidden");
      dlg.setAttribute("aria-hidden", "true");
      okBtn.onclick = cancelBtn.onclick = null;
      document.removeEventListener("keydown", onKey, true);
      resolve(!!yes);
    };
    const onKey = (e) => {
      if (dlg.classList.contains("hidden")) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); return; }
      if (e.key === "Enter" && document.activeElement === okBtn && !okBtn.disabled) { e.preventDefault(); finish(true); return; }
      if (e.key === "Enter" && document.activeElement === cancelBtn) { e.preventDefault(); finish(false); return; }
      if (e.key === "Tab") {
        const focusable = [cancelBtn, okBtn].filter((b) => !b.disabled);
        if (!focusable.length) return;
        e.preventDefault();
        const i = focusable.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? focusable.length - 1 : i - 1) : (i === focusable.length - 1 || i < 0 ? 0 : i + 1);
        focusable[next].focus();
      }
      // Do not let Space click OK/Cancel; do not stop it, so flow.js can still E-stop.
      if (e.key === " " || e.code === "Space") { e.preventDefault(); return; }
    };
    titleEl.textContent = title;
    bodyEl.textContent = body;
    okBtn.textContent = ok;
    cancelBtn.textContent = cancel;
    okBtn.disabled = !!okDisabled;
    okBtn.classList.toggle("danger", !!danger && !okDisabled);
    if (noteEl) {
      noteEl.textContent = okDisabled ? (okDisabledReason || "This action isn't available right now.") : "";
      noteEl.classList.toggle("hidden", !okDisabled);
    }
    dlg.classList.remove("hidden");
    dlg.setAttribute("aria-hidden", "false");
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
