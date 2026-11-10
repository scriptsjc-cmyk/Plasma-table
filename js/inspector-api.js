// window.ptInspector: the small, validated API the Pro inspector panel talks to. mm and degrees CLOCKWISE.
// It only changes the drawing and the job PLAN (size, place, speed, lead-ins, tabs). It never sends a machine command and never
// touches the torch / M3 confirm: a changed plan is rebuilt by the normal job loader and still goes through every Start check.
const num = (v) => typeof v === "number" && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
export const OPS = ["cut", "score", "mark"];
const LAYERS = { cut: { name: "Cut", color: "#1f8a4c" }, score: { name: "Score", color: "#c27c0e" }, mark: { name: "Mark", color: "#6a4fc9" } };

export function makeInspector(h) {
  // h: { sketch(), S, leadNow(), ampsNow(), setSpeed(v), setLead(v), loadJob(), jobRunning() }
  const subs = new Set();
  const emit = (what = "change") => { for (const fn of [...subs]) { try { fn({ type: what }); } catch (e) { /* a bad listener must not break the page */ } } };
  const sk = () => h.sketch();
  const sel = () => { const k = sk(); return k ? k.selected() : null; };
  const api = {
    emit,
    getSelection() {
      const it = sel(); if (!it) return null;
      const b = sk().boxOf(it);
      return { w: r1(b[2] - b[0]), h: r1(b[3] - b[1]), x: r1(b[0]), y: r1(b[1]), rotation: r1((360 - ((it.rot || 0) % 360)) % 360) };
    },
    setSelection(p) {
      const k = sk(); if (!k) return false;
      if (p === null) { k.pick([]); k.draw(); k.onSelect(); emit(); return true; }
      const it = sel(); if (!it || !p || typeof p !== "object" || !k.canMutate(it)) return false;
      const max = k.maxMm || 3000;
      for (const key of Object.keys(p)) {
        if (!["w", "h", "x", "y", "rotation"].includes(key)) continue;
        const v = p[key];
        if (!num(v)) return false;
        if ((key === "w" || key === "h") && (v < 2 || v > max)) return false;
        if ((key === "x" || key === "y") && Math.abs(v) > max * 2) return false;
        if (key === "rotation" && Math.abs(v) > 36000) return false;
      }
      if ("rotation" in p) k.setAngle(((360 - (p.rotation % 360)) % 360 + 360) % 360);
      if ("w" in p) k.setWidth(p.w);
      if ("h" in p) k.setHeight(p.h);
      if ("x" in p) k.setPos("x", p.x);
      if ("y" in p) k.setPos("y", p.y);
      emit();
      return true;
    },
    getCut() {
      const it = sel(); if (!it) return null;
      const S = h.S;
      return {
        operation: OPS.includes(it.op) ? it.op : "cut",
        speed: Number(S.speed) || 0,
        amps: h.ampsNow(),
        leadIn: Number(h.leadNow()) || 0,
        leadOut: Number(S.cam.leadOut) || 0,
        tabs: { count: Number(S.cam.tabs) || 0, width: Number(S.cam.tabW) || 0 },
      };
    },
    setCut(p) {
      const it = sel(); if (!it || !p || typeof p !== "object" || h.jobRunning()) return false;      // nothing selected, or a job is running: no-op
      const S = h.S, tb = p.tabs && typeof p.tabs === "object" ? p.tabs : null;
      if ("operation" in p && !OPS.includes(p.operation)) return false;
      if ("speed" in p && !(num(p.speed) && p.speed >= 50 && p.speed <= 20000)) return false;
      if ("amps" in p && !(num(p.amps) && p.amps >= 0 && p.amps <= 400)) return false;
      if ("leadIn" in p && !(num(p.leadIn) && p.leadIn >= 0 && p.leadIn <= 50)) return false;
      if ("leadOut" in p && !(num(p.leadOut) && p.leadOut >= 0 && p.leadOut <= 50)) return false;
      if (tb) {
        if ("count" in tb && !(num(tb.count) && tb.count >= 0 && tb.count <= 20)) return false;
        if ("width" in tb && !(num(tb.width) && tb.width >= 0.5 && tb.width <= 20)) return false;
      }
      if ("operation" in p) { if (p.operation === "cut") delete it.op; else it.op = p.operation; sk().commit(); }
      if ("amps" in p) h.setAmps(p.amps);
      if ("leadOut" in p) S.cam.leadOut = p.leadOut;
      if (tb && "count" in tb) S.cam.tabs = Math.round(tb.count);
      if (tb && "width" in tb) S.cam.tabW = tb.width;
      if ("leadIn" in p) h.setLead(p.leadIn);
      if ("speed" in p) h.setSpeed(p.speed);       // clamps to the speed slider's range and rebuilds the job
      else h.loadJob();
      emit();
      return true;
    },
    listLayers() {
      const k = sk(); if (!k) return [];
      const present = new Set(["cut"]); for (const it of k.items) present.add(OPS.includes(it.op) ? it.op : "cut");
      const cur = sel(), curOp = cur ? (OPS.includes(cur.op) ? cur.op : "cut") : null;
      return OPS.filter((o) => present.has(o)).map((o) => ({ id: o, name: LAYERS[o].name, color: LAYERS[o].color, hidden: !!(k.hiddenLayers && k.hiddenLayers.has(o)), selected: curOp === o }));
    },
    selectLayer(id) {
      const k = sk(); if (!k || !OPS.includes(id)) return false;
      const ids = k.items.filter((it) => (it.op || "cut") === id).map((it) => it.id);
      k.pick(ids); k.draw(); k.onSelect(); emit();
      return true;
    },
    setLayerHidden(id, hidden) {
      const k = sk(); if (!k || !OPS.includes(id) || typeof hidden !== "boolean") return false;
      k.hiddenLayers = k.hiddenLayers || new Set();
      hidden ? k.hiddenLayers.add(id) : k.hiddenLayers.delete(id);
      k.commit(); emit();
      return true;
    },
    on(ev, fn) {
      if (ev !== "change" || typeof fn !== "function") return () => {};
      subs.add(fn); return () => subs.delete(fn);
    },
  };
  return api;
}
