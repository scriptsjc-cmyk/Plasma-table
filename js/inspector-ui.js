// Pro docked inspector (shell and layout only).
//
// This file paints the right-hand panel and talks to the host ONLY through
// window.ptInspector. It does not read the sketch, the job, or CAM state.
// If window.ptInspector already exists when this module runs, that object is
// used and the mock at the bottom is not installed. Assign the real object
// before this script (it is loaded after js/app.js), or the mock stays in place
// until a reload.
//
// Units are millimetres and degrees. The panel sends partial objects: only the
// fields the operator changed. The host merges them and then emits "change".
//
// getSelection() -> null | { w, h, x, y, rotation }
//   null when nothing is selected.
//   w, h  size of the selection in mm
//   x, y  position of the selection in mm (host defines the origin)
//   rotation  degrees, clockwise
// setSelection(partial | null)
//   null clears the selection.
//   partial may include any of w, h, x, y, rotation (numbers).
//   Ignored fields are left as they were. No-op when partial is not an object.
//
// getCut() -> null | { operation, speed, amps, leadIn, leadOut, tabs }
//   null when nothing is selected, or the selection has no cut settings.
//   operation  "cut" | "score" | "mark" (any other string is shown as-is)
//   speed      mm/min
//   amps       arc current
//   leadIn     lead-in length in mm
//   leadOut    lead-out length in mm
//   tabs       { count, width }
//              count  hold-down tabs on this shape
//              width  tab width in mm
//              A bare number is accepted as count.
// setCut(partial)
//   partial may include any of the getCut() fields.
//   tabs may be a number (count) or { count, width } with either key.
//   No-op when nothing is selected.
//
// listLayers() -> Array<{ id, name, color, hidden, selected }>
//   id        string, stable
//   name      label shown in the list
//   color     CSS color for the swatch (optional)
//   hidden    true when that layer is not drawn
//   selected  true for the one active cut layer
// selectLayer(id)       makes that layer the selected one
// setLayerHidden(id, bool)
//
// on(event, fn) -> unsubscribe function
//   The only event is "change". It fires after setSelection, setCut,
//   selectLayer, setLayerHidden, and whenever the host changes the same data.
//   fn is called with no arguments; the panel re-reads the getters.
//   Call the returned function to unsubscribe.
//
// The panel calls the getters to paint and the setters when a field changes.
// It never writes the DOM from anywhere else.

const OPS = [
  { id: "cut", label: "Cut" },
  { id: "score", label: "Score" },
  { id: "mark", label: "Mark" },
];

const NARROW = "(max-width: 1100px), (max-height: 560px)";

function icon(name) {
  return `<svg class="ico" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function api() {
  return window.ptInspector || null;
}

function call(name, ...args) {
  const host = api();
  const fn = host && host[name];
  if (typeof fn !== "function") return undefined;
  try { return fn.apply(host, args); }
  catch (e) { return undefined; }
}

function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return String(Math.round(x * 1000) / 1000);
}

function readNum(id) {
  const el = document.getElementById(id);
  if (!el) return undefined;
  const t = el.value.trim();
  if (t === "" || t === "-" || t === "." || t === "-.") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function setControl(id, value) {
  const el = document.getElementById(id);
  if (!el || document.activeElement === el) return;
  const next = value == null ? "" : String(value);
  if (el.value !== next) el.value = next;
}

function domId(prefix, id) {
  return prefix + String(id).replace(/[^A-Za-z0-9_-]/g, "_");
}

function shellHtml() {
  return `
    <button type="button" id="ptInspToggle" class="pt-insp-toggle" aria-expanded="true" aria-controls="ptInspBody" aria-label="Collapse inspector">
      ${icon("rect")}
      <span class="pt-insp-title">Inspector</span>
      ${icon("arrow-right")}
    </button>
    <div id="ptInspBody" class="pt-insp-body">
      <div id="ptInspEmpty" class="pt-empty" hidden>
        ${icon("rect")}
        <p><b>Nothing selected</b></p>
        <p class="muted">Select a shape to edit its size, position and cut settings.</p>
      </div>
      <section id="ptInspShape" aria-labelledby="ptInspShapeH">
        <h3 id="ptInspShapeH">${icon("rect")} Shape</h3>
        <div class="pt-grid">
          <label for="ptInspW">Width (mm)<input id="ptInspW" type="number" inputmode="decimal" step="0.1" min="0" autocomplete="off"></label>
          <label for="ptInspH">Height (mm)<input id="ptInspH" type="number" inputmode="decimal" step="0.1" min="0" autocomplete="off"></label>
          <label for="ptInspX">X (mm)<input id="ptInspX" type="number" inputmode="decimal" step="0.1" autocomplete="off"></label>
          <label for="ptInspY">Y (mm)<input id="ptInspY" type="number" inputmode="decimal" step="0.1" autocomplete="off"></label>
          <label class="pt-span" for="ptInspRot">Rotation (°)<input id="ptInspRot" type="number" inputmode="decimal" step="1" autocomplete="off"></label>
        </div>
      </section>
      <section id="ptInspCut" aria-labelledby="ptInspCutH">
        <h3 id="ptInspCutH">${icon("cut")} Cut settings</h3>
        <p id="ptInspCutEmpty" class="pt-note muted" hidden>No cut settings on this shape.</p>
        <div id="ptInspCutFields" class="pt-grid">
          <label class="pt-span" for="ptInspOp">Operation
            <select id="ptInspOp"></select>
          </label>
          <label for="ptInspSpeed">Speed (mm/min)<input id="ptInspSpeed" type="number" inputmode="decimal" step="10" min="0" autocomplete="off"></label>
          <label for="ptInspAmps">Amps<input id="ptInspAmps" type="number" inputmode="decimal" step="1" min="0" autocomplete="off"></label>
          <label for="ptInspLeadIn">Lead-in (mm)<input id="ptInspLeadIn" type="number" inputmode="decimal" step="0.5" min="0" autocomplete="off"></label>
          <label for="ptInspLeadOut">Lead-out (mm)<input id="ptInspLeadOut" type="number" inputmode="decimal" step="0.5" min="0" autocomplete="off"></label>
          <label for="ptInspTabs">Tabs<input id="ptInspTabs" type="number" inputmode="numeric" step="1" min="0" autocomplete="off"></label>
          <label for="ptInspTabW">Tab width (mm)<input id="ptInspTabW" type="number" inputmode="decimal" step="0.5" min="0" autocomplete="off"></label>
        </div>
      </section>
      <section id="ptInspLayersSec" aria-labelledby="ptInspLayersH">
        <h3 id="ptInspLayersH">${icon("grid")} Cut layers</h3>
        <ul id="ptInspLayers" class="pt-layers" aria-label="Cut layers"></ul>
      </section>
    </div>`;
}

function mount() {
  const host = document.getElementById("cutView");
  if (!host || document.getElementById("ptInspector")) return null;
  const aside = document.createElement("aside");
  aside.id = "ptInspector";
  aside.className = "pt-inspector pro-only";
  aside.setAttribute("aria-label", "Inspector");
  aside.innerHTML = shellHtml();
  host.appendChild(aside);
  return aside;
}

function fillOperations(current) {
  const sel = document.getElementById("ptInspOp");
  if (!sel) return;
  const known = OPS.map((o) => o.id);
  const extra = current && !known.includes(current) ? [{ id: current, label: current }] : [];
  const options = OPS.concat(extra);
  const sig = options.map((o) => o.id).join("|");
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.replaceChildren();
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
  }
  if (document.activeElement !== sel && current && sel.value !== current) sel.value = current;
}

function paintLayers(layers) {
  const list = document.getElementById("ptInspLayers");
  if (!list) return;
  const rows = Array.isArray(layers) ? layers : [];
  const sig = rows.map((l) => [l && l.id, l && l.name, l && l.color, !!(l && l.hidden), !!(l && l.selected)].join("\u001f")).join("\u0001");
  if (list.dataset.sig === sig) return;
  const focusId = document.activeElement && document.activeElement.id;
  list.dataset.sig = sig;
  list.replaceChildren();
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "pt-layers-empty muted";
    li.textContent = "No cut layers";
    list.appendChild(li);
    return;
  }
  for (const layer of rows) {
    if (!layer || layer.id == null) continue;
    const id = String(layer.id);
    const name = layer.name != null ? String(layer.name) : id;
    const li = document.createElement("li");
    li.className = "pt-layer-row" + (layer.hidden ? " is-hidden" : "");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pt-layer";
    btn.id = domId("ptLayer-", id);
    btn.dataset.layer = id;
    btn.setAttribute("aria-pressed", layer.selected ? "true" : "false");
    btn.setAttribute("aria-label", "Select " + name + " layer");
    const sw = document.createElement("span");
    sw.className = "pt-swatch";
    sw.setAttribute("aria-hidden", "true");
    if (layer.color) sw.style.backgroundColor = String(layer.color);
    const label = document.createElement("span");
    label.className = "pt-layer-name";
    label.textContent = name;
    btn.append(sw, label);
    const hide = document.createElement("label");
    hide.className = "pt-hide";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = domId("ptHide-", id);
    box.dataset.layer = id;
    box.checked = !!layer.hidden;
    box.setAttribute("aria-label", "Hide " + name);
    const hideText = document.createElement("span");
    hideText.textContent = "Hide";
    hide.append(box, hideText);
    li.append(btn, hide);
    list.appendChild(li);
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) el.focus();
  }
}

function paint() {
  const aside = document.getElementById("ptInspector");
  if (!aside) return;
  const sel = call("getSelection");
  const selected = !!(sel && typeof sel === "object");
  const empty = document.getElementById("ptInspEmpty");
  const shape = document.getElementById("ptInspShape");
  const cutSec = document.getElementById("ptInspCut");
  if (empty) empty.hidden = selected;
  if (shape) shape.hidden = !selected;
  if (cutSec) cutSec.hidden = !selected;
  if (selected) {
    setControl("ptInspW", fmt(sel.w));
    setControl("ptInspH", fmt(sel.h));
    setControl("ptInspX", fmt(sel.x));
    setControl("ptInspY", fmt(sel.y));
    setControl("ptInspRot", fmt(sel.rotation));
    const cut = call("getCut");
    const hasCut = !!(cut && typeof cut === "object");
    const note = document.getElementById("ptInspCutEmpty");
    const fields = document.getElementById("ptInspCutFields");
    if (note) note.hidden = hasCut;
    if (fields) fields.hidden = !hasCut;
    if (hasCut) {
      const op = cut.operation != null ? String(cut.operation) : "cut";
      fillOperations(op);
      setControl("ptInspSpeed", fmt(cut.speed));
      setControl("ptInspAmps", fmt(cut.amps));
      setControl("ptInspLeadIn", fmt(cut.leadIn));
      setControl("ptInspLeadOut", fmt(cut.leadOut));
      const tabs = cut.tabs;
      if (typeof tabs === "number") {
        setControl("ptInspTabs", fmt(tabs));
      } else if (tabs && typeof tabs === "object") {
        setControl("ptInspTabs", fmt(tabs.count));
        setControl("ptInspTabW", fmt(tabs.width));
      }
    }
  }
  paintLayers(call("listLayers"));
}

function commitShape() {
  const patch = {};
  const w = readNum("ptInspW"); if (w !== undefined) patch.w = w;
  const h = readNum("ptInspH"); if (h !== undefined) patch.h = h;
  const x = readNum("ptInspX"); if (x !== undefined) patch.x = x;
  const y = readNum("ptInspY"); if (y !== undefined) patch.y = y;
  const rotation = readNum("ptInspRot"); if (rotation !== undefined) patch.rotation = rotation;
  if (Object.keys(patch).length) call("setSelection", patch);
}

function commitCut() {
  const patch = {};
  const op = document.getElementById("ptInspOp");
  if (op && op.value) patch.operation = op.value;
  const speed = readNum("ptInspSpeed"); if (speed !== undefined) patch.speed = speed;
  const amps = readNum("ptInspAmps"); if (amps !== undefined) patch.amps = amps;
  const leadIn = readNum("ptInspLeadIn"); if (leadIn !== undefined) patch.leadIn = leadIn;
  const leadOut = readNum("ptInspLeadOut"); if (leadOut !== undefined) patch.leadOut = leadOut;
  const count = readNum("ptInspTabs");
  const width = readNum("ptInspTabW");
  if (count !== undefined || width !== undefined) {
    patch.tabs = {};
    if (count !== undefined) patch.tabs.count = count;
    if (width !== undefined) patch.tabs.width = width;
  }
  if (Object.keys(patch).length) call("setCut", patch);
}

function bindFields(aside) {
  const shapeIds = ["ptInspW", "ptInspH", "ptInspX", "ptInspY", "ptInspRot"];
  for (const id of shapeIds) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", commitShape);
      el.addEventListener("blur", paint);
    }
  }
  const cutIds = ["ptInspSpeed", "ptInspAmps", "ptInspLeadIn", "ptInspLeadOut", "ptInspTabs", "ptInspTabW"];
  for (const id of cutIds) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", commitCut);
      el.addEventListener("blur", paint);
    }
  }
  const op = document.getElementById("ptInspOp");
  if (op) op.addEventListener("change", commitCut);
  const list = document.getElementById("ptInspLayers");
  if (list) {
    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".pt-layer");
      if (!btn || !list.contains(btn)) return;
      call("selectLayer", btn.dataset.layer);
    });
    list.addEventListener("change", (e) => {
      const box = e.target;
      if (!box || box.type !== "checkbox" || !box.dataset.layer) return;
      call("setLayerHidden", box.dataset.layer, box.checked);
    });
    list.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const buttons = [...list.querySelectorAll(".pt-layer")];
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      const next = buttons[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      next.focus();
      call("selectLayer", next.dataset.layer);
    });
  }
  const toggle = document.getElementById("ptInspToggle");
  const body = document.getElementById("ptInspBody");
  let pinned = false;
  const mq = window.matchMedia(NARROW);
  function setCollapsed(on, fromUser) {
    if (fromUser) pinned = true;
    const collapsed = !!on;
    aside.classList.toggle("is-collapsed", collapsed);
    document.body.classList.toggle("pt-insp-collapsed", collapsed);
    if (toggle) {
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute("aria-label", collapsed ? "Expand inspector" : "Collapse inspector");
      const uses = toggle.querySelectorAll("use");
      const chev = uses[uses.length - 1];
      if (chev) chev.setAttribute("href", collapsed ? "#i-arrow-left" : "#i-arrow-right");
    }
    if (body) {
      body.hidden = collapsed;
      if (collapsed && body.contains(document.activeElement) && toggle) toggle.focus();
    }
  }
  if (toggle) toggle.addEventListener("click", () => setCollapsed(!aside.classList.contains("is-collapsed"), true));
  setCollapsed(mq.matches, false);
  const onMq = () => { if (!pinned) setCollapsed(mq.matches, false); };
  if (mq.addEventListener) mq.addEventListener("change", onMq);
  else if (mq.addListener) mq.addListener(onMq);
}

function start() {
  installMockIfNeeded();
  const aside = mount();
  if (!aside) return;
  bindFields(aside);
  const host = api();
  if (host && typeof host.on === "function") {
    try { host.on("change", paint); }
    catch (e) { /* the panel still paints once */ }
  }
  paint();
}

// ============================================================
// MOCK — sample data so the shell can be reviewed before the lead
// wires the real selection, cut settings and layers.
// Installed only when window.ptInspector is missing.
// Delete this block once the real object is assigned before this script.
// ============================================================
function installMockIfNeeded() {
  if (window.ptInspector != null) return;

  let selection = { w: 100, h: 60, x: 40, y: 30, rotation: 0 };
  let cut = {
    operation: "cut",
    speed: 2000,
    amps: 40,
    leadIn: 3,
    leadOut: 0,
    tabs: { count: 0, width: 3 },
  };
  const layers = [
    { id: "cut", name: "Cut", color: "#C05600", hidden: false },
    { id: "holes", name: "Holes", color: "#0078D4", hidden: false },
    { id: "mark", name: "Mark", color: "#0F7B3A", hidden: true },
  ];
  let currentLayer = "cut";
  const listeners = new Set();

  function emit() {
    for (const fn of [...listeners]) {
      try { fn(); }
      catch (e) { /* one listener must not block the others */ }
    }
  }
  function num(v, prev) {
    const n = Number(v);
    return Number.isFinite(n) ? n : prev;
  }
  function copySelection() {
    return selection ? { w: selection.w, h: selection.h, x: selection.x, y: selection.y, rotation: selection.rotation } : null;
  }
  function copyCut() {
    if (!selection || !cut) return null;
    const tabs = cut.tabs && typeof cut.tabs === "object"
      ? { count: cut.tabs.count, width: cut.tabs.width }
      : { count: 0, width: 3 };
    return { operation: cut.operation, speed: cut.speed, amps: cut.amps, leadIn: cut.leadIn, leadOut: cut.leadOut, tabs };
  }

  window.ptInspector = {
    getSelection: copySelection,
    setSelection(next) {
      if (next == null) { selection = null; emit(); return; }
      if (typeof next !== "object") return;
      const base = selection || { w: 100, h: 60, x: 0, y: 0, rotation: 0 };
      selection = {
        w: num(next.w, base.w),
        h: num(next.h, base.h),
        x: num(next.x, base.x),
        y: num(next.y, base.y),
        rotation: num(next.rotation, base.rotation),
      };
      emit();
    },
    getCut: copyCut,
    setCut(next) {
      if (!selection || !next || typeof next !== "object") return;
      const prevTabs = cut.tabs || { count: 0, width: 3 };
      let tabs = { count: prevTabs.count, width: prevTabs.width };
      if (typeof next.tabs === "number") tabs = { count: num(next.tabs, tabs.count), width: tabs.width };
      else if (next.tabs && typeof next.tabs === "object") {
        if ("count" in next.tabs) tabs.count = num(next.tabs.count, tabs.count);
        if ("width" in next.tabs) tabs.width = num(next.tabs.width, tabs.width);
      }
      cut = {
        operation: next.operation != null && String(next.operation) !== "" ? String(next.operation) : cut.operation,
        speed: num(next.speed, cut.speed),
        amps: num(next.amps, cut.amps),
        leadIn: num(next.leadIn, cut.leadIn),
        leadOut: num(next.leadOut, cut.leadOut),
        tabs,
      };
      emit();
    },
    listLayers() {
      return layers.map((l) => ({ id: l.id, name: l.name, color: l.color, hidden: !!l.hidden, selected: l.id === currentLayer }));
    },
    selectLayer(id) {
      if (!layers.some((l) => l.id === id)) return;
      currentLayer = id;
      emit();
    },
    setLayerHidden(id, hidden) {
      const layer = layers.find((l) => l.id === id);
      if (!layer) return;
      layer.hidden = !!hidden;
      emit();
    },
    on(event, fn) {
      if (event !== "change" || typeof fn !== "function") return function () {};
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    },
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
