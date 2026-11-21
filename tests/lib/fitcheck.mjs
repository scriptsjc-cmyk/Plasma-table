// The page-side fit checkers for laptop screens (moved here unchanged from e2e 96_fits_screen so other suites can use them).
// Each runs inside the page (page.evaluate) and returns a list of problems; [] means the screen fits.
// r13 extra checks sit on top of the r12 checker. Existing clip / overlap /
// scroll / off-screen tests are unchanged; sideways clipping, card overflow,
// sibling card/text overlap, ellipsis without a title, toast/STOP coverage,
// STOP position, and preset-grid fill are added.
export const fitProblems = () => {
  const out = [];
  const exempt = el => el.closest("#howtoDlg, #settingsDlg");
  const shown = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const isBox = (el, s, r) => s.display !== "contents" && r.width > 0 && r.height > 0;
  const label = el => (el.id || (el.textContent || "").trim().slice(0, 30) || el.className || el.tagName).toString().slice(0, 40);
  const onCanvas = el => !!(el.closest && el.closest("#preview, #previewPane, .previewPane, .previewDock, #sketch, .cvwrap, .canvas-wrap, .bedwrap"));
  const isFlyout = el => !!(el.closest && el.closest("#toast, .toast, .popover, .tip, .hovertip, .info-pop, .info-tip, [role=tooltip], #connMenu, #topMenu, .menu-pop, .qb-pop, #qbMorePop, .speed, details.speed, details.sheetsize"));
  const panelOf = el => el.closest && el.closest(".card, .panel, [id$=Card], .mat-col, .sheet-col, .part-col, .setup-col, .torch-col, #srcShape, .insp, .inspector");
  const isLog = el => el.id === "log" && !!el.closest("#setupView");
  const modal = [...document.querySelectorAll("[role=dialog], dialog, .shapelib, .presetbrowser, .acctdlg, .numpad, .impdlg")].find((el) => {
    if (el.id === "howtoDlg" || el.id === "settingsDlg") return false;
    if (el.classList.contains("hidden")) return false;
    if (el.tagName === "DIALOG" && !el.open && !el.hasAttribute("open")) return false;
    return shown(el);
  });
  const scope = modal
    ? (el) => el === modal || modal.contains(el) || el.id === "btnStop" || (el.closest && el.closest("#btnStop"))
    : () => true;
  if (!modal && document.scrollingElement.scrollHeight > innerHeight + 1) out.push("page scrolls");
  if (modal) {
    const r = modal.getBoundingClientRect();
    if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1 || r.left < -1) out.push("dialog off-screen: " + (modal.id || "dialog"));
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || exempt(el) || !scope(el)) continue;
    const s = getComputedStyle(el);
    // r15: the controller console log is the one box that may scroll; it has its own stricter check below instead
    if (/(auto|scroll)/.test(s.overflowY) && !isLog(el) && isBox(el, s, el.getBoundingClientRect()) && el.scrollHeight > el.clientHeight + 2) out.push("scrolls: " + (el.id || el.className));
    if (/^(BUTTON|INPUT|SELECT|A)$/.test(el.tagName)) {
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1) out.push("off-screen: " + (el.id || el.textContent.trim().slice(0, 30)));
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        const pr = p.getBoundingClientRect();
        if (!isBox(p, ps, pr)) continue;
        if (ps.overflow !== "visible") {
          if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) { out.push("clipped: " + (el.id || el.textContent.trim().slice(0, 30))); break; }
        }
        // r13: sideways clip — only when the ancestor actually clips the x axis
        const ox = ps.overflowX;
        if (ox && ox !== "visible") {
          if (r.left < pr.left - 1 || r.right > pr.right + 1) { out.push("clipped-side: " + (el.id || el.textContent.trim().slice(0, 30))); break; }
        }
      }
      // r13: control sticks out of its nearest card / panel (popovers and canvas chips are allowed)
      if (!isFlyout(el) && !onCanvas(el)) {
        const card = panelOf(el);
        if (card && shown(card) && !isFlyout(card)) {
          const cr = card.getBoundingClientRect();
          if (r.left < cr.left - 1 || r.right > cr.right + 1 || r.top < cr.top - 1 || r.bottom > cr.bottom + 1) {
            out.push("outside-card: " + (el.id || el.textContent.trim().slice(0, 30)));
          }
        }
      }
    }
  }
  // r15: the controller log (#setupView #log) may scroll, but only on these terms: its newest line is fully in view
  // (it follows new lines to the bottom), it never clips sideways, and it covers nothing outside itself.
  const lg = document.querySelector("#setupView #log");
  if (lg && shown(lg) && !exempt(lg) && scope(lg)) {
    const r = lg.getBoundingClientRect(), top = r.top + lg.clientTop, bottom = top + lg.clientHeight;
    const last = [...lg.children].reverse().find(shown);
    if (last) {
      const lr = last.getBoundingClientRect();
      if (lr.top < top - 1 || lr.bottom > bottom + 1) out.push("log: newest line not fully in view (" + (last.textContent || "").trim().slice(0, 30) + ")");
    }
    if (lg.scrollWidth > lg.clientWidth + 2 && getComputedStyle(lg).overflowX !== "visible") out.push("log: lines cut off sideways");
    if (r.bottom > innerHeight + 1) out.push("log: runs off the bottom of the screen");
    for (const o of document.querySelectorAll("body *")) {
      if (lg.contains(o) || o.contains(lg) || !shown(o) || exempt(o)) continue;
      const own = /^(BUTTON|INPUT|SELECT|TEXTAREA|A|LABEL)$/.test(o.tagName) || [...o.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const b = o.getBoundingClientRect();
      const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left), oy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (ox > 4 && oy > 4) out.push("log covers: " + label(o));
    }
  }
  const ctl = [...document.querySelectorAll("button, input, select")].filter(e => shown(e) && !exempt(e) && scope(e) && !e.closest("dialog:not([open])"));
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    if (ctl[i].contains(ctl[j]) || ctl[j].contains(ctl[i])) continue;
    const a = ctl[i].getBoundingClientRect(), b = ctl[j].getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 4 && oy > 4) out.push("overlap: " + (ctl[i].id || ctl[i].textContent.trim().slice(0, 20)) + " / " + (ctl[j].id || ctl[j].textContent.trim().slice(0, 20)));
  }
  if (modal) {
    const stop = document.getElementById("btnStop");
    if (stop && shown(stop)) {
      const a = modal.getBoundingClientRect(), b = stop.getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) out.push("dialog covers STOP");
    }
  }

  // r13: overlapping cards and text (siblings in the same panel). Canvas chips,
  // popovers, tooltips and toasts are exempt. Controls already have their own overlap check.
  const overlapExempt = el => onCanvas(el) || isFlyout(el) || exempt(el) || el.id === "btnStop" || !!(el.closest && el.closest("svg"));
  for (const parent of document.querySelectorAll("body *")) {
    if (!shown(parent) || exempt(parent) || !scope(parent) || isFlyout(parent) || onCanvas(parent)) continue;
    if (!panelOf(parent) && !parent.matches(".card, .panel, [id$=Card], .mat-col, .sheet-col, .part-col, .setup-col, .torch-col, #srcShape, .insp, .inspector, .stepPane, .cut-col")) continue;
    const kids = [...parent.children].filter(el => shown(el) && scope(el) && !overlapExempt(el) && !el.matches("script, style, br, svg, path, use"));
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      if (kids[i].contains(kids[j]) || kids[j].contains(kids[i])) continue;
      // The "i" tip is meant to sit on its label inside .has-info; that is not a layout bug.
      const infoPair = (a, b) => (a.matches && a.matches(".info-i, .info-i *") && (b.closest && (b.closest(".has-info, .info-label") || a.closest && a.closest(".has-info"))))
        || (b.matches && b.matches(".info-i, .info-i *") && (a.closest && (a.closest(".has-info, .info-label") || b.closest && b.closest(".has-info"))));
      if (infoPair(kids[i], kids[j])) continue;
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) out.push("overlap-box: " + label(kids[i]) + " / " + label(kids[j]));
    }
  }

  // r13: ellipsis without a title tooltip
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || exempt(el) || !scope(el) || isFlyout(el)) continue;
    const s = getComputedStyle(el);
    if (s.textOverflow !== "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 1 && !el.getAttribute("title")) {
      out.push("ellipsis: " + label(el));
    }
  }

  // r13: toasts (and popovers) must not cover the header, step tabs, or STOP
  const zones = [
    ["header", document.querySelector(".topbar, header, #topbar, .header")],
    ["tabs", document.querySelector("body[data-screen=cut] .tabs, #cutView .tabs")],
    ["STOP", document.getElementById("btnStop")],
  ];
  const covers = (el, zone) => {
    if (!el || !zone || !shown(el) || !shown(zone)) return false;
    const a = el.getBoundingClientRect(), b = zone.getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return ox > 4 && oy > 4;
  };
  for (const el of document.querySelectorAll("#toast, .toast, .popover, [role=tooltip], .hovertip, .info-pop")) {
    if (!shown(el) || exempt(el) || el.closest("#howtoDlg, #settingsDlg")) continue;
    // Header menus are allowed to open from the header; they still must not cover STOP.
    const fromHeader = !!(el.closest && el.closest(".topbar, header, #topbar, .header, #connWrap, #topMenu"));
    for (const [name, zone] of zones) {
      if (!zone) continue;
      if (fromHeader && name !== "STOP") continue;
      if (covers(el, zone)) out.push((el.id === "toast" || el.classList.contains("toast") ? "toast" : "popover") + " covers " + name);
    }
  }

  // r13: preset page 1 must fill at least 80% of the grid
  const grid = document.getElementById("pbGrid");
  const browser = document.getElementById("presetBrowser");
  if (grid && browser && shown(grid) && shown(browser) && !browser.classList.contains("hidden")) {
    const g = grid.getBoundingClientRect();
    const area = Math.max(1, g.width * g.height);
    let used = 0;
    for (const card of grid.children) {
      if (!shown(card)) continue;
      const r = card.getBoundingClientRect();
      used += Math.max(0, r.width) * Math.max(0, r.height);
    }
    if (used / area < 0.8) out.push("preset-grid-sparse: " + Math.round(100 * used / area) + "%");
  }

  return [...new Set(out)];
};

// r13 done-when ("nothing overlaps or cuts off"): checks the r12/r13 box checker could not see —
// text drawn on top of other text (page text, a lamp dot on its label, and canvas labels),
// button text cut off inside its button, and empty panels (a bordered box or bar with nothing in it).
// Canvas labels are recorded by wrapping fillText in the test page only; the app is not changed.
export const installLabelRecorder = () => {
  const P = CanvasRenderingContext2D.prototype;
  if (P.__r13rec) return;
  const fill = P.fillText, clear = P.clearRect, rect = P.fillRect;
  window.__r13labels = new Map();
  const reset = function (x, y, w, h) {
    const cv = this.canvas;
    if (cv && w * h >= cv.width * cv.height * 0.9) window.__r13labels.set(cv, []);
  };
  P.clearRect = function (x, y, w, h) { const m = this.getTransform(); reset.call(this, x, y, w * m.a, h * m.d); return clear.apply(this, arguments); };
  P.fillRect = function (x, y, w, h) { const m = this.getTransform(); reset.call(this, x, y, w * m.a, h * m.d); return rect.apply(this, arguments); };
  P.fillText = function (text, x, y, maxW) {
    const r = fill.apply(this, arguments);
    try {
      const s = String(text);
      if (s.trim() && this.canvas) {
        const mt = this.measureText(s), m = this.getTransform(), k = window.devicePixelRatio || 1;
        let l = x - mt.actualBoundingBoxLeft, rr = x + mt.actualBoundingBoxRight;
        if (maxW != null && rr - l > maxW) rr = l + maxW;
        const t = y - mt.actualBoundingBoxAscent, b = y + mt.actualBoundingBoxDescent;
        const px = (u, v) => [(m.a * u + m.c * v + m.e) / k, (m.b * u + m.d * v + m.f) / k];
        const [x1, y1] = px(l, t), [x2, y2] = px(rr, b);
        const list = window.__r13labels.get(this.canvas) || [];
        list.push({ s, l: Math.min(x1, x2), r: Math.max(x1, x2), t: Math.min(y1, y2), b: Math.max(y1, y2) });
        window.__r13labels.set(this.canvas, list);
      }
    } catch (e) {}
    return r;
  };
  P.__r13rec = true;
};

export const redrawCanvases = () => {
  const T = window.plasmaTest;
  try { T.refresh && T.refresh(); } catch (e) {}
  try { T.drawPreview && T.drawPreview(); } catch (e) {}
  try { T.sketch && T.sketch.draw && T.sketch.draw(); } catch (e) {}
};

export const textProblems = () => {
  const out = [];
  const shown = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0; };
  const label = el => (el.id || (el.textContent || "").trim().slice(0, 30) || el.className || el.tagName).toString().slice(0, 40);
  const skip = el => !!(el.closest && el.closest("#howtoDlg, #settingsDlg, #toast, .toast, .popover, .tip, .hovertip, .info-pop, .info-tip, [role=tooltip], #connMenu, #topMenu, .menu-pop, .qb-pop, #qbMorePop, .info-body, .sr-only, .visually-hidden, [aria-hidden=true]"));
  const modal = [...document.querySelectorAll("[role=dialog], dialog, .shapelib, .presetbrowser, .acctdlg, .numpad, .impdlg")].find((el) =>
    el.id !== "howtoDlg" && el.id !== "settingsDlg" && !el.classList.contains("hidden") && !(el.tagName === "DIALOG" && !el.open && !el.hasAttribute("open")) && shown(el));
  const inScope = el => !modal || modal.contains(el);
  // screen-reader-only text (clip: rect(0 0 0 0), 1 px boxes) is not drawn
  const srOnly = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e);
    if (/rect\(0px,? 0px,? 0px,? 0px\)/.test(s.clip) || s.clipPath === "inset(50%)" || (s.position === "absolute" && parseFloat(s.width) <= 1 && parseFloat(s.height) <= 1)) return true; } return false; };
  // the part of a text box that is actually painted: cut by every ancestor that clips (overflow not visible),
  // and trimmed to the line height (a big font's glyph box is taller than its line)
  const clipCache = new Map();
  const clipOf = (el) => {
    if (clipCache.has(el)) return clipCache.get(el);
    let c = { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 };
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const r = e.getBoundingClientRect();
        c = { left: Math.max(c.left, s.overflowX !== "visible" ? r.left : -1e6), right: Math.min(c.right, s.overflowX !== "visible" ? r.right : 1e6),
          top: Math.max(c.top, s.overflowY !== "visible" ? r.top : -1e6), bottom: Math.min(c.bottom, s.overflowY !== "visible" ? r.bottom : 1e6) };
      }
    }
    clipCache.set(el, c);
    return c;
  };
  const painted = (el, r) => {
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    let t = r.top, b = r.bottom;
    if (lh > 0 && b - t > lh) { const m = (t + b) / 2; t = m - lh / 2; b = m + lh / 2; }
    const c = clipOf(el);
    const q = { left: Math.max(r.left, c.left), right: Math.min(r.right, c.right), top: Math.max(t, c.top), bottom: Math.min(b, c.bottom) };
    q.width = q.right - q.left; q.height = q.bottom - q.top;
    return q;
  };
  const hit = (a, b, m = 2) => Math.min(a.right ?? a.r, b.right ?? b.r) - Math.max(a.left ?? a.l, b.left ?? b.l) > m
    && Math.min(a.bottom ?? a.b, b.bottom ?? b.b) - Math.max(a.top ?? a.t, b.top ?? b.t) > m;
  // what actually paints on top at a point (so text under an opaque card / dialog is not counted)
  const visibleAt = (el, r) => {
    const x = Math.min(innerWidth - 1, Math.max(0, (r.left + r.right) / 2)), y = Math.min(innerHeight - 1, Math.max(0, (r.top + r.bottom) / 2));
    const top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  };

  // 1. page text on page text: every visible text line box vs every other one from a different element
  const lines = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || skip(el) || !inScope(el) || !shown(el) || srOnly(el)) continue;
    const s = getComputedStyle(el);
    if (s.color === "rgba(0, 0, 0, 0)" || s.fontSize === "0px") continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r0 of rg.getClientRects()) {
      const r = painted(el, r0);
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      lines.push({ el, r, txt: n.nodeValue.trim().slice(0, 24) });
    }
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (A.el === B.el) continue;
    // the line box is the font's full height; ask for a real overlap (more than a third of the shorter line)
    const oy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top), ox = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
    if (ox > 3 && oy > Math.min(A.r.height, B.r.height) / 3 && visibleAt(A.el, A.r) && visibleAt(B.el, B.r)) out.push("text-on-text: " + A.txt + " / " + B.txt);
  }

  // 2. an absolutely placed ::before dot / icon sitting on its own element's text
  for (const el of document.querySelectorAll("body *")) {
    if (skip(el) || !inScope(el) || !shown(el) || !el.textContent.trim()) continue;
    const ps = getComputedStyle(el, "::before");
    if (ps.content === "none" || ps.position !== "absolute") continue;
    const w = parseFloat(ps.width), h = parseFloat(ps.height);
    if (!(w > 2 && h > 2)) continue;
    const er = el.getBoundingClientRect(), es = getComputedStyle(el);
    const l = er.left + parseFloat(es.borderLeftWidth) + (parseFloat(ps.left) || 0), t = er.top + parseFloat(es.borderTopWidth) + (parseFloat(ps.top) || 0);
    const dot = { l, t, r: l + w, b: t + h };
    const rg = document.createRange(); rg.selectNodeContents(el);
    if ([...rg.getClientRects()].some((r) => r.width > 1 && hit(dot, r, 1))) out.push("dot-on-text: " + label(el));
  }

  // 3. button text cut off inside its button (wraps past the bottom or runs past the side)
  for (const el of document.querySelectorAll("button, a.btn, .btn")) {
    if (skip(el) || !inScope(el) || !shown(el) || !el.textContent.trim()) continue;
    const s = getComputedStyle(el);
    if (s.overflow === "visible" && s.overflowX === "visible" && s.overflowY === "visible") {
      // overflow visible: compare the painted text boxes with the button box (sr-only and clipped-away text excluded)
      const br = el.getBoundingClientRect();
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let cut = false;
      for (let n = tw.nextNode(); n && !cut; n = tw.nextNode()) {
        const pe = n.parentElement;
        if (!n.nodeValue.trim() || !pe || srOnly(pe) || !shown(pe)) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        cut = [...rg.getClientRects()].map((r) => painted(pe, r)).some((r) => r.width > 1 && r.height > 1 && (r.bottom > br.bottom + 1 || r.top < br.top - 1 || r.right > br.right + 1 || r.left < br.left - 1));
      }
      if (cut) out.push("text-cut: " + label(el));
    } else if (s.textOverflow !== "ellipsis" && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)) {
      out.push("text-cut: " + label(el));
    }
  }

  // 4. empty panels: a card / pane / form box / bar with a border or fill but nothing in it
  const hasContent = (el) => {
    for (const d of el.querySelectorAll("canvas, img, svg, input, select, textarea, button, video, iframe")) if (shown(d)) return true;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.trim() && n.parentElement && shown(n.parentElement)) return true;
    return false;
  };
  for (const el of document.querySelectorAll(".card, .panel, .setup-pane, .shapeform, [id$=Card], .stepPane > .step > .nav, .empty-state")) {
    if (skip(el) || !inScope(el) || !shown(el) || el.closest(".hidden")) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const drawn = ["Top", "Right", "Bottom", "Left"].some((k) => parseFloat(s["border" + k + "Width"]) > 0 && s["border" + k + "Style"] !== "none") || s.backgroundColor !== "rgba(0, 0, 0, 0)" || el.matches(".setup-pane");
    if (drawn && r.width > 8 && !hasContent(el)) out.push("empty-panel: " + label(el));
  }

  // 5. canvas labels drawn over each other (same canvas, latest frame)
  if (window.__r13labels) {
    for (const [cv, list] of window.__r13labels) {
      if (!cv.isConnected || !shown(cv) || skip(cv) || !inScope(cv)) continue;
      const seen = new Set(), L = list.filter((a) => { const k = a.s + "|" + Math.round(a.l) + "|" + Math.round(a.t); if (seen.has(k)) return false; seen.add(k); return true; });
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        if (L[i].s === L[j].s) continue;
        if (hit(L[i], L[j], 2)) out.push("canvas-label-overlap (" + (cv.id || "canvas") + "): " + L[i].s.slice(0, 28) + " / " + L[j].s.slice(0, 28));
      }
    }
  }
  return [...new Set(out)];
};

export const getStopRect = () => {
  const el = document.getElementById("btnStop");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  if (r.width <= 0 || r.height <= 0 || s.visibility === "hidden" || s.display === "none" || el.hidden) return null;
  return { l: Math.round(r.left * 10) / 10, t: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
};

// r15 Round 7.2: what the r12/r13 checkers could not see (found by eye at 1366 x 640 after r13):
//  - text drawn on text by only a few pixels (the Check-the-cut chip on "Choose the part"): compares the glyph boxes
//    (the font size, not the taller line box), so a 3 px overlap counts;
//  - the header running over the panels below it (header row 2 taller than the bar it sits in);
//  - any text cut off by a box that clips it (a sentence under Next, a dialog's last line), not just button text;
//  - text or a control covered by something else on top (a pop-up over a card); the drawing canvas may be covered;
//  - a toast over any control, and safety text (#safetyHint, #runHelp, run warnings) clipped or shortened with "…".
export const r15Problems = () => {
  const out = [];
  const shown = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0; };
  const label = (el) => (el.id || (el.textContent || "").trim().slice(0, 30) || el.className || el.tagName).toString().slice(0, 40);
  const exempt = (el) => !!(el.closest && el.closest("#howtoDlg, #settingsDlg, .sr-only, .visually-hidden, [aria-hidden=true], .info-body"));
  const flyout = "#toast, .toast, .popover, .tip, .hovertip, .info-pop, .info-tip, [role=tooltip], #connMenu, #topMenu, .menu-pop, .qb-pop, #qbMorePop, #cutStatusPop";
  const isFly = (el) => !!(el.closest && el.closest(flyout));
  const canvasArea = (el) => !!(el.closest && el.closest("canvas, #preview, #sketch, .cvwrap, .canvas-wrap, .bedwrap, .canvas-chip, svg"));
  const modal = [...document.querySelectorAll("[role=dialog], dialog, .shapelib, .presetbrowser, .acctdlg, .numpad, .impdlg")].find((el) =>
    el.id !== "howtoDlg" && el.id !== "settingsDlg" && !el.classList.contains("hidden") && !(el.tagName === "DIALOG" && !el.open && !el.hasAttribute("open")) && shown(el));
  const inScope = (el) => !modal || modal.contains(el);
  const srOnly = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e);
    if (/rect\(0px,? 0px,? 0px,? 0px\)/.test(s.clip) || s.clipPath === "inset(50%)" || (s.position === "absolute" && parseFloat(s.width) <= 1 && parseFloat(s.height) <= 1)) return true; } return false; };
  const ov = (a, b) => [Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)];
  // the nearest ancestor that clips (overflow not visible), and whether it is a scroll box (reported by fitProblems already)
  // (display:contents boxes clip nothing; a box collapsed to nothing is hiding its content on purpose)
  const clipper = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e);
    if (s.display === "contents") continue;
    if (s.overflowX !== "visible" || s.overflowY !== "visible") { const r = e.getBoundingClientRect();
      return { e, r, scroll: /(auto|scroll)/.test(s.overflowY + s.overflowX), collapsed: r.width < 1 || r.height < 1 }; } } return null; };
  const cut = (a, c) => ({ left: Math.max(a.left, c.left), right: Math.min(a.right, c.right), top: Math.max(a.top, c.top), bottom: Math.min(a.bottom, c.bottom) });

  // text lines: glyph box = font size tall, centred in the line box
  const lines = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || exempt(el) || !inScope(el) || !shown(el) || srOnly(el) || el.closest("script, style, option")) continue;
    const s = getComputedStyle(el), fs = parseFloat(s.fontSize);
    if (s.color === "rgba(0, 0, 0, 0)" || !(fs > 0)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      const m = (r.top + r.bottom) / 2, g = { left: r.left, right: r.right, top: m - fs * 0.5, bottom: m + fs * 0.5 };
      // what is actually painted: the glyph box cut to every box that clips it (a "…" label is only as wide as its box)
      const c = clipper(el); let vis = g;
      for (let k = c; k; k = clipper(k.e.parentElement)) vis = cut(vis, k.r);
      lines.push({ el, r, g, c, vis, shows: vis.right - vis.left > 1 && vis.bottom - vis.top > 1, fly: isFly(el), txt: n.nodeValue.trim().slice(0, 24) });
    }
  }
  const topAt = (x, y) => (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) ? document.elementFromPoint(x, y) : null;
  const mine = (el, hit) => !!hit && (hit === el || el.contains(hit) || hit.contains(el));

  // 1. text on text (glyph boxes), both actually painted there
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el) || A.fly || B.fly || !A.shows || !B.shows) continue;
    const [ox, oy] = ov(A.vis, B.vis);
    if (ox > 2 && oy > 2) {
      const x = (Math.max(A.vis.left, B.vis.left) + Math.min(A.vis.right, B.vis.right)) / 2, y = (Math.max(A.vis.top, B.vis.top) + Math.min(A.vis.bottom, B.vis.bottom)) / 2;
      const hit = topAt(x, y);
      if (hit && (mine(A.el, hit) || mine(B.el, hit))) out.push("text-on-text: " + A.txt + " / " + B.txt);
    }
  }
  // 2. text cut off by a box that clips it (scroll boxes are reported by fitProblems; "…" with a title is allowed)
  const perBox = new Map();   // a box that cuts off many lines (a log) is named twice, then counted
  for (const L of lines) {
    if (L.fly) continue;
    const c = L.c;
    if (!c || c.scroll || c.collapsed) continue;
    const s = getComputedStyle(c.e);
    if (s.textOverflow === "ellipsis" && (c.e.getAttribute("title") || c.e.closest("[title]"))) continue;
    const cr = c.r;
    if (L.g.bottom > cr.bottom + 2 || L.g.top < cr.top - 2 || L.r.right > cr.right + 2 || L.r.left < cr.left - 2) {
      const k = (perBox.get(c.e) || 0) + 1; perBox.set(c.e, k);
      if (k === 3) { out.push("text-clipped: more lines cut off by " + label(c.e)); continue; }
      if (k > 3) continue;
      out.push("text-clipped: " + L.txt + " (by " + label(c.e) + " " + [cr.left, cr.top, cr.right, cr.bottom].map(Math.round) + " ov " + getComputedStyle(c.e).overflow + "; text " + [L.r.left, L.g.top, L.r.right, L.g.bottom].map(Math.round) + ")");
    }
  }
  // 3. text or a control with something else painted on top of it (a pop-up over a card, a panel over a sentence)
  const coveredBy = (el, r) => {
    for (const [fx, fy] of [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5]]) {
      const hit = topAt(r.left + (r.right - r.left) * fx, r.top + (r.bottom - r.top) * fy);
      if (hit && !mine(el, hit) && !canvasArea(el)) return hit;
    }
    return null;
  };
  for (const L of lines) {
    if (L.fly || !L.shows || canvasArea(L.el) || L.el.closest("#btnStop")) continue;
    const hit = coveredBy(L.el, L.vis);
    if (hit && hit.id !== "btnStop") out.push("text-covered: " + L.txt + " (by " + label(hit) + ")");
  }
  for (const el of document.querySelectorAll("button, input, select, textarea")) {
    if (!shown(el) || exempt(el) || !inScope(el) || isFly(el) || canvasArea(el) || el.id === "btnStop") continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const hit = coveredBy(el, { left: r.left + 3, right: r.right - 3, top: r.top + 3, bottom: r.bottom - 3 });
    if (hit && hit.id !== "btnStop" && !hit.closest("label")) out.push("control-covered: " + label(el) + " (by " + label(hit) + ")");
  }
  // 4. the header never runs over what is below it: nothing in the header that reaches below the bar may overlap text,
  //    a control or a card outside the header (STOP hanging over empty margin is fine; over a card or its text is not)
  const bar = document.querySelector("header.topbar");
  if (bar && shown(bar)) {
    const b = bar.getBoundingClientRect();
    const below = [];
    for (const L of lines) if (!bar.contains(L.el) && L.shows) below.push([L.vis, L.txt]);
    for (const el of document.querySelectorAll("button, input, select, textarea, .card, section, aside, .panel, [class*=-col], [class*=card]")) {
      if (bar.contains(el) || !shown(el) || isFly(el) || el.contains(bar) || el.matches(".view, .screen")) continue;
      const r = el.getBoundingClientRect();
      if (r.height > innerHeight * 0.95 || r.top < b.bottom - 1) continue;
      below.push([r, label(el)]);
    }
    let n = 0;
    for (const el of bar.querySelectorAll("*")) {
      if (!shown(el) || isFly(el) || srOnly(el) || getComputedStyle(el).position === "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= b.bottom + 1) continue;
      const hit = below.find(([o]) => { const [ox, oy] = ov(r, o); return ox > 1 && oy > 1; });
      if (hit && n++ < 3) out.push("header-overlaps: " + label(el) + " (to y " + Math.round(r.bottom) + ", bar ends " + Math.round(b.bottom) + ") over " + hit[1]);
    }
  }
  // 5. a toast over any control
  const toast = document.getElementById("toast");
  if (toast && shown(toast) && !toast.classList.contains("hidden")) {
    const tr = toast.getBoundingClientRect();
    for (const el of document.querySelectorAll("button, input, select, textarea")) {
      if (!shown(el) || el === toast || toast.contains(el) || !inScope(el)) continue;
      const [ox, oy] = ov(tr, el.getBoundingClientRect());
      if (ox > 2 && oy > 2) { out.push("toast covers control: " + label(el)); break; }
    }
  }
  // 6. safety text: never clipped, never shortened with "…"
  for (const el of document.querySelectorAll("#safetyHint, #runHelp, .runwarn, .safety-note, [data-safety]")) {
    if (!shown(el) || !el.textContent.trim()) continue;
    const s = getComputedStyle(el);
    if (s.textOverflow === "ellipsis" || (s.webkitLineClamp && s.webkitLineClamp !== "none") || el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push("safety-text-cut: " + label(el));
  }
  return [...new Set(out)];
};
