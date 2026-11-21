// Laptop Advanced inspector: Part / Size / Holes / Arrange tabs, no pane scroll.
import { $ } from "../core/dom.js";
import { isShellLaptop } from "../ui/laptop.js";

const TABS = ["part", "size", "holes", "arrange"];

export function setInspectorTab(name) {
  const host = $("srcShape");
  if (!host) return;
  const tab = TABS.includes(name) ? name : "part";
  host.dataset.insp = tab;
  host.querySelectorAll(".insp-tabs [data-insp]").forEach((b) => {
    const on = b.getAttribute("data-insp") === tab;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
}

export function initInspectorTabs() {
  const host = $("srcShape");
  if (!host || host.dataset.inspBound) return;
  host.dataset.inspBound = "1";
  if (!host.dataset.insp) host.dataset.insp = "part";
  host.addEventListener("click", (e) => {
    const btn = e.target.closest(".insp-tabs [data-insp]");
    if (!btn) return;
    setInspectorTab(btn.getAttribute("data-insp"));
  });
  setInspectorTab(host.dataset.insp);
}

export function maybeOpenSizeTab() {
  if (!isShellLaptop()) return;
  if (!document.body.classList.contains("pro-mode") && !document.body.classList.contains("advanced-mode")) return;
  const host = $("srcShape");
  if (!host) return;
  // r15 7.3: while an edge or a corner is being edited its panel (on the Part tab) stays in view
  if (panelOpen()) { setInspectorTab("part"); return; }
  if (host.dataset.insp === "holes" || host.dataset.insp === "arrange") return;
  setInspectorTab("size");
}

function panelOpen() {
  return ["edgePanel", "filletPanel"].some((id) => { const el = $(id); return !!el && !el.classList.contains("hidden"); });
}

// the Edit edge / Fillet panels live on the Part tab: showing one brings that tab forward
export function showPartTabFor(panel) {
  const host = $("srcShape");
  if (!host || !panel || panel.classList.contains("hidden") || !host.contains(panel)) return;
  if (host.dataset.insp && host.dataset.insp !== "part") setInspectorTab("part");
}
