// r12/r13: every laptop screen fits with no page scroll, no scroll boxes, and nothing
// clipped or overlapping — including sideways clips, card overflow, text, toasts and STOP.
// How to use and Settings may scroll. Practice table only.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, ensurePracticeHomed } from "../lib/browser.mjs";
import fs from "node:fs";
import path from "node:path";

const t = new T("96_fits_screen");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);

const OUT = path.join(new URL("../results/shots/", import.meta.url).pathname);
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  ["1280x600", "d1280x600"],
  ["1366x640", "d1366x640"],
  ["1536x730", "d1536x730"],
  ["1440x800", "d1440x800"],
  ["1920x970", "d1920x970"],
];

// r13 extra checks sit on top of the r12 checker. Existing clip / overlap /
// scroll / off-screen tests are unchanged; sideways clipping, card overflow,
// sibling card/text overlap, ellipsis without a title, toast/STOP coverage,
// STOP position, and preset-grid fill are added.
const fitProblems = () => {
  const out = [];
  const exempt = el => el.closest("#howtoDlg, #settingsDlg");
  const shown = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const isBox = (el, s, r) => s.display !== "contents" && r.width > 0 && r.height > 0;
  const label = el => (el.id || (el.textContent || "").trim().slice(0, 30) || el.className || el.tagName).toString().slice(0, 40);
  const onCanvas = el => !!(el.closest && el.closest("#preview, #previewPane, .previewPane, .previewDock, #sketch, .cvwrap, .canvas-wrap, .bedwrap"));
  const isFlyout = el => !!(el.closest && el.closest("#toast, .toast, .popover, .tip, .hovertip, .info-pop, .info-tip, [role=tooltip], #connMenu, #topMenu, .menu-pop, .qb-pop, #qbMorePop, .speed, details.speed, details.sheetsize"));
  const panelOf = el => el.closest && el.closest(".card, .panel, [id$=Card], .mat-col, .sheet-col, .part-col, .setup-col, .torch-col, #srcShape, .insp, .inspector");
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
    if (/(auto|scroll)/.test(s.overflowY) && isBox(el, s, el.getBoundingClientRect()) && el.scrollHeight > el.clientHeight + 2) out.push("scrolls: " + (el.id || el.className));
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
const installLabelRecorder = () => {
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

const redrawCanvases = () => {
  const T = window.plasmaTest;
  try { T.refresh && T.refresh(); } catch (e) {}
  try { T.drawPreview && T.drawPreview(); } catch (e) {}
  try { T.sketch && T.sketch.draw && T.sketch.draw(); } catch (e) {}
};

const textProblems = () => {
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

const getStopRect = () => {
  const el = document.getElementById("btnStop");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  if (r.width <= 0 || r.height <= 0 || s.visibility === "hidden" || s.display === "none" || el.hidden) return null;
  return { l: Math.round(r.left * 10) / 10, t: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
};

async function shot(page, size, state) {
  const pth = path.join(OUT, `${size}-${state}.png`);
  await page.screenshot({ path: pth, fullPage: false }).catch(() => {});
  return pth;
}

async function check(page, size, state, stopSamples) {
  await ev(page, installLabelRecorder);
  await ev(page, redrawCanvases);
  await sleep(250);
  await shot(page, size, state);
  const problems = [...await ev(page, fitProblems), ...await ev(page, textProblems)];
  t.check(`${size} ${state}: fits`, problems.length === 0, JSON.stringify(problems).slice(0, 800));
  if (stopSamples) {
    const rect = await ev(page, getStopRect);
    if (rect) stopSamples.push({ state, ...rect });
  }
  return problems;
}

async function closeDialogs(page) {
  await ev(page, () => {
    const T = window.plasmaTest;
    try { T.closeSettings && T.closeSettings(); } catch (e) {}
    try { T.closeHowto && T.closeHowto(); } catch (e) {}
    for (const id of ["accountDlg", "claimDlg", "migrateDlg", "saveDlg", "conflictDlg", "adminDlg", "announceDlg", "sizeDlg", "straightDlg", "settingsDlg", "howtoDlg", "importDlg", "shapeLib", "presetBrowser", "partsDlg", "makeCheckDlg"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.add("hidden");
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      if (el.hasAttribute("open")) el.removeAttribute("open");
    }
  });
  await sleep(50);
}

async function openDlg(page, how) {
  await ev(page, how);
  await sleep(200);
}

async function ensureSignedIn(page) {
  await ev(page, async () => {
    const A = window.plasmaTest.account;
    if (A.isSignedIn()) {
      if (A.canGrantDemoAdmin && A.canGrantDemoAdmin() && !A.isAdmin()) await A.grantDemoAdmin();
      return;
    }
    try { await A.signUp({ email: "r12fit@example.com", pin: "letmein1", display_name: "Fit", mode: "beginner" }); }
    catch (e) {
      try { await A.signIn({ email: "r12fit@example.com", pin: "letmein1" }); } catch (e2) {}
    }
    try { if (A.canGrantDemoAdmin && A.canGrantDemoAdmin()) await A.grantDemoAdmin(); } catch (e) {}
  });
  await sleep(200);
}

for (const [size, prof] of SIZES) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  const stopSamples = [];

  await ev(page, () => window.plasmaTest.showScreen("menu", { force: true }));
  await check(page, size, "home-menu", stopSamples);

  await ev(page, () => window.plasmaTest.showScreen("login", { force: true }));
  await check(page, size, "sign-in", stopSamples);
  await ev(page, () => window.plasmaTest.showScreen("menu", { force: true }));

  await ev(page, () => {
    const T = window.plasmaTest;
    T.setAppMode && T.setAppMode("beginner", { persist: false, autoFs: false });
    T.showScreen("make", { force: true });
    T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.commit && T.sketch.commit();
  });
  await check(page, size, "make-empty", stopSamples);

  await ev(page, () => {
    const T = window.plasmaTest;
    T.sketch.add("rect", true, { w: 80, h: 50 });
    T.sketch.commit && T.sketch.commit();
    T.sketch.fitView && T.sketch.fitView();
  });
  await check(page, size, "make-part-picked", stopSamples);

  await ev(page, () => {
    const T = window.plasmaTest;
    T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false });
    T.setShapeFs(false);
  });
  await check(page, size, "make-advanced", stopSamples);

  // r13 #12: a shape with many size fields (Plate with holes) still fits the Size tab.
  await ev(page, () => {
    const T = window.plasmaTest;
    T.sketch.clear();
    T.sketch.add("plate", true, {});
    T.sketch.commit && T.sketch.commit();
    T.sketch.fitView && T.sketch.fitView();
    const tab = document.querySelector('#srcShape .insp-tabs [data-insp="size"]');
    if (tab) tab.click();
  });
  await check(page, size, "make-advanced-plate", stopSamples);

  const dialogs = [
    ["preset-parts", ["presetBrowser"], () => { window.plasmaTest.openPresetBrowser(); }],
    ["more-shapes", ["shapeLib"], () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode && T.setAppMode("beginner", { persist: false, autoFs: false }); const b = document.getElementById("bgMore"); if (b) b.click(); else if (document.getElementById("shapeLib")) { const d = document.getElementById("shapeLib"); d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["save-part", ["saveDlg"], () => { try { window.plasmaTest.saveCurrent && window.plasmaTest.saveCurrent(); } catch (e) {} const d = document.getElementById("saveDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["account", ["accountDlg"], () => { try { window.plasmaTest.openAccount(); } catch (e) {} }],
    ["claim-machine", ["claimDlg"], () => { try { window.plasmaTest.openClaim(); } catch (e) {} }],
    ["import-dxf", ["importDlg"], () => { try { window.plasmaTest.openImport(); } catch (e) {} }],
    ["size", ["sizeDlg"], () => { const d = document.getElementById("sizeDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["straight-cut", ["straightDlg"], () => { const d = document.getElementById("straightDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["conflict", ["conflictDlg"], () => { const d = document.getElementById("conflictDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["migrate", ["migrateDlg"], () => { const d = document.getElementById("migrateDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["announcements", ["announceDlg"], () => { const d = document.getElementById("announceDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["admin", ["adminDlg"], () => { try { window.plasmaTest.openAdmin(); } catch (e) {} const d = document.getElementById("adminDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
  ];
  for (const [name, ids, fn] of dialogs) {
    await closeDialogs(page);
    await ev(page, () => window.plasmaTest.showScreen("menu", { force: true }));
    if (["claim-machine", "import-dxf", "admin"].includes(name)) await ensureSignedIn(page);
    await openDlg(page, fn);
    const opened = await ev(page, (ids) => ids.some((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return !el.classList.contains("hidden") && s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    }), ids);
    t.check(`${size} dlg-${name}: dialog opened`, opened, ids.join(","));
    await check(page, size, `dlg-${name}`);
  }
  await closeDialogs(page);

  // Cut step 1 Part, unconnected
  await ev(page, () => {
    const T = window.plasmaTest;
    T.setAppMode && T.setAppMode("beginner", { persist: false, autoFs: false });
    T.showScreen("make", { force: true });
    T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.add("rect", true, { w: 80, h: 50 });
    T.sketch.commit && T.sketch.commit();
    T.sendToCutting();
    T.goStep(1);
  });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut", null, { timeout: 10000 });
  await check(page, size, "cut-part-unconnected", stopSamples);

  await ev(page, () => window.plasmaTest.goStep(3));
  await page.waitForFunction(() => window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await check(page, size, "cut-setup-unconnected", stopSamples);

  // Practice connect — never #btnConnect
  await ev(page, () => document.getElementById("btnDemo").click());
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 }).catch(() => {});
  await sleep(400);
  await check(page, size, "cut-setup-connected", stopSamples);

  try { await ensurePracticeHomed(page, { timeout: 20000 }); } catch (e) { /* still check the screen */ }
  await ev(page, () => window.plasmaTest.goStep(3));
  await sleep(400);
  await check(page, size, "cut-setup-homed", stopSamples);

  await ev(page, () => { const b = document.getElementById("btnZero"); if (b) b.click(); });
  await sleep(400);
  await check(page, size, "cut-setup-corner-set", stopSamples);

  // Start a practice cut if Start is available; then stop it.
  const started = await ev(page, () => {
    const b = document.getElementById("btnStart");
    if (b && !b.disabled && b.getAttribute("aria-disabled") !== "true") { b.click(); return true; }
    return false;
  });
  if (started) {
    await page.waitForFunction(() => window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 8000 }).catch(() => {});
    await ev(page, () => window.plasmaTest.goStep(4));
    await sleep(400);
    await check(page, size, "cut-running", stopSamples);
    await ev(page, () => { const s = document.getElementById("btnStop"); if (s) s.click(); });
    await sleep(600);
    await check(page, size, "cut-stopped", stopSamples);
    // r13: Unlock (alarm / E-stop banner) is well clear of STOP — at least 300 px away, so one can't be hit for the other.
    const gap = await ev(page, () => {
      const st = document.getElementById("btnStop").getBoundingClientRect();
      return ["btnUnlock", "btnUnlock2"].map((id) => document.getElementById(id)).filter((b) => b && b.getBoundingClientRect().width > 0)
        .map((b) => { const r = b.getBoundingClientRect(); const dx = Math.max(0, st.left - r.right, r.left - st.right), dy = Math.max(0, st.top - r.bottom, r.top - st.bottom); return { id: b.id, d: Math.round(Math.hypot(dx, dy)) }; });
    });
    t.check(`${size} cut-stopped: Unlock is clear of STOP`, gap.length > 0 && gap.every((g) => g.d >= 300), JSON.stringify(gap));
  } else {
    await ev(page, () => window.plasmaTest.goStep(4));
    await sleep(300);
    await check(page, size, "cut-step3-idle", stopSamples);
  }

  // Machine setup tab — leave any running job / E-stop from the cut so the edges page is the thing under test.
  await ev(page, () => {
    const T = window.plasmaTest;
    try { T.estopReset && T.estopReset(); } catch (e) {}
    const unlock = document.getElementById("btnUnlock");
    if (unlock) unlock.click();
    T.showScreen("cut", { force: true });
    const tab = document.querySelector('.tab[data-tab="setup"], #btnBarSetup');
    if (tab) tab.click();
  });
  await sleep(400);
  await check(page, size, "machine-setup", stopSamples);
  // r13: every Machine setup tab (the panel must not be empty, nothing on top of anything)
  for (const tab of ["edges", "motors", "torch", "controller"]) {
    await ev(page, (tab) => { const b = document.querySelector(`#setupView [data-setup-tab="${tab}"]`); if (b) b.click(); }, tab);
    await sleep(300);
    await check(page, size, "machine-setup-" + tab, stopSamples);
  }
  // Signed out (not an admin), the Controller tab explains itself instead of showing an empty panel.
  await ev(page, async () => { try { await window.plasmaTest.account.signOut(); } catch (e) {} window.plasmaTest.refresh(); });
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("cut", { force: true }); const tab = document.querySelector('.tab[data-tab="setup"], #btnBarSetup'); if (tab) tab.click(); });
  await sleep(300);
  await ev(page, () => { const b = document.querySelector('#setupView [data-setup-tab="controller"]'); if (b) b.click(); });
  await sleep(300);
  const notAdmin = await ev(page, () => {
    const pane = document.querySelector('#setupView .setup-pane[data-setup-pane="controller"]');
    const r = pane && pane.getBoundingClientRect();
    return { admin: document.body.classList.contains("is-admin"), pane: !!(r && r.width > 0 && r.height > 0), text: pane ? pane.innerText.trim().slice(0, 60) : "" };
  });
  t.check(`${size} machine-setup-controller-not-admin: panel says why it is empty`, !notAdmin.admin && notAdmin.pane && notAdmin.text.length > 10, JSON.stringify(notAdmin));
  await check(page, size, "machine-setup-controller-not-admin", stopSamples);

  // r13: STOP stays the same size and place on every screen where it is shown (within 2 px).
  if (stopSamples.length) {
    const a = stopSamples[0];
    const drift = stopSamples.filter((b) => Math.abs(b.l - a.l) > 2 || Math.abs(b.t - a.t) > 2 || Math.abs(b.w - a.w) > 2 || Math.abs(b.h - a.h) > 2);
    t.check(`${size} STOP: same size and position`, drift.length === 0, JSON.stringify({ base: a, drift: drift.slice(0, 6) }).slice(0, 800));
  } else {
    t.check(`${size} STOP: same size and position`, false, "STOP was never shown");
  }

  await page.ctx.close();
}

await br.close();
await srv.close();
process.exit(t.done() ? 1 : 0);
