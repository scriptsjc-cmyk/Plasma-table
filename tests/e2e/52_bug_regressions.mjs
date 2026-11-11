// Round 5 group 3 (bugs, items 20-25) tests. Takes the r5-bugs-*.png screenshots.
//  20 inspector: job-wide settings are labelled as such, amps removed   21 part counts agree, SVG batch import + open-line wording, first job = practice
//  22 polygon -> disc size   23 operator row for the iOS decimal keypad   24 hole selected after adding; no 'Turn it' on circles
//  25 deploy workflow stamps the version
import fs from "node:fs";
import { serve, open, launch, demoToShape, VIEWS, REPO, SITE, DATA, SHOTS, mod } from "../lib/r2compat.mjs";
const out = SHOTS, D = DATA;
const s = await serve(), br = await launch();
let pass = 0, fail = 0;
const ck = (n, ok, i = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + (typeof i === "string" ? i : JSON.stringify(i)))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const snap = async (page, name) => { await sleep(250); await page.screenshot({ path: `${out}/r5-bugs-${name}.png` }); };
const cutFile = async (page, file) => {
  await T(page, "window.plasmaTest.showScreen('cut')");
  await page.setInputFiles("#file", file); await sleep(900);
  if (await T(page, "!document.getElementById('sizeDlg').classList.contains('hidden')")) { await page.click("#sizeYes"); await sleep(700); }
};

// ================================================================== 20 inspector: job-wide settings
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await T(page, "window.plasmaTest.setAppMode('pro')");
  await demoToShape(page, { stay: "make" });
  await T(page, "(() => { const t = window.plasmaTest, k = t.sketch; k.clear(); k.add('rect'); k.add('disc'); k.pick([k.items[0].id]); k.onSelect(); })()"); await sleep(400);
  const I = await T(page, `(() => { const q = (id) => !!document.getElementById(id); const j = document.getElementById("ptInspJob"); return { amps: q("ptInspAmps"), job: !!j, legend: j ? j.querySelector("legend").textContent : "", note: j ? j.textContent : "", inJob: j ? ["ptInspSpeed", "ptInspLeadIn", "ptInspLeadOut", "ptInspTabs", "ptInspTabW"].every((id) => j.contains(document.getElementById(id))) : false, opOutside: j ? !j.contains(document.getElementById("ptInspOp")) : false, cut: window.ptInspector.getCut(), ampsSet: window.ptInspector.setCut({ amps: 40 }) }; })()`);
  ck("20 the unused Amps field is gone from the inspector", I.amps === false && !("amps" in I.cut), JSON.stringify(I.cut));
  ck("20 the API refuses an amps setting", I.ampsSet === false);
  ck("20 speed, lead-in, lead-out and tabs sit in a box labelled 'Whole job (not just this shape)'", I.job && /Whole job/.test(I.legend) && I.inJob && I.opOutside, JSON.stringify(I));
  ck("20 the box says the amps are set on the power supply and settings are shared by every cut", /one speed, lead-in, lead-out and tab setting for every cut/.test(I.note) && /amps are set on the power supply/.test(I.note));
  const r = await T(page, `(() => { const I = window.ptInspector, k = window.plasmaTest.sketch; const sp0 = I.getCut().speed - 100; I.setCut({ leadOut: 2, speed: sp0 }); k.pick([k.items[1].id]); k.onSelect(); const c = I.getCut(); return { speed: c.speed, want: sp0, leadOut: c.leadOut, S: window.plasmaTest.S.speed }; })()`);
  ck("20 the values really are job-wide: the other shape shows the same speed and lead-out", r.leadOut === 2 && r.speed === r.want, JSON.stringify(r));
  await T(page, "window.plasmaTest.setAppMode && window.plasmaTest.setAppMode('pro')"); await sleep(300);
  await T(page, "(() => { const k = window.plasmaTest.sketch; k.pick([k.items[0].id]); k.onSelect(); const j = document.getElementById('ptInspJob'); if (j) j.scrollIntoView({ block: 'center' }); })()"); await sleep(500);
  await snap(page, "inspector-job-wide-laptop");
  await T(page, "window.plasmaTest.setShapeFs(false); window.plasmaTest.sendToCutting()"); await sleep(800);
  await page.context().close();
}

// ================================================================== 21 part counts
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  const read = () => T(page, `(() => { const g = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\\s+/g, " ") : ""; }; const k = window.plasmaTest.sketch; const num = (re, s) => { const m = re.exec(s); return m ? Number(m[1]) : null; }; const js = g("#jobStats"), bed = g("#bedStatusText"), lay = g("#layoutState"); return { partCount: window.plasmaTest.Setup.partCount(k), stats: num(/Parts (\\d+)/, js), bed: num(/(\\d+) part/, bed), layout: num(/(\\d+) part/, lay), name: k.name(), summary: window.plasmaTest.S.prepared && window.plasmaTest.S.prepared.summary.parts, total: k.partTotal(), js, bed2: bed }; })()`);
  const agree = (tag, r) => ck(`21 ${tag}: one part count everywhere (${r.partCount})`, r.stats === r.partCount && r.total === r.partCount && (r.bed == null || r.bed === r.partCount) && (/^bed|imported/.test(tag) ? (r.layout == null || r.layout === r.partCount) : true) && r.summary === r.partCount, JSON.stringify(r));
  await T(page, "(() => { const t = window.plasmaTest; t.showScreen('make'); t.setShapeFs(false); t.sketch.clear(); t.sketch.add('rect'); t.sketch.add('hole'); })()"); await sleep(600);
  const m1 = await read(); agree("Make: a plate with a hole", m1);
  ck("21 the hole is not counted as a part on Make", m1.partCount === 1 && /Parts 1 · holes 1/.test(m1.js), m1.js);
  ck("21 the layout is named by parts, not shapes", /Layout \(1 part\)/.test(m1.name) && !/shapes/.test(m1.name), m1.name);
  await T(page, "window.plasmaTest.sendToCutting()"); await sleep(900);
  const c1 = await read(); agree("bed: same plate", c1);
  ck("21 Make and the bed agree", m1.partCount === c1.partCount);
  await T(page, "(() => { const t = window.plasmaTest; t.showScreen('make'); t.setShapeFs(false); t.sketch.clear(); t.sketch.add('rect'); t.sketch.add('disc'); t.sketch.add('hole'); })()"); await sleep(600);
  const m2 = await read(); agree("Make: plate + disc + hole", m2);
  await T(page, "window.plasmaTest.sendToCutting()"); await sleep(900);
  const c2 = await read(); agree("bed: plate + disc + hole", c2); ck("21 Make and the bed agree (2 parts)", m2.partCount === 2 && c2.partCount === 2);
  const cap = await T(page, "window.plasmaTest.sketch.partTotal()");
  ck("21 the preview caption counts parts", cap === 2);
  await page.context().close();
  // imported layouts
  for (const f of ["plate.dxf", "inch.dxf", "batch20/part01.dxf"]) {
    const p2 = await open(br, "laptop", s.base, "?test=1&turn=0");
    await cutFile(p2, D + f);
    const r = await T(p2, `(() => { const g = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\\s+/g, " ") : ""; }; const num = (re, s) => { const m = re.exec(s); return m ? Number(m[1]) : null; }; const k = window.plasmaTest.sketch; return { n: window.plasmaTest.Setup.partCount(k), stats: num(/Parts (\\d+)/, g("#jobStats")), bed: num(/(\\d+) part/, g("#bedStatusText")), layout: num(/(\\d+) part/, g("#layoutState")), summary: window.plasmaTest.S.prepared.summary.parts, name: k.name() }; })()`);
    ck(`21 imported ${f}: summary, layout line, bed line and header all say ${r.n}`, r.n >= 1 && r.stats === r.n && r.bed === r.n && r.layout === r.n && r.summary === r.n, JSON.stringify(r));
    await p2.context().close();
  }
  // add more drawings to the sheet: the count follows
  const p3 = await open(br, "laptop", s.base, "?test=1&turn=0");
  await cutFile(p3, D + "plate.dxf");
  const before = await T(p3, "window.plasmaTest.Setup.partCount(window.plasmaTest.sketch)");
  await T(p3, "(() => { window.plasmaTest.goStep(3); })()"); await sleep(300);
  await T(p3, "window.plasmaTest.addPartsFlow()"); await sleep(400);
  await p3.setInputFiles("#addFiles", [D + "inch.dxf"]); await sleep(1200);
  await T(p3, "(() => { const b = document.querySelector('#addGo, #addOk, [data-add-go]'); if (b && !b.disabled) b.click(); })()"); await sleep(1200);
  const after = await T(p3, `(() => { const g = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\\s+/g, " ") : ""; }; const num = (re, s) => { const m = re.exec(s); return m ? Number(m[1]) : null; }; return { n: window.plasmaTest.Setup.partCount(window.plasmaTest.sketch), stats: num(/Parts (\\d+)/, g("#jobStats")), layout: num(/(\\d+) part/, g("#layoutState")) }; })()`);
  ck("21 adding a drawing to the layout keeps all the counts equal", after.n === after.stats && after.n === after.layout && after.n >= before, JSON.stringify({ before, after }));
  await p3.context().close();
}

// ================================================================== 21 batch import: SVG + open lines
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await T(page, "window.plasmaTest.account.signUp({ email: 'imp@example.com', pin: '123456', display_name: 'Imp', mode: 'beginner' })"); await sleep(400);
  await T(page, "window.plasmaTest.openImport()"); await sleep(400);
  const copy = await T(page, "document.getElementById('importDlg').innerText.replace(/\\s+/g, ' ')");
  ck("21 the import dialog now says DXF or SVG", /Import DXF \/ SVG/.test(copy) && /DXF or SVG/.test(copy) && !/Choose DXF files/.test(copy), copy.slice(0, 200));
  ck("21 the file picker accepts .svg", await T(page, "/\\.svg/.test(document.getElementById('impFiles').accept)"));
  await page.setInputFiles("#impFiles", [D + "r5/rect.svg", D + "r5/lines-only.svg", D + "r5/open-lines.dxf", D + "r5/mixed.svg", D + "r5/note.txt", D + "plate.dxf"]); await sleep(2500);
  const rows = await T(page, "[...document.querySelectorAll('#impList .improw')].map((r) => ({ name: r.querySelector('b').textContent, bad: r.classList.contains('bad'), text: r.innerText.replace(/\\s+/g, ' ') }))");
  const by = (n) => rows.find((r) => r.name === n) || { text: "", bad: false };
  ck("21 an SVG imports in batch (size read, no error)", !by("rect").bad && /100 × 50 mm/.test(by("rect").text), by("rect").text);
  ck("21 an SVG with only open lines is refused in plain words", by("lines-only").bad && /only 2 loose lines that don't join up into a closed shape/.test(by("lines-only").text) && /nothing to cut round/.test(by("lines-only").text) && !/closed shapes to cut were found/.test(by("lines-only").text), by("lines-only").text);
  ck("21 a DXF of open lines gets the same plain explanation, with what to do", by("open-lines").bad && /loose line/.test(by("open-lines").text) && /Close, Join/.test(by("open-lines").text), by("open-lines").text);
  ck("21 a drawing with a closed outline and a loose line imports, with a warning next to it", !by("mixed").bad && /1 loose line .*doesn't join up/.test(by("mixed").text) && /cut exactly on the line/.test(by("mixed").text), by("mixed").text);
  ck("21 a file that isn't a drawing says only DXF or SVG", by("note").bad && /Only DXF or SVG drawings/.test(by("note").text), by("note").text);
  ck("21 normal DXF files are unaffected", !by("plate").bad && !/loose/.test(by("plate").text), by("plate").text);
  await page.evaluate(() => document.getElementById("impList").scrollIntoView({ block: "start" }));
  await snap(page, "import-svg-open-lines-laptop");
  await page.context().close();
}

// ================================================================== 21 first job = practice run (signed-in users)
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" });
  ck("21 (guest/test mode) Practice is not forced on", await T(page, "!document.getElementById('dryRun').checked"));
  await page.context().close();
  const ctx = await br.newContext({ ...VIEWS.laptop }); const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(String(e))); p.on("dialog", (d) => d.accept());
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await p.goto(s.base + "/?test=1&turn=0"); await p.waitForFunction(() => window.plasmaTest);
  await T(p, "window.plasmaTest.account.signUp({ email: 'first@example.com', pin: '123456', display_name: 'First', mode: 'beginner' })"); await sleep(400);
  await demoToShape(p, { stay: "make" });
  await T(p, "window.plasmaTest.showScreen('cut')"); await sleep(600);
  ck("21 a signed-in user with no job yet: Practice run is ticked", await T(p, "document.getElementById('dryRun').checked"));
  ck("21 ...and told why, next to the box", await T(p, "(() => { const n = document.getElementById('dryFirstNote'); return !n.classList.contains('hidden') && /first job/.test(n.textContent); })()"));
  await T(p, "window.plasmaTest.goStep(3)"); await sleep(400);
  await T(p, "(() => { const c = document.getElementById('dryRun'); c.scrollIntoView({ block: 'center' }); })()");
  await snap(p, "first-job-practice-default-laptop");
  // untick: it stays unticked (their choice)
  await T(p, "(() => { const c = document.getElementById('dryRun'); c.checked = false; c.dispatchEvent(new Event('change')); window.plasmaTest.showScreen('menu'); window.plasmaTest.showScreen('cut'); })()"); await sleep(500);
  ck("21 unticking sticks until the first job has started", !(await T(p, "document.getElementById('dryRun').checked")));
  // run the first job (demo): afterwards the flag is set and later visits don't re-tick it
  await T(p, "window.plasmaTest.demoEdges()"); await sleep(6000);
  await T(p, "window.plasmaTest.goStep(3)"); await sleep(400);
  await T(p, "(() => { document.getElementById('btnZero').click(); })()"); await sleep(500);
  await T(p, "(() => { document.querySelectorAll('#checklist input').forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById('checklist').dispatchEvent(new Event('change')); })()"); await sleep(300);
  await T(p, "document.getElementById('btnStart').click()"); await sleep(1200);
  const key = await T(p, "Object.keys(localStorage).filter((k) => k.startsWith('plasma.firstJobDone.'))");
  ck("21 starting a job records that the first job is done", key.length === 1 && (await T(p, `localStorage.getItem(${JSON.stringify(key[0])})`)) === "1", JSON.stringify(key));
  await T(p, "window.plasmaTest.estopPress('space')"); await sleep(800);
  await ctx.close();
  // a fresh page for the same account after the first job: not ticked
  const ctx2 = await br.newContext({ ...VIEWS.laptop }); const q = await ctx2.newPage(); q.on("dialog", (d) => d.accept());
  await ctx2.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await q.goto(s.base + "/?test=1&turn=0"); await q.waitForFunction(() => window.plasmaTest);
  await T(q, "window.plasmaTest.account.signUp({ email: 'second@example.com', pin: '123456', display_name: 'Second', mode: 'beginner' })"); await sleep(300);
  await T(q, "localStorage.setItem('plasma.firstJobDone.' + (window.plasmaTest.account.currentUser().id || window.plasmaTest.account.currentUser().email || 'user'), '1')");
  await demoToShape(q, { stay: "make" }); await T(q, "window.plasmaTest.showScreen('cut')"); await sleep(500);
  ck("21 a user who has already started a job gets Practice off by default", !(await T(q, "document.getElementById('dryRun').checked")));
  await ctx2.close();
}

// ================================================================== 22 polygon -> disc
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  const r = await T(page, `(() => { const t = window.plasmaTest, k = t.sketch; t.showScreen("make"); t.setShapeFs(false); k.clear(); k.add("polygon"); const it = k.items[0]; k.pick([it.id]); const b0 = k.boxOf(it); const msgs = []; const old = k.onMessage; k.onMessage = (m) => { msgs.push(m); old(m); }; const v = k.variants().find((x) => x.id === "disc"); k.applyVariant(v); const it2 = k.selected(); const b1 = k.boxOf(it2); return { type: it2.type, b0: [b0[2] - b0[0], b0[3] - b0[1]], b1: [b1[2] - b1[0], b1[3] - b1[1]], pos0: [b0[0], b0[1]], pos1: [b1[0], b1[1]], msgs }; })()`);
  const big = Math.max(...r.b0);
  ck("22 polygon -> disc gives a true circle the size of the polygon's larger side", r.type === "disc" && Math.abs(r.b1[0] - r.b1[1]) < 0.05 && Math.abs(r.b1[0] - big) < 0.25, JSON.stringify(r));
  ck("22 it keeps its place (bottom-left)", Math.abs(r.pos1[0] - r.pos0[0]) < 0.25 && Math.abs(r.pos1[1] - r.pos0[1]) < 0.25);
  ck("22 and says why the size changed", r.msgs.some((m) => /same size both ways/.test(m) && /larger size/.test(m)), JSON.stringify(r.msgs));
  const r2 = await T(page, `(() => { const k = window.plasmaTest.sketch; k.clear(); k.add("rect"); const it = k.items[0]; k.pick([it.id]); const msgs = []; k.onMessage = (m) => msgs.push(m); const v = k.variants().find((x) => x.label === "Rounded"); if (v) k.applyVariant(v); return msgs.length; })()`);
  ck("22 other variants (rect -> rounded) stay quiet", r2 === 0, String(r2));
  await page.context().close();
}

// ================================================================== 23 operator row for the decimal keypad
{
  const ctx = await br.newContext({ ...VIEWS.phone }); const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e))); page.on("dialog", (d) => d.accept());
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/?test=1&turn=0"); await page.waitForFunction(() => window.plasmaTest);
  await T(page, "(() => { const t = window.plasmaTest, k = t.sketch; t.setAppMode('pro'); t.showScreen('make'); t.setShapeFs(false); k.clear(); k.add('rect'); k.pick([k.items[0].id]); k.draw(); })()"); await sleep(500);
  const open_ = await T(page, "(() => { const k = window.plasmaTest.sketch; k.draw(); const h = k.dimHits.find((x) => /w|width/i.test(x.kind)) || k.dimHits[0]; window.plasmaTest.openDimEdit(h); return h && h.kind; })()"); await sleep(400);
  const ui = await T(page, `(() => { const row = document.getElementById("dimOps"); const inp = document.getElementById("dimEditInput"); const r = row.getBoundingClientRect(); return { show: getComputedStyle(row).display !== "none" && r.height >= 40, keys: [...row.querySelectorAll("button")].map((b) => b.textContent.trim()), inputmode: inp.getAttribute("inputmode"), onScreen: r.bottom <= innerHeight && r.right <= innerWidth, minH: Math.min(...[...row.querySelectorAll("button")].map((b) => b.getBoundingClientRect().height)) }; })()`);
  ck("23 on a phone the maths keys + − × ÷ ( ) and OK show under the size box", ui.show && ["+", "−", "×", "÷", "(", ")", "OK"].every((k) => ui.keys.includes(k)), JSON.stringify(ui));
  ck("23 the keys are big enough to tap (44 px) and on screen", ui.minH >= 40 && ui.onScreen, JSON.stringify(ui));
  await snap(page, "dim-operator-row-phone");
  const tap = async (label) => { await page.locator(`#dimOps button:has-text("${label}")`).first().tap(); await sleep(60); };
  await T(page, "(() => { const i = document.getElementById('dimEditInput'); i.focus(); i.value = ''; })()");
  await page.keyboard.type("100"); await tap("÷"); await page.keyboard.type("2"); await tap("+"); await page.keyboard.type("5");
  const typed = await T(page, "document.getElementById('dimEditInput').value");
  ck("23 100 ÷ 2 + 5 can be typed with the keypad plus the row (inserts / and +)", typed === "100/2+5", typed);
  ck("23 the box keeps focus (the keypad stays up)", await T(page, "document.activeElement.id === 'dimEditInput'"));
  await tap("OK"); await sleep(400);
  const w = await T(page, "(() => { const k = window.plasmaTest.sketch, it = k.items[0], b = k.boxOf(it); return { w: Math.round((b[2] - b[0]) * 10) / 10, open: !document.getElementById('dimEdit').classList.contains('hidden') }; })()");
  ck("23 OK applies it: 100/2+5 = 55 mm, box closes", w.w === 55 && !w.open, JSON.stringify(w));
  // insert in the middle
  await T(page, "(() => { const k = window.plasmaTest.sketch; k.draw(); window.plasmaTest.openDimEdit(k.dimHits[0]); })()"); await sleep(300);
  await T(page, "(() => { const i = document.getElementById('dimEditInput'); i.value = '30 10'; i.focus(); i.setSelectionRange(2, 2); })()");
  await tap("+");
  ck("23 an operator goes in at the cursor", (await T(page, "document.getElementById('dimEditInput').value")) === "30+ 10" || (await T(page, "document.getElementById('dimEditInput').value")) === "30+ 10".replace(" ", ""), await T(page, "document.getElementById('dimEditInput').value"));
  await ctx.close();
  const lp = await open(br, "laptop", s.base, "?test=1&turn=0");
  await T(lp, "(() => { const k = window.plasmaTest.sketch; window.plasmaTest.setAppMode('pro'); window.plasmaTest.showScreen('make'); window.plasmaTest.setShapeFs(false); k.clear(); k.add('rect'); k.pick([k.items[0].id]); k.draw(); window.plasmaTest.openDimEdit(k.dimHits[0]); })()"); await sleep(300);
  ck("23 with a mouse and keyboard the row stays out of the way", await T(lp, "getComputedStyle(document.getElementById('dimOps')).display === 'none'"));
  await lp.context().close();
}

// ================================================================== 24 hole selected + no Turn it for circles
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  const form = () => T(page, "[...document.querySelectorAll('#shapeForm button[data-sk=\"rotateBy\"]')].length");
  const sel = () => T(page, "(() => { const it = window.plasmaTest.sketch.selected(); return it && it.type; })()");
  await T(page, "(() => { const t = window.plasmaTest; t.showScreen('make'); t.setShapeFs(false); t.sketch.clear(); t.sketch.add('rect'); })()"); await sleep(400);
  ck("24 a rectangle still has Turn it", (await form()) === 1);
  await page.locator('#shapeForm [data-sk="add"][data-arg="hole"]').click(); await sleep(500);
  ck("24 'Add a hole' leaves the new hole selected", (await sel()) === "hole");
  ck("24 ...its form is showing (Diameter) and the hole is highlighted", /Diameter/.test(await T(page, "document.getElementById('shapeForm').innerText")) && (await T(page, "window.plasmaTest.sketch.sel.ids.length")) === 1);
  ck("24 no 'Turn it' on the hole (a circle)", (await form()) === 0 && !/Turn it/.test(await T(page, "document.getElementById('shapeForm').innerText")));
  await snap(page, "hole-selected-no-turn-laptop");
  for (const id of ["slothole", "cornerholes", "holerow", "boltcircle", "holegrid"]) {
    await T(page, "(() => { const k = window.plasmaTest.sketch; k.pick([k.items.find((i) => i.type === 'rect').id]); k.onSelect(); })()");
    const b = page.locator(`#shapeForm [data-sk="add"][data-arg="${id}"]`);
    if (await b.count()) { await b.click(); await sleep(250); ck(`24 '${id}' leaves the new holes selected`, (await sel()) === id); }
  }
  for (const type of ["disc", "ring"]) {
    await T(page, `(() => { const k = window.plasmaTest.sketch; k.clear(); k.add('${type}'); })()`); await sleep(300);
    ck(`24 no 'Turn it' for a ${type}`, (await form()) === 0);
  }
  await T(page, "(() => { const k = window.plasmaTest.sketch; k.clear(); k.add('ellipse'); })()"); await sleep(300);
  ck("24 an ellipse can still be turned", (await form()) === 1);
  await T(page, "window.plasmaTest.setAppMode('pro')"); await sleep(300);
  await T(page, "(() => { const k = window.plasmaTest.sketch; k.clear(); k.add('rect'); k.add('disc'); })()"); await sleep(300);
  ck("24 Pro: no Turn 90° for a selected circle", (await form()) === 0);
  await T(page, "(() => { const k = window.plasmaTest.sketch; k.pick([k.items[0].id]); k.onSelect(); })()"); await sleep(300);
  ck("24 Pro: a rectangle still has Turn 90°", (await form()) === 1);
  await T(page, "(() => { window.plasmaTest.sketch.add('hole'); })()"); await sleep(300);
  ck("24 Pro: a hole added from the toolbar is selected", (await sel()) === "hole");
  await page.context().close();
}

// ================================================================== 25 deploy workflow
{
  const wf = fs.readdirSync(REPO + "/.github/workflows").filter((f) => /\.ya?ml$/.test(f));
  const txt = wf.map((f) => fs.readFileSync(REPO + "/.github/workflows/" + f, "utf8")).join("\n");
  ck("25 a Pages deploy workflow exists", wf.length >= 1 && /deploy-pages/.test(txt) && /upload-pages-artifact/.test(txt), wf.join(","));
  ck("25 it runs scripts/stamp-version.sh before the artifact is uploaded", /scripts\/stamp-version\.sh/.test(txt) && txt.indexOf("stamp-version.sh") < txt.indexOf("upload-pages-artifact"));
  ck("25 it deploys on pushes to main", /branches:\s*\[\s*main\s*\]|branches:\s*\n\s*-\s*main/.test(txt));
  ck("25 it has the permissions Pages needs", /pages:\s*write/.test(txt) && /id-token:\s*write/.test(txt));
}


await br.close(); s.close();
console.log(`\n52_bug_regressions: ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
