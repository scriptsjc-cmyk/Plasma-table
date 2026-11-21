// r15 4.x-extra (Josh 21 Nov): a pop-up opened from somewhere that is hidden at this screen size (the ☰ menu presses the
// header's Export DXF / SVG button, which a laptop hides to keep the header on one row; Download G-code on a step whose export
// row is hidden) would open inside that hidden box and show nothing. If it is not visible once opened, it floats under the
// header instead (moved to <body>, same element and ids), and goes back to its own place when it closes.
export function showPop(pop) {
  if (!pop) return;
  pop.classList.remove("hidden"); pop.hidden = false;
  if (pop.getClientRects().length > 0) return;
  if (!pop._home) { pop._home = pop.parentNode; pop._next = pop.nextSibling; }
  document.body.appendChild(pop);
  pop.classList.add("floating");
}
export function hidePop(pop) {
  if (!pop) return;
  pop.classList.add("hidden"); pop.hidden = true;
  if (pop._home) {
    try { pop._home.insertBefore(pop, pop._next && pop._next.parentNode === pop._home ? pop._next : null); } catch (e) { pop._home.appendChild(pop); }
    pop._home = null; pop._next = null;
  }
  pop.classList.remove("floating");
}
