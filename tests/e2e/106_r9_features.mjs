// Round 9 features: touch-off visibility, default tools, kerf label, cut preview play.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("106_r9_features");
const srv = await startServer();
const br = await launch();
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await newPage(br, "desktop", { base: srv.base });

await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make");
  T.setShapeFs(false);
  T.setAppMode("advanced", { persist: false, autoFs: false });
  T.sketch.clear();
});
await sleep(200);

const tools = await ev(page, () => {
  const ids = [...document.querySelectorAll("#quickBar [data-qb]")].map((b) => b.dataset.qb);
  const labels = (document.getElementById("quickBar") || {}).innerText || "";
  return { ids, hasEtch: ids.includes("etch"), hasTan: ids.includes("arctan"), hasArc: ids.includes("arc3"), hasSpline: ids.includes("spline"), hasDraw: ids.includes("draw"), etchName: /Etch \/ mark/i.test(labels) };
});
t.check("F10/ME-S3: Etch / mark, tangent arc, line, 3-point arc and spline are on the Advanced rail",
  tools.hasEtch && tools.hasTan && tools.hasArc && tools.hasSpline && tools.hasDraw && tools.etchName, JSON.stringify(tools));

const syn = await ev(page, () => {
  const T = window.plasmaTest;
  const more = document.querySelector('#quickBar [data-qb="more"]');
  if (more) more.click();
  const findInp = () => document.getElementById("qbMoreSearch") || document.getElementById("qbSearch") || document.querySelector("#qbMorePop input, #quickBar input");
  if (!findInp()) return { noInput: true };
  const type = (q) => {
    const inp = findInp();
    if (!inp) return { text: "", ids: [] };
    inp.value = q;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    const pop = document.getElementById("qbMorePop") || document.getElementById("quickBar");
    const text = (pop && pop.innerText) || "";
    const ids = [...document.querySelectorAll("#qbMorePop [data-qb], #quickBar [data-qb]")].map((b) => b.dataset.qb);
    return { text, ids };
  };
  const score = type("score");
  const flange = type("flange");
  const clear = findInp();
  if (clear) { clear.value = ""; clear.dispatchEvent(new Event("input", { bubbles: true })); }
  return {
    scoreEtch: score.ids.includes("etch") || /etch/i.test(score.text),
    flangePresets: flange.ids.includes("presets") || /preset|flange/i.test(flange.text),
  };
});
t.check("F10/ME-S3: tool search finds Etch via 'score' and Presets via 'flange'", syn.scoreEtch && syn.flangePresets, JSON.stringify(syn));

await ev(page, () => {
  const T = window.plasmaTest;
  T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(3);
});
await sleep(250);

const vis = await ev(page, () => {
  const check = ((document.getElementById("checkHint") || {}).innerText || "") + " " + ((document.getElementById("checkZero") || {}).innerText || "") + " " + ((document.getElementById("checklist") || {}).innerText || "");
  const kerf = document.getElementById("kerfNote");
  const kcs = kerf && getComputedStyle(kerf);
  const play = document.getElementById("playRow");
  const pcs = play && getComputedStyle(play);
  const playShown = !!(play && pcs.display !== "none" && !play.classList.contains("hidden") && play.getBoundingClientRect().height > 0);
  return {
    touch: /touch off/i.test(check),
    kerf: !!(kerf && /half a kerf/i.test(kerf.textContent) && kcs.display !== "none" && !kerf.classList.contains("hidden")),
    playShown,
    playDisplay: pcs && pcs.display,
    playHiddenClass: play && play.classList.contains("hidden"),
    checkHead: check.slice(0, 240),
  };
});
t.check("ME1: checklist says the first pierce will touch off", vis.touch, vis.checkHead);
t.check("ME-S1: a kerf-side label is visible on the cutting preview", vis.kerf, JSON.stringify(vis));
t.check("ME-S5: Play the cut preview is visible on laptop Get-to-cutting", vis.playShown, JSON.stringify({ display: vis.playDisplay, hidden: vis.playHiddenClass }));

const polar = await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make"); T.sketch.clear();
  T.sketch.add("rect", true, { w: 80, h: 80 });
  T.sketch.items[0].x = 0; T.sketch.items[0].y = 0;
  T.sketch.pick([T.sketch.items[0].id]);
  const msgs = [];
  const prev = T.sketch.onMessage;
  T.sketch.onMessage = (m) => { msgs.push(String(m || "")); if (prev) prev(m); };
  T.sketch.polarArray(8, 40, { x: 40, y: 40, mode: "point" });
  T.sketch.onMessage = prev;
  return { n: T.sketch.items.length, warned: msgs.some((m) => /overlap/i.test(m)), msgs };
});
t.check("F11: circular array warns when copies will overlap", polar.warned && polar.n >= 2, JSON.stringify(polar));

await page.context().close();
await br.close();
await srv.close();
t.done();
