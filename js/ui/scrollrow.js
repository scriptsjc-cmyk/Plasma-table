// Horizontal sliding toolbars: wheel / shift-wheel / trackpad map to sideways scroll,
// a little momentum after a wheel flick, and fade hints when more tools sit off-screen.
const rows = new Set();

function overflowX(el) { return el.scrollWidth - el.clientWidth > 2; }
function updateFades(wrap, row) {
  if (!wrap || !row) return;
  const max = row.scrollWidth - row.clientWidth;
  const more = max > 2;
  wrap.classList.toggle("has-overflow", more);
  wrap.classList.toggle("fade-start", more && row.scrollLeft > 2);
  wrap.classList.toggle("fade-end", more && row.scrollLeft < max - 2);
  let btn = wrap.querySelector(".scrollrow-more");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scrollrow-more";
    btn.setAttribute("aria-label", "More tools");
    btn.title = "More tools";
    btn.textContent = "›";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      row.scrollBy({ left: Math.max(160, row.clientWidth * 0.75), behavior: "smooth" });
    });
    wrap.appendChild(btn);
  }
  const show = more && row.scrollLeft < max - 2;
  btn.hidden = !show;
  btn.setAttribute("aria-hidden", show ? "false" : "true");
}

function ensureWrap(row) {
  let wrap = row.parentElement;
  if (!wrap || !wrap.classList.contains("scrollrow-wrap")) {
    wrap = document.createElement("div");
    wrap.className = "scrollrow-wrap";
    row.replaceWith(wrap);
    wrap.appendChild(row);
    const start = document.createElement("span"); start.className = "scrollrow-fade start"; start.setAttribute("aria-hidden", "true");
    const end = document.createElement("span"); end.className = "scrollrow-fade end"; end.setAttribute("aria-hidden", "true");
    wrap.appendChild(start); wrap.appendChild(end);
  }
  row.classList.add("scrollrow");
  return wrap;
}

function onWheel(row, e) {
  if (!overflowX(row)) return;
  const dx = e.deltaX, dy = e.deltaY;
  const horiz = Math.abs(dx) > Math.abs(dy) || e.shiftKey;
  const delta = horiz ? (e.shiftKey && !dx ? dy : dx || dy) : dy;
  if (!delta) return;
  e.preventDefault();
  row.scrollLeft += delta;
  // a short coast after a flick (trackpads already have their own momentum)
  if (e.deltaMode === 1 || Math.abs(delta) > 40) {
    const t0 = performance.now();
    let v = delta * 0.18;
    const step = (t) => {
      const dt = Math.min(32, t - (step._t || t)); step._t = t;
      v *= Math.pow(0.9, dt / 16);
      if (Math.abs(v) < 0.3 || t - t0 > 400) return;
      row.scrollLeft += v;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

export function mountScrollRow(row) {
  if (!row) return;
  const wrap = ensureWrap(row);
  if (!row.dataset.scrollrowBound) {
    row.dataset.scrollrowBound = "1";
    row.addEventListener("scroll", () => updateFades(wrap, row), { passive: true });
    row.addEventListener("wheel", (e) => onWheel(row, e), { passive: false });
    window.addEventListener("resize", () => updateFades(wrap, row), { passive: true });
  }
  rows.add(row);
  updateFades(wrap, row);
}

export function refreshScrollRows() {
  for (const row of rows) {
    const wrap = row.parentElement;
    if (wrap && wrap.classList.contains("scrollrow-wrap")) updateFades(wrap, row);
  }
}

export function bindScrollRows() {
  mountScrollRow(document.getElementById("quickBar"));
}
