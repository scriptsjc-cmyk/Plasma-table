// Make a part: the four edit buttons live in the header, not over the canvas;
// Advanced tools has one parts list, with a way to view all of them;
// machine / edge status stays off the drawing screen.
import { serve, launch } from "../lib/r2compat.mjs";
import { T as Rec } from "../lib/t.mjs";

const s = await serve(), br = await launch();
const rec = new Rec("72_make_header");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, js) => page.evaluate(js);

const view = async (w, h, mobile) => {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/?test=1&turn=0", { waitUntil: "load" }); await sleep(700);
  return page;
};

const openMake = async (page, mode) => {
  await ev(page, `(() => {
    const T = window.plasmaTest;
    T.setAppMode("${mode}", { persist: false, autoFs: false });
    T.showScreen("make", { force: true });
    T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.add("rect", true, { w: 80, h: 50 });
    T.sketch.add("disc", true, { d: 30 });
    T.sketch.pick([T.sketch.items[0].id]);
    T.sketch.fitView();
    T.sketch.commit();
    T.sketch.onSelect && T.sketch.onSelect();
  })()`);
  await sleep(400);
};

const layout = (page) => ev(page, `(() => {
  const box = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const shown = cs.display !== "none" && cs.visibility !== "hidden" && !el.hidden && r.width > 2 && r.height > 2;
    return shown ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null;
  };
  const overlap = (a, b) => !!(a && b && a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1);
  const pin = document.getElementById("qbPinned");
  const bar = document.getElementById("makeBar");
  const title = bar && bar.querySelector("h1");
  const cv = document.getElementById("preview");
  const pic = document.getElementById("picTools");
  const ids = pin ? [...pin.querySelectorAll("[data-qb]")].map((b) => b.dataset.qb) : [];
  const lists = [];
  const layers = document.getElementById("layersPanel");
  if (box(layers)) lists.push("layers");
  if (box(document.querySelector(".bgparts"))) lists.push("beginner-parts");
  const insp = document.getElementById("ptInspLayers") || document.querySelector("#ptInspector .pt-layers");
  if (box(insp) || (insp && box(insp.closest("#ptInspector")))) lists.push("inspector");
  return {
    laptop: document.body.classList.contains("laptop-ui"),
    phone: document.body.classList.contains("phone-ui"),
    pro: document.body.classList.contains("pro-mode"),
    pinInBar: !!(pin && bar && bar.contains(pin)),
    ids,
    pin: box(pin),
    title: box(title),
    cv: box(cv),
    pic: box(pic),
    pinCoversCanvas: overlap(box(pin), box(cv)),
    picCoversCanvas: overlap(box(pic), box(cv)),
    nextToTitle: !!(box(pin) && box(title) && Math.abs(box(pin).t - box(title).t) < 80 && box(pin).l >= box(title).l - 1),
    lists,
    layerCount: layers ? layers.querySelectorAll(".layer-row").length : 0,
    viewParts: !!box(document.getElementById("btnViewParts")),
    layerOpen: !!(layers && layers.classList.contains("is-open") && box(layers)),
  };
})()`);

const machineOnMake = (page) => ev(page, `(() => {
  const shown = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && !el.hidden && r.width > 2 && r.height > 2;
  };
  const ids = ["fit", "jobStats", "jobCard", "playRow", "showMachWrap", "cutSummary", "ptInspCutSum", "homeBar", "cutCheck", "warnings", "cutCheck2", "cutCheck3"];
  const visible = ids.filter((id) => shown(document.getElementById(id)));
  const limits = [...document.querySelectorAll("details.guide")].filter((d) => d.querySelector(".limitsBody") && shown(d)).length;
  const text = document.body.innerText.replace(/\\s+/g, " ");
  const leaked = /Edges not set up|Fits on the machine|Home the machine first|can't check it fits|Connect to the table to check it fits|Demo: tap here and the edges|What this machine can cut/i.test(text);
  return { visible, limits, leaked, fitText: (document.getElementById("fit") && document.getElementById("fit").textContent) || "" };
})()`);



for (const [name, w, h, mobile, mode] of [
  ["laptop 1440 Simple", 1440, 900, false, "simple"],
  ["laptop 1440 Advanced", 1440, 900, false, "advanced"],
  ["phone portrait Simple", 390, 844, true, "simple"],
  ["phone portrait Advanced", 390, 844, true, "advanced"],
]) {
  const page = await view(w, h, mobile);
  await openMake(page, mode);
  const L = await layout(page);
  ck(`${name}: Undo, Redo, Fit and Delete sit in the Make a part header`, L.pinInBar && ["undo", "redo", "fit", "del"].every((id) => L.ids.includes(id)) && L.nextToTitle, L);
  ck(`${name}: those four buttons do not cover the canvas`, !L.pinCoversCanvas && L.pin && L.cv, L);
  ck(`${name}: no picture-tool overlay covers the canvas`, !L.picCoversCanvas, L);
  const M = await machineOnMake(page);
  ck(`${name}: no machine or edge status on the drawing screen`, M.visible.length === 0 && M.limits === 0 && !M.leaked, M);
  if (mode === "advanced") {
    if (mobile) {
      ck(`${name}: the parts list is not on the canvas until you open Parts`, !L.lists.includes("layers") && L.viewParts, L);
      await page.click("#btnViewParts"); await sleep(300);
      const open = await layout(page);
      ck(`${name}: Parts opens the one list with every shape`, open.layerOpen && open.lists.filter((x) => x === "layers").length === 1 && open.lists.length === 1 && open.layerCount >= 2, open);
      await ev(page, `document.getElementById("layersClose") && document.getElementById("layersClose").click()`); await sleep(200);
      const closed = await layout(page);
      ck(`${name}: closing Parts hides the list again`, !closed.layerOpen && !closed.lists.includes("layers"), closed);
    } else {
      ck(`${name}: one parts list, showing every shape`, L.lists.length === 1 && L.lists[0] === "layers" && L.layerCount >= 2 && !L.viewParts, L);
    }
  }
  await page.context().close();
}


{
  const page = await view(1440, 900, false);
  await openMake(page, "advanced");
  ck("Advanced: Customise toolbar is in the tool bar, not over the canvas", await ev(page, `(() => {
    const btn = document.querySelector("#quickBar [data-qb='customise']");
    const cv = document.getElementById("preview");
    if (!btn || !cv) return false;
    const a = btn.getBoundingClientRect(), b = cv.getBoundingClientRect();
    const shown = a.width > 0 && a.height > 0;
    const overlap = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    return shown && !overlap;
  })()`));
  await page.click("#quickBar [data-qb='customise']"); await sleep(300);
  const opened = await ev(page, `(() => {
    const el = document.getElementById("toolbarCustom");
    const cats = [...document.querySelectorAll("#tcCatalog h3")].map((h) => h.textContent.trim());
    const nMine = document.querySelectorAll("#tcMine [data-id]").length;
    const nCat = document.querySelectorAll("#tcCatalog [data-tc='add']").length;
    const reset = !!document.getElementById("tcReset");
    return { open: !!(el && el.classList.contains("is-open")), cats, nMine, nCat, reset, hasDraw: cats.some((c) => /draw/i.test(c)), hasBool: cats.some((c) => /boolean|offset/i.test(c)), hasArray: cats.some((c) => /array/i.test(c)) };
  })()`);
  ck("Customise toolbar opens a roomy catalogue of drawing tools", opened.open && opened.nCat >= 20 && opened.nMine >= 10 && opened.reset && opened.hasDraw && opened.hasBool && opened.hasArray, opened);
  // remove rectangle, move first tool down, save
  const before = await ev(page, `window.plasmaTest.getPrefs().tools`);
  await ev(page, `document.querySelector("#tcMine [data-tc='remove'][data-id='rect']")?.click()`);
  await ev(page, `document.querySelector("#tcMine [data-tc='down']")?.click()`);
  await sleep(200);
  const mid = await ev(page, `(() => {
    const ids = [...document.querySelectorAll("#tcMine .tc-row[data-id]")].map((li) => li.dataset.id);
    const prefs = window.plasmaTest.getPrefs().tools;
    const rail = [...document.querySelectorAll("#quickBar [data-qb]")].map((b) => b.dataset.qb).filter((id) => id !== "customise");
    return { ids, prefs, rail, hasRect: ids.includes("rect") };
  })()`);
  ck("removing and reordering tools updates the toolbar and is saved in prefs", mid.prefs && mid.prefs[0] === mid.ids[0] && !mid.hasRect && !mid.rail.includes("rect") && mid.rail[0] === mid.ids[0], mid);
  await ev(page, `document.getElementById("tcReset").click()`); await sleep(200);
  const reset = await ev(page, `(() => {
    const ids = [...document.querySelectorAll("#tcMine .tc-row[data-id]")].map((li) => li.dataset.id);
    const rail = [...document.querySelectorAll("#quickBar [data-qb]")].map((b) => b.dataset.qb).filter((id) => id !== "customise");
    return { ids, prefs: window.plasmaTest.getPrefs().tools, railHasRect: rail.includes("rect"), n: ids.length };
  })()`);
  ck("Reset to default restores the full toolbar", reset.prefs == null && reset.railHasRect && reset.n >= 20, reset);
  await ev(page, `document.getElementById("tcClose").click()`); await sleep(250);
  ck("closing Customise toolbar hides the dialog", await ev(page, `(() => { const el = document.getElementById("toolbarCustom"); return !el || el.hidden || !el.classList.contains("is-open"); })()`));
  await page.context().close();
}

await br.close(); await s.close();
process.exit(rec.done() ? 1 : 0);
