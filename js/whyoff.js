// Greyed controls say why. Every control in WATCH that is disabled gets aria-disabled="true" and data-why="<short reason>";
// both are removed when it is enabled again. The `disabled` property itself is never touched here.
// Jog pads and step buttons are not `disabled` (the jog code gates them), so for those "unavailable" comes from `unavailable(el)`.
export const WATCH_IDS = ["btnStart", "next1", "btnZero", "btnTrace", "btnGoStart", "skUndo", "skRedo", "skClear", "skAll", "rsKeep", "btnRef", "btnClearLimits", "btnTouchTest", "btnTorchTest", "btnPushSettings", "btnDemoEdges"];
export const WATCH_SEL = ".j[data-axis], .steps button, #cutList [data-mv]";

export function syncWhy(reason, unavailable, root = document) {
  const els = [...WATCH_IDS.map((id) => root.getElementById(id)).filter(Boolean), ...root.querySelectorAll(WATCH_SEL)];
  for (const el of els) {
    const off = !!el.disabled || !!(unavailable && unavailable(el));
    if (off) {
      const why = String((reason && reason(el)) || "Not available right now.");
      if (el.getAttribute("aria-disabled") !== "true") el.setAttribute("aria-disabled", "true");
      if (el.dataset.why !== why) el.dataset.why = why;
    } else {
      if (el.hasAttribute("aria-disabled")) el.removeAttribute("aria-disabled");
      if (el.hasAttribute("data-why")) el.removeAttribute("data-why");
    }
  }
}

// keep it in step with the page: run on any `disabled` flip or when the cut list / jog pad is redrawn
export function watchWhy(run) {
  let queued = false;
  const go = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; run(); }); };
  new MutationObserver(go).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
  go();
  return go;
}
