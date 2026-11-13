// r8 item 9: short hover tips on icon-only buttons and technical settings, after a delay, also on keyboard focus.
const SELECTOR = [
  "#qbPinned button",
  "#toolBar button",
  "#proTools button",
  "#btnSimpleSnap",
  "#btnDragPan",
  "#btnMakeCheckCut",
  "#btnLayout",
  "#btnFit",
  "#btnGrid",
  "[data-tip]",
  ".iconbtn",
  "label:has(#ovDelay)",
  "label:has(#ovKerf)",
  "label:has(#ovLead)",
  "label:has(#ovPierce)",
  "label:has(#ovCut)",
  "label:has(#skSnap)",
  "#snapRow button",
  ".sktools button",
].join(",");

const DELAY = 450;
let timer = 0, tip, current = null;

function textOf(el) {
  if (el.hasAttribute("data-tip")) return el.getAttribute("data-tip");
  const title = el.getAttribute("title") || el.getAttribute("aria-label") || "";
  const label = (el.textContent || "").replace(/\s+/g, " ").trim();
  // Don't tip obvious labelled buttons (more than a couple of letters, and no title that adds meaning).
  const isIcon = el.closest("#qbPinned, #toolBar, .sktools") || el.classList.contains("iconbtn") || el.hasAttribute("data-tip");
  const isTech = /pierce|kerf|lead-?in|cut height|snap|constraint|layout|fit|delay|amps|status/i.test(title + " " + (el.htmlFor || "") + " " + el.id);
  if (!isIcon && !isTech && label.length >= 3 && title && title.toLowerCase() === label.toLowerCase()) return "";
  if (!isIcon && !isTech && label.length >= 3 && !title) return "";
  return title || (isIcon ? label : "");
}

function place(el, text) {
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "hoverTip";
    tip.className = "hovertip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  tip.textContent = text;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.bottom + 8;
  if (y + th > window.innerHeight - 8) y = r.top - th - 8;
  if (x < 8) x = 8;
  if (x + tw > window.innerWidth - 8) x = window.innerWidth - 8 - tw;
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}

function hide() {
  clearTimeout(timer); timer = 0; current = null;
  if (tip) tip.hidden = true;
}

function schedule(el) {
  const text = textOf(el);
  if (!text) { hide(); return; }
  if (current === el && tip && !tip.hidden) { place(el, text); return; }
  clearTimeout(timer);
  current = el;
  timer = setTimeout(() => { if (current === el) place(el, text); }, DELAY);
}

export function bindHoverTips() {
  document.addEventListener("pointerover", (e) => {
    const el = e.target && e.target.closest && e.target.closest(SELECTOR);
    if (!el) return;
    schedule(el);
  });
  document.addEventListener("pointerout", (e) => {
    const el = e.target && e.target.closest && e.target.closest(SELECTOR);
    if (!el) return;
    const to = e.relatedTarget;
    if (to && el.contains(to)) return;
    hide();
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target && e.target.closest && e.target.closest(SELECTOR);
    if (el) schedule(el);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
}
