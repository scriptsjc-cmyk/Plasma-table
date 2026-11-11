// Make a part: "Add text" and "Trace a picture". Two small dialogs on top of the engines in textshape.js and trace.js.
// Both end as ordinary editable parts (custom outlines with true holes), so everything else in the app treats them like any
// other part, and the cut check on the cutting screen warns about thin or tiny features when you prepare to cut (not here).
import { textToContours, TEXT_FONTS, defaultWeight } from "./textshape.js";
import { traceImage, toGray, grayHistogram, otsu } from "./trace.js";
import { contoursToEditable } from "./editable.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = (id) => document.getElementById(id);

// draw closed outlines (mm, y up) into a canvas, filled with the even-odd rule so holes show as holes
function drawOutlines(cv, contours, bbox) {
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  if (!contours.length) return;
  let [x0, y0, x1, y1] = bbox || [Infinity, Infinity, -Infinity, -Infinity];
  if (!bbox) for (const c of contours) for (const [x, y] of c.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 8, k = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (H - 2 * pad) / Math.max(1e-6, y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
  ctx.beginPath();
  for (const c of contours) c.pts.forEach(([x, y], i) => { const X = ox + (x - x0) * k, Y = H - (oy + (y - y0) * k); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }), ctx.closePath();
  ctx.fillStyle = "#1c2a36"; ctx.fill("evenodd");
}

export function initMakeTools({ sketch, isPro, afterAdd, toast, blocked }) {
  const root = document.createElement("div");
  root.innerHTML = `
<div id="textDlg" class="shapelib hidden mtdlg" role="dialog" aria-modal="true" aria-labelledby="mtTitle">
  <div class="shapelib-card">
    <div class="shapelib-head"><h2 id="mtTitle">Add text</h2><button type="button" id="mtClose">Close</button></div>
    <p class="muted small mt-guide">Type your words, pick how tall they are and how you want them cut. The letters are single-stroke, thick enough to cut cleanly.</p>
    <div class="mt-cols"><div class="mt-ctl">
    <label><span class="mt-lab"><span class="mt-step">1</span>Your words</span>
      <textarea id="mtText" rows="2" maxlength="400" autocomplete="off" spellcheck="false">PLASMA</textarea></label>
    <div class="grid2">
      <label><span class="mt-lab"><span class="mt-step">2</span>Letter height (mm)</span><input id="mtSize" type="number" min="3" max="400" step="1" value="40" inputmode="decimal"></label>
      <label><span class="mt-lab"><span class="mt-step">3</span>Style</span><select id="mtFont">${TEXT_FONTS.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select></label>
    </div>
    <label><span class="mt-lab"><span class="mt-step">4</span>How to cut it</span>
      <select id="mtKind">
        <option value="plate">Letters cut out of a plate (name plate / stencil, centres stay attached)</option>
        <option value="letters">Each letter is a part (cut the letters out)</option>
      </select></label>
    <div class="mt-pro">
      <div class="grid2">
        <label>Stroke width (mm)<input id="mtWeight" type="number" min="0.8" max="60" step="0.1" inputmode="decimal"></label>
        <label>Letter spacing (mm)<input id="mtSpacing" type="number" min="-10" max="100" step="0.5" value="0" inputmode="decimal"></label>
        <label>Line spacing (×)<input id="mtLine" type="number" min="0.6" max="3" step="0.1" value="1" inputmode="decimal"></label>
        <label>Line up<select id="mtAlign"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label>
        <label>Curve (° round a circle, − hangs)<input id="mtCurve" type="number" min="-340" max="340" step="5" value="0" inputmode="decimal"></label>
        <label class="mt-plate">Plate margin (mm)<input id="mtMargin" type="number" min="1" max="200" step="1" inputmode="decimal"></label>
        <label class="check mt-plate"><input type="checkbox" id="mtStencil" checked> Keep centres of A, B, D, O, P, Q, R… attached</label>
        <label class="mt-plate">Bridge width (mm)<input id="mtBridge" type="number" min="0.8" max="30" step="0.1" inputmode="decimal"></label>
      </div>
    </div>
    </div><div class="mt-view">
    <canvas id="mtPrev" width="640" height="220" aria-label="Preview of the text"></canvas>
    <p class="small muted" id="mtInfo" role="status"></p>
    <div class="row wrap"><button type="button" id="mtAdd" class="xl accent">Add to my drawing</button><button type="button" id="mtCancel" class="xl">Cancel</button></div>
    </div></div>
  </div>
</div>
<div id="traceDlg" class="shapelib hidden mtdlg" role="dialog" aria-modal="true" aria-labelledby="trTitle">
  <div class="shapelib-card">
    <div class="shapelib-head"><h2 id="trTitle">Trace a picture</h2><button type="button" id="trClose">Close</button></div>
    <p class="muted small mt-guide">Pick a logo or picture (PNG, JPG, WebP). Dark parts become outlines you can edit and cut. A clear black-on-white picture works best.</p>
    <div class="mt-cols"><div class="mt-ctl">
    <label><span class="mt-lab"><span class="mt-step">1</span>Choose a picture</span><input id="trFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"></label>
    <div class="grid2">
      <label><span class="mt-lab"><span class="mt-step">2</span>Finished width (mm)</span><input id="trWidth" type="number" min="5" max="2000" step="1" value="100" inputmode="decimal"></label>
      <label><span class="mt-lab"><span class="mt-step">3</span>How much to keep </span><span class="muted small" id="trThrVal"></span><input id="trThr" type="range" min="1" max="254" step="1" value="128"></label>
    </div>
    <div class="row wrap">
      <label class="check"><input type="checkbox" id="trInvert"> Cut the light parts instead of the dark parts</label>
      <button type="button" id="trAuto" class="small">Auto</button>
    </div>
    <div class="mt-pro">
      <div class="grid2">
        <label>Smooth (0 to 6)<input id="trBlur" type="number" min="0" max="6" step="1" value="1" inputmode="numeric"></label>
        <label>Ignore specks under (mm)<input id="trSpeck" type="number" min="0" max="50" step="0.5" value="1" inputmode="decimal"></label>
        <label>Simplify edges (mm)<input id="trSimp" type="number" min="0.02" max="5" step="0.05" value="0.15" inputmode="decimal"></label>
      </div>
    </div>
    </div><div class="mt-view">
    <canvas id="trPrev" width="640" height="260" aria-label="Preview of the traced outlines"></canvas>
    <p class="small muted" id="trInfo" role="status">Choose a picture to start.</p>
    <div class="row wrap"><button type="button" id="trAdd" class="xl accent" disabled>Add to my drawing</button><button type="button" id="trCancel" class="xl">Cancel</button></div>
    </div></div>
  </div>
</div>`;
  document.body.append(...root.children);
  const tdlg = $("textDlg"), rdlg = $("traceDlg");
  let tres = null, rres = null, img = null, imgHist = null, timer = null;
  const num = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : d; };
  const closeBoth = () => { tdlg.classList.add("hidden"); rdlg.classList.add("hidden"); };
  const syncPro = () => { const p = !!isPro(); tdlg.classList.toggle("is-pro", p); rdlg.classList.toggle("is-pro", p); };

  // ---- text
  const textOpts = () => {
    const kind = $("mtKind").value, pro = !!isPro();
    const size = Math.max(3, Math.min(400, num("mtSize", 40)));
    const w = $("mtWeight").value === "" ? defaultWeight(size) : num("mtWeight", defaultWeight(size));
    return {
      font: $("mtFont").value, size, weight: w, spacing: pro ? num("mtSpacing", 0) : 0, lineSpacing: pro ? num("mtLine", 1) : 1,
      align: pro ? $("mtAlign").value : "center", curve: pro ? num("mtCurve", 0) : 0,
      stencil: kind === "plate" && (!pro || $("mtStencil").checked), bridge: $("mtBridge").value === "" ? 0 : num("mtBridge", 0),
      plate: kind === "plate" ? ($("mtMargin").value === "" ? Math.max(8, Math.round(size * 0.35)) : num("mtMargin", 10)) : 0,
    };
  };
  const paintText = () => {
    const txt = $("mtText").value;
    if (!txt.trim()) { tres = null; drawOutlines($("mtPrev"), []); $("mtInfo").textContent = "Type some words."; $("mtAdd").disabled = true; return; }
    try { tres = textToContours(txt, textOpts()); } catch (e) { tres = null; $("mtInfo").textContent = "Could not make that text: " + e.message; $("mtAdd").disabled = true; return; }
    drawOutlines($("mtPrev"), tres.contours);
    const warn = tres.islands ? ` ${tres.islands} centre${tres.islands > 1 ? "s" : ""} are loose (no bridge possible).` : "";
    $("mtInfo").textContent = `${tres.width.toFixed(0)} × ${tres.height.toFixed(0)} mm, stroke ${tres.weight.toFixed(1)} mm.` + warn;
    $("mtAdd").disabled = !tres.contours.length;
  };
  const textSoon = () => { clearTimeout(timer); timer = setTimeout(paintText, 120); };
  function openText() {
    if (blocked && blocked()) return;
    syncPro(); closeBoth();
    if (!$("mtWeight").value) $("mtWeight").placeholder = "auto";
    $("mtMargin").placeholder = "auto"; $("mtBridge").placeholder = "auto";
    $("mtKind").dispatchEvent(new Event("change"));
    tdlg.classList.remove("hidden"); paintText();
    setTimeout(() => { if (matchMedia("(pointer: fine)").matches) $("mtText").focus(); }, 30);
  }
  ["mtText", "mtSize", "mtFont", "mtKind", "mtWeight", "mtSpacing", "mtLine", "mtAlign", "mtCurve", "mtMargin", "mtStencil", "mtBridge"].forEach((id) => {
    $(id).addEventListener("input", textSoon); $(id).addEventListener("change", textSoon);
  });
  $("mtKind").addEventListener("change", () => { const plate = $("mtKind").value === "plate"; tdlg.classList.toggle("kind-letters", !plate); });
  $("mtSize").addEventListener("input", () => { if ($("mtWeight").value === "") $("mtWeight").placeholder = String(defaultWeight(num("mtSize", 40))); });

  // place new parts to the right of what is already drawn, picked so they move together
  function addParts(contours, label) {
    const e = contoursToEditable(contours);
    if (!e || !e.parts.length) { toast("Nothing to add.", true); return 0; }
    const b = sketch.allBoxExcept([]);
    const dx = b ? Math.round(b[2] + 15) : 20, dy = b ? Math.round(b[1]) : 20;
    const n = sketch.importParts(e.parts.map((p) => ({ cs: p.cs, x: p.x + dx, y: p.y + dy })), false);
    sketch.pick(sketch.items.slice(-n).map((i) => i.id)); sketch.draw(); sketch.onSelect();
    sketch.ensureVisible && sketch.ensureVisible();
    afterAdd && afterAdd(n, label);
    return n;
  }
  $("mtAdd").onclick = () => {
    if (!tres || !tres.contours.length) return;
    const n = addParts(tres.contours, "text");
    if (n) { tdlg.classList.add("hidden"); toast(n === 1 ? "Text added as 1 part." : `Text added as ${n} parts, picked together.`); }
  };
  const closeText = () => { tdlg.classList.add("hidden"); };
  $("mtClose").onclick = closeText; $("mtCancel").onclick = closeText;
  tdlg.addEventListener("click", (e) => { if (e.target === tdlg) closeText(); });

  // ---- picture trace
  const traceOpts = () => ({
    widthMm: Math.max(5, Math.min(2000, num("trWidth", 100))), threshold: Number($("trThr").value), invert: $("trInvert").checked,
    blur: isPro() ? num("trBlur", 1) : 1, minArea: isPro() ? Math.max(0, num("trSpeck", 1)) ** 2 : 1, simplify: isPro() ? Math.max(0.02, num("trSimp", 0.15)) : 0.15,
  });
  const paintTrace = () => {
    $("trThrVal").textContent = `(${$("trThr").value})`;
    if (!img) return;
    rres = traceImage(img, traceOpts());
    drawOutlines($("trPrev"), rres.contours, [0, 0, rres.widthMm, rres.heightMm]);
    const n = rres.outers, h = rres.holes;
    $("trInfo").textContent = n
      ? `${n} outline${n > 1 ? "s" : ""}${h ? `, ${h} hole${h > 1 ? "s" : ""}` : ""}, ${rres.widthMm.toFixed(0)} × ${rres.heightMm.toFixed(0)} mm.` + (rres.dropped ? ` ${rres.dropped} tiny speck${rres.dropped > 1 ? "s" : ""} ignored.` : "")
      : "Nothing found at this setting. Slide “How much to keep” or tick the light-parts box.";
    $("trAdd").disabled = !n;
  };
  const traceSoon = () => { clearTimeout(timer); timer = setTimeout(paintTrace, 140); };
  function openTrace() {
    if (blocked && blocked()) return;
    syncPro(); closeBoth(); rdlg.classList.remove("hidden"); paintTrace();
  }
  async function loadPicture(file) {
    if (!file) return;
    $("trInfo").textContent = "Reading the picture…"; $("trAdd").disabled = true;
    try {
      let bmp;
      if (window.createImageBitmap) { try { bmp = await createImageBitmap(file); } catch (e) { bmp = null; } }
      if (!bmp) {
        bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => rej(new Error("That file is not a picture the browser can read.")); im.src = u; });
      }
      const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, 1600 / Math.max(w0, h0));
      const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
      const ctx = cv.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      img = ctx.getImageData(0, 0, cv.width, cv.height);
      const g = toGray(img, 1200); imgHist = otsu(grayHistogram(g), g.g.length);
      $("trThr").value = String(Math.max(1, Math.min(254, imgHist)));
      // a mostly dark picture is probably a light logo on a dark background: offer the other way round
      paintTrace();
    } catch (e) { img = null; $("trInfo").textContent = e.message || "Could not read that picture."; }
  }
  $("trFile").addEventListener("change", () => loadPicture($("trFile").files[0]));
  ["trWidth", "trThr", "trInvert", "trBlur", "trSpeck", "trSimp"].forEach((id) => { $(id).addEventListener("input", traceSoon); $(id).addEventListener("change", traceSoon); });
  $("trAuto").onclick = () => { if (imgHist != null) { $("trThr").value = String(Math.max(1, Math.min(254, imgHist))); paintTrace(); } };
  $("trAdd").onclick = () => {
    if (!rres || !rres.contours.length) return;
    const n = addParts(rres.contours, "trace");
    if (n) { rdlg.classList.add("hidden"); toast(n === 1 ? "Picture traced into 1 part." : `Picture traced into ${n} parts, picked together.`); }
  };
  const closeTrace = () => rdlg.classList.add("hidden");
  $("trClose").onclick = closeTrace; $("trCancel").onclick = closeTrace;
  rdlg.addEventListener("click", (e) => { if (e.target === rdlg) closeTrace(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!tdlg.classList.contains("hidden")) closeText(); else if (!rdlg.classList.contains("hidden")) closeTrace(); } });

  return { openText, openTrace, closeBoth, _text: () => tres, _trace: () => rres };
}
