// Round 5 features 35-37: live torch/arc panel + lost-arc resume, saved work origins + 9-point job origin, cut-test coupon + pierce counter.
// Part A is pure logic (no browser). Part B drives the practice (demo) machine only. Needs PR #4's tests/lib. Screenshots: SHOTS (default /workspace/b5-features-shots/).
import { serve, open, launch, prime, zeroAndTick, waitCut, hook, tx, sleep, T, holdBtn } from "./_cf_helpers.mjs";
import { T as Rec } from "../lib/t.mjs"; import fs from "node:fs";
const SHOTS = process.env.SHOTS || "/workspace/b5-features-shots/"; fs.mkdirSync(SHOTS, { recursive: true });
const rec = new Rec("56_cut_features");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const J = new URL("../../js/", import.meta.url).href;
const { parseStatus, parseThc } = await import(J + "grbl.js");
const CL = await import(J + "cutlive.js"), OR = await import(J + "origins.js"), CP = await import(J + "coupon.js");
const mem = () => { const d = {}; return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; };

// ================================================================== A. pure logic
{
  const t = parseStatus("Run|MPos:1,2,3|FS:100,0|THC:112.4,AT");
  ck("A35 THC field parsed: volts, arc OK, torch on", t.thc && t.thc.volts === 112.4 && t.thc.arcOk === true && t.thc.torchOn === true, t.thc);
  ck("A35 no THC field = no thc object (nothing invented)", parseStatus("Idle|MPos:1,2,3|FS:0,0").thc === undefined);
  ck("A35 junk THC value is ignored", parseThc("abc,A") === null);
  ck("A35 THC without flags = arc not OK", parseThc("0.0").arcOk === false);

  const w = new CL.ArcWatch(), st = (thc, torch = true) => ({ torch, thc });
  let now = 1000;
  w.update(st({ volts: 0, arcOk: false }), now, true, 2); w.update(st({ volts: 118, arcOk: true }), now += 100, true, 2);
  ck("A35 arc OK seen: not lost", !w.lost && w.arcSeen);
  w.update(st({ volts: 0, arcOk: false }), now += 100, true, 2);
  ck("A35 a 100 ms blip is not a lost arc", !w.lost);
  w.update(st({ volts: 118, arcOk: true }), now += 100, true, 2); w.update(st({ volts: 0, arcOk: false }), now += 100, true, 2); w.update(st({ volts: 0, arcOk: false }), now += CL.ARC_DROP_MS + 10, true, 2);
  ck("A35 arc gone for 400 ms while the torch is on = lost, on the right cut", w.lost && w.lost.cut === 2, w.lost);
  const w2 = new CL.ArcWatch(); w2.update(st({ volts: 0, arcOk: false }), 0, true, 1); w2.update(st({ volts: 0, arcOk: false }), CL.ARC_WAIT_MS + 5, true, 1);
  ck("A35 torch on 8 s and never an arc OK = lost", !!w2.lost);
  const w3 = new CL.ArcWatch(); w3.update(st({ volts: 0, arcOk: false }, false), 0, true, 1); w3.update(st({ volts: 0, arcOk: false }, false), 99999, true, 1);
  ck("A35 torch off: never a lost arc", !w3.lost);
  const w4 = new CL.ArcWatch(); w4.update({ torch: true }, 0, true, 1); w4.update({ torch: true }, 99999, true, 1);
  ck("A35 no THC report from the controller: never judged (not connected)", !w4.lost && !w4.thcSeen);
  const w5 = new CL.ArcWatch(); ck("A35 the controller's own 'arc failed' message = lost", w5.noteMessage("[MSG:Warning: arc failed]", 5, 3) && w5.lost.cut === 3);
  ck("A35 unrelated messages are ignored", !new CL.ArcWatch().noteMessage("[MSG:Pgm End]"));
  ck("A35 cutNumber: resumed run counts from the start cut", CL.cutNumber(4, 2, 9) === 5 && CL.cutNumber(undefined, 0, 9) === 1);
  const pr = CL.parseProbeLine("[PRB:10.000,20.000,-38.500:1]"); ck("A35 probe line parsed", pr && pr.z === -38.5 && pr.ok);
  { const pw = new CL.ArcWatch(); pw.noteProbe("[PRB:0,0,-1:0]"); ck("A35 failed probe line is not a touch-off", pw.probe === null); pw.noteProbe("[PRB:0,0,-9:1]"); ck("A35 good probe line is remembered", pw.probe && pw.probe.z === -9); }
  const off = CL.liveView(new CL.ArcWatch(), null, { connected: false });
  ck("A35 disconnected: every reading says not connected", [off.arc, off.volts, off.height].every((c) => c.text === "not connected"));
  const noThc = CL.liveView(new CL.ArcWatch(), { torch: true, MPos: [0, 0, -5], WPos: [0, 0, -5] }, { connected: true, demo: false, switchOffset: 1.5 });
  ck("A35 connected but no THC report: arc OK and volts say not connected, Z is the reported Z", noThc.arc.text === "not connected" && noThc.volts.text === "not connected" && /Z -5\.0 mm/.test(noThc.height.text), noThc);
}
{ // 9-point origin maths: bounds [10,20,110,70] (100 x 50)
  const b = [10, 20, 110, 70], exp = { tl: [10, 70], tc: [60, 70], tr: [110, 70], ml: [10, 45], c: [60, 45], mr: [110, 45], bl: [10, 20], bc: [60, 20], br: [110, 20] };
  for (const a of OR.ANCHORS) { const p = OR.anchorPoint(b, a.id), s = OR.anchorShift(b, a.id); ck(`A36 anchor ${a.id}: point ${exp[a.id]} and the shift puts it at 0,0`, p[0] === exp[a.id][0] && p[1] === exp[a.id][1] && p[0] + s[0] === 0 && p[1] + s[1] === 0, { p, s }); }
  const g = "(job: X10 Y20)\nG21 G90\nG0 X10 Y20\nG1 X110.5 Y20 F1000 ; X5 in comment\nG2 X110 Y70 I-50 J25\nG91\nG1 X1 Y1\nG90\nG53 G0 X0 Y0\nG10 L20 P1 X0 Y0\nG0Z5\nM3 S1000\nG0X1.5Y2";
  const r = OR.shiftGcode(g, -60, -45).text.split("\n");
  ck("A36 shift: comments untouched", r[0] === g.split("\n")[0] && /; X5 in comment/.test(r[3]));
  ck("A36 shift: absolute X/Y moved", r[2] === "G0 X-50 Y-25" && /^G1 X50\.5 Y-25 F1000/.test(r[3]), r.slice(2, 4));
  ck("A36 shift: arc end moves, centre offsets I/J do not", r[4] === "G2 X50 Y25 I-50 J25", r[4]);
  ck("A36 shift: relative (G91) moves, G53, G10 untouched", r[6] === "G1 X1 Y1" && r[8] === "G53 G0 X0 Y0" && r[9].startsWith("G10 L20"), r);
  ck("A36 shift: Z / feed / M-codes untouched and glued words handled", r[10] === "G0Z5" && r[11] === "M3 S1000" && r[12] === "G0X-58.5Y-43", r.slice(10));
  const s = mem(); OR.saveOrigin(s, { name: "  Left   clamp ", x: 12.3456, y: 40 }); OR.saveOrigin(s, { name: "Right", x: 1000, y: 2 });
  ck("A36 store: names cleaned, saved, listed", OR.loadOrigins(s).length === 2 && OR.loadOrigins(s)[0].name === "Left clamp" && OR.loadOrigins(s)[0].x === 12.346);
  OR.saveOrigin(s, { name: "left CLAMP", x: 1, y: 2 }); ck("A36 store: same name replaces", OR.loadOrigins(s).length === 2 && OR.loadOrigins(s)[0].x === 1);
  let e = ""; try { OR.saveOrigin(s, { name: "   ", x: 1, y: 1 }); } catch (x) { e = x.message; } ck("A36 store: empty name refused", /name/i.test(e), e);
  e = ""; try { OR.saveOrigin(s, { name: "bad", x: NaN, y: 1 }); } catch (x) { e = x.message; } ck("A36 store: NaN position refused", !!e, e);
  OR.deleteOrigin(s, OR.loadOrigins(s)[0].id); ck("A36 store: delete", OR.loadOrigins(s).length === 1 && OR.loadOrigins(s)[0].name === "Right");
  s.setItem(OR.ORIGINS_KEY, "{not json"); ck("A36 store: corrupt data = empty list, no crash", OR.loadOrigins(s).length === 0);
  s.setItem(OR.ORIGINS_KEY, JSON.stringify([{ name: "<img onerror=x>", x: 1, y: 2 }, { name: "ok", x: "a", y: 2 }])); ck("A36 store: bad rows dropped", OR.loadOrigins(s).length === 1);
}
{ // coupon + pierce counter
  const c = CP.couponContours(3), xs = c[0].pts.map((p) => p[0] ?? p.x), ys = c[0].pts.map((p) => p[1] ?? p.y);
  ck("A37 coupon is 60 x 40 mm with a hole", Math.max(...xs) - Math.min(...xs) === 60 && Math.max(...ys) - Math.min(...ys) === 40 && c.length === 2);
  ck("A37 hole follows thickness (1.5x, 6..14 mm)", CP.couponHole(1) === 6 && CP.couponHole(6) === 9 && CP.couponHole(20) === 14);
  const base = { material: "Mild steel", thickness: 3, row: { amps: 45, pierce_delay_s: 0.6, pierce_height_mm: 3.8, kerf_mm: 1.5 }, usedSpeed: 2000, now: new Date("2026-11-11T10:00:00Z") };
  const r = CP.couponPresetRow({ ...base, result: "dross", speed: "1800", amps: "50" });
  ck("A37 write-back row: tweak applied, notes say what happened", r.cut_speed_mm_min === 1800 && r.amps === 50 && /2026-11-11: dross/.test(r.notes) && /speed 2000 -> 1800/.test(r.notes) && /45 -> 50 A/.test(r.notes), r);
  const g = CP.couponPresetRow({ ...base, result: "good" }); ck("A37 no tweak keeps the used speed and chart amps", g.cut_speed_mm_min === 2000 && g.amps === 45 && !/changed/.test(g.notes), g);
  for (const [n, a] of [["speed 5", { speed: "5" }], ["speed 99999", { speed: "99999" }], ["amps 4", { amps: "4" }], ["no result", { result: "" }]]) { let m = ""; try { CP.couponPresetRow({ ...base, result: "good", ...a }); } catch (x) { m = x.message; } ck(`A37 refused: ${n}`, !!m, m); }
  const s = mem(), pc = new CP.PierceCounter(s);
  for (const t of [false, true, true, false, true, false]) pc.feed({ torch: t }, { running: true, jobRef: "a" });
  ck("A37 pierces: counts torch-on edges, 2 this job, 2 lifetime", pc.job === 2 && pc.lifetime === 2);
  pc.feed({ torch: true }, { running: false, jobRef: "a" }); pc.feed({ torch: false }, { running: false }); pc.feed({ torch: true }, { running: false });
  ck("A37 pierces: torch tests outside a job are not counted", pc.job === 2 && pc.lifetime === 2);
  pc.feed({ torch: false }, { running: true, jobRef: "b" }); pc.feed({ torch: true }, { running: true, jobRef: "b" });
  ck("A37 pierces: a new job resets the job count, lifetime keeps going", pc.job === 1 && pc.lifetime === 3);
  pc.feed({ torch: false }, { running: true, jobRef: "c", demo: true }); pc.feed({ torch: true }, { running: true, jobRef: "c", demo: true });
  ck("A37 pierces: practice runs count for the job, never for the lifetime total", pc.job === 1 && pc.lifetime === 3);
  ck("A37 pierces: lifetime survives a reload (stored locally)", new CP.PierceCounter(s).lifetime === 3 && !!s.d[CP.PIERCE_KEY]);
  s.setItem(CP.PIERCE_KEY, "garbage"); ck("A37 pierces: corrupt storage = 0, no crash", new CP.PierceCounter(s).lifetime === 0);
}

// ================================================================== B. in the app (practice machine)
const s = await serve(), br = await launch();
const errs = []; const watchPage = (page) => { page.on("pageerror", (e) => errs.push(String(e))); page.on("dialog", (d) => { page._dlg = d.message(); }); };
const shot = async (page, name) => { await T(page, "(() => { const t = document.getElementById('toast'); if (t && !window.__keepToast) t.classList.add('hidden'); })()"); await sleep(150); await page.screenshot({ path: SHOTS + name + ".png" }); };
const unlockHome = async (page) => { await T(page, "window.plasmaTest.getM().command({ cmd: 'unlock' })"); await sleep(600); await T(page, "window.plasmaTest.getM().command({ cmd: 'home' })"); const t0 = Date.now(); while (Date.now() - t0 < 30000) { if (await T(page, "window.plasmaTest.getM().state() === 'Idle' && window.plasmaTest.S.safety.referenced")) break; await sleep(300); } await sleep(1500); };
const panel = (page) => T(page, "[...document.querySelectorAll('#livePanel .lp')].map((e) => e.querySelector('b').textContent)");
const vis = (page, id) => T(page, `(() => { const e = document.getElementById('${id}'); return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; })()`);

{ // ---------- 35 + resume, laptop
  const page = await open(br, "laptop", s.base, "?test=1&turn=0"); watchPage(page);
  await prime(page); await zeroAndTick(page); await hook(page);
  await T(page, "document.getElementById('dryRun').checked = false; document.getElementById('dryRun').dispatchEvent(new Event('change', { bubbles: true }))"); await sleep(300);
  await page.click("#btnStart"); await sleep(800); ck("35 job started", await T(page, "window.plasmaTest.getM().jobRunning()"));
  await waitCut(page, 1); await sleep(1500);
  let p = await panel(page);
  ck("35 live panel visible on the cutting screen", await vis(page, "livePanel"));
  ck("35 arc OK / volts / height read from the status report", p[0] === "ARC OK" && /^\d+\.\d V/.test(p[1]) && /mm/.test(p[2]), p);
  ck("35 practice readings say they are demo", /demo/.test(p[1]) && /demo/.test(p[2]), p);
  ck("35 pierce counter: 1+ this job; practice not in the lifetime total", /^[12] of \d+ this job · 0 total/.test(p[3]), p[3]);
  ck("35 lost-arc box hidden while the arc is fine", !(await vis(page, "lostArc")));
  await shot(page, "laptop-1366x768-cut-live-panel");
  // the arc drops during the 2nd cut (the demo machine pretends the plasma plugin reported it)
  await waitCut(page, 2); await sleep(1200);
  await T(page, "window.plasmaTest.S.demo.demoLoseArc(true)"); await sleep(1500);
  ck("35 arc lost: box appears naming cut 2", await vis(page, "lostArc") && /cut 2\./.test(await T(page, "document.getElementById('lostArcHead').textContent")), await T(page, "document.getElementById('lostArcHead').textContent"));
  p = await panel(page); ck("35 arc cell shows ARC LOST", p[0] === "ARC LOST", p);
  ck("35 while the job is still running, Continue is disabled and the text says STOP", await T(page, "document.getElementById('btnLostResume').disabled") && /STOP/.test(await T(page, "document.getElementById('lostArcText').textContent")));
  const tx0 = (await tx(page)).length;
  await shot(page, "laptop-1366x768-cut-lost-arc");
  ck("35 nothing was sent by the lost-arc box itself (no auto restart, no torch command)", !/M3|M4/.test((await tx(page)).slice(tx0)));
  await page.keyboard.press("Space"); await sleep(1200);
  ck("35 Space = STOP latched the E-stop and the job ended", await T(page, "window.plasmaTest.estopOn()") && !(await T(page, "window.plasmaTest.getM().jobRunning()")));
  ck("35 the box stays after the stop and Continue is now enabled", (await vis(page, "lostArc")) && !(await T(page, "document.getElementById('btnLostResume').disabled")));
  const nBefore = await T(page, "window.plasmaTest.CF.h.watch.lost.cut");
  page._dlg = ""; await page.click("#btnLostResume"); await sleep(600);
  ck("35 Continue asks for explicit confirmation first, and says nothing starts now", /Nothing starts now/.test(page._dlg || "") && new RegExp("cut " + nBefore).test(page._dlg), page._dlg);
  ck("35 Continue goes to Bed & start with the cut chosen", await T(page, "window.plasmaTest.S.cur") === 3 && await T(page, "window.plasmaTest.S.startCut") === nBefore, await T(page, "[window.plasmaTest.S.cur, window.plasmaTest.S.startCut]"));
  ck("35 work zero is NOT set after the stop: Start here required", !(await T(page, "window.plasmaTest.S.zeroSet")) && !(await T(page, "!document.getElementById('btnStart').disabled")));
  const t1 = await tx(page); ck("35 still no torch command sent", !/M3|M4/.test(t1.slice(tx0)));
  // E-stop must be released by press-and-hold before anything can move or fire
  let thrown = await T(page, "(() => { try { window.plasmaTest.getM().command({ cmd: 'zero_xy' }); return null; } catch (e) { return e.message; } })()");
  ck("35 Start here is refused while the E-stop is latched", /E-STOP is ON/.test(thrown || ""), thrown);
  await holdBtn(page, 1800); ck("35 hold released the E-stop", !(await T(page, "window.plasmaTest.estopOn()")));
  ck("35 releasing the E-stop did not bring work zero back", !(await T(page, "window.plasmaTest.S.zeroSet")));
  ck("35 a stop in motion leaves the machine in Alarm (as on the real controller): unlock + Home needed", await T(page, "window.plasmaTest.getM().state()") === "Alarm");
  await unlockHome(page);
  await zeroAndTick(page);
  ck("35 after Start here + ticking the checklist Start is possible again", await T(page, "!document.getElementById('btnStart').disabled"), await T(page, "document.getElementById('blockers').textContent"));
  page._dlg = ""; await page.click("#btnStart"); await sleep(1000);
  ck("35 for a resume after cut 1 the existing Start confirm 'Continue from cut N?' still applies", nBefore === 1 || new RegExp("Continue from cut " + nBefore).test(page._dlg || ""), page._dlg);
  ck("35 the resumed job runs from that cut", await T(page, "window.plasmaTest.getM().runFrom") === nBefore);
  ck("35 lost-arc box cleared by the new job", !(await vis(page, "lostArc")));
  await page.keyboard.press("Space"); await sleep(800);
  // a controller that never sends THC (plain grblHAL / FluidNC / Pi bridge)
  await holdBtn(page, 1800);
  await T(page, "window.plasmaTest.S.demo.thcReport = false; window.plasmaTest.S.demo.arcLost = false"); await sleep(800);
  p = await panel(page);
  ck("35 controller without THC: arc OK and volts say 'not connected'", p[0] === "not connected" && p[1] === "not connected", p);
  ck("35 ... and the page explains why", /doesn't report arc OK/.test(await T(page, "document.getElementById('lpNote').textContent")), await T(page, "document.getElementById('lpNote').textContent"));
  ck("35 ... no invented number in those two cells", !/\d/.test(p[0] + p[1]));
  await T(page, "window.plasmaTest.showScreen && 0"); await shot(page, "laptop-1366x768-cut-not-connected");
  ck("no page errors (35)", errs.length === 0, errs);
  await page.close();
}

const wcoOf = (page) => T(page, "(() => { const st = window.plasmaTest.S.status; return st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : null; })()");
const idle = async (page, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await T(page, "window.plasmaTest.getM().state() === 'Idle'")) { await sleep(250); return true; } await sleep(200); } return false; };
const jog = async (page, axis, dist) => { await T(page, `window.plasmaTest.getM().command({ cmd: 'jog', axis: '${axis}', dist: ${dist} })`); await sleep(500); await idle(page); };
const toastText = (page) => T(page, "(document.getElementById('toast') || {}).textContent || ''");
const near = (a, b, e = 0.02) => a && b && a.length >= 2 && Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e;

{ // ---------- 36: 9-point job origin + saved work origins
  const page = await open(br, "laptop", s.base, "?test=1&turn=0"); watchPage(page);
  await prime(page); await hook(page);
  const bounds = () => T(page, "window.plasmaTest.S.prepared.stats.bounds.slice()");
  const b0 = await bounds(), shift0 = await T(page, "(window.plasmaTest.S.prepared.shift || [0,0]).slice()"), out0 = await T(page, "JSON.stringify(window.plasmaTest.S.prepared.outline && window.plasmaTest.S.prepared.outline[0] && window.plasmaTest.S.prepared.outline[0][0])");
  await T(page, "document.getElementById('originCard').open = true");
  ck("36 the 9-point grid has 9 buttons", await T(page, "document.querySelectorAll('#origin9 button').length") === 9);
  ck("36 default: no button selected, 'Back to default' hidden", await T(page, "document.querySelectorAll('#origin9 button.sel').length") === 0 && !(await vis(page, "originDefault")));
  await zeroAndTick(page);
  let allOk = true; const det = [];
  for (const a of OR.ANCHORS) {
    await T(page, `document.querySelector('#origin9 button[data-anchor="${a.id}"]').click()`); await sleep(250);
    const b = await bounds(), exp = OR.anchorShift(b0, a.id), got = [b[0] - b0[0], b[1] - b0[1]], at = OR.anchorPoint(b, a.id);
    const ok = a.id === "bl" && Math.abs(exp[0]) + Math.abs(exp[1]) < 1e-9 ? true : near(got, exp, 0.01);
    const w = [b[2] - b[0], b[3] - b[1]], w0 = [b0[2] - b0[0], b0[3] - b0[1]];
    const ok2 = Math.abs(at[0]) < 0.01 && Math.abs(at[1]) < 0.01 && Math.abs(w[0] - w0[0]) < 0.01 && Math.abs(w[1] - w0[1]) < 0.01;
    if (!(ok && ok2)) allOk = false; det.push([a.id, exp, got, at]);
  }
  ck("36 G-code offsets: for all 9 anchors the program moved by exactly the anchor shift, size unchanged, and the anchor point is at 0,0", allOk, det);
  await T(page, `document.querySelector('#origin9 button[data-anchor="c"]').click()`); await sleep(300);
  const bc = await bounds();
  ck("36 centre: job box is centred on zero", Math.abs(bc[0] + bc[2]) < 0.02 && Math.abs(bc[1] + bc[3]) < 0.02, bc);
  const sh = await T(page, "window.plasmaTest.S.prepared.shift.slice()"), exp = OR.anchorShift(b0, "c");
  ck("36 preview shift follows the origin (so the picture matches the G-code)", near(sh, [shift0[0] + exp[0], shift0[1] + exp[1]], 0.01), { sh, shift0, exp });
  ck("36 the origin button is marked selected and the help names the spot", await T(page, "document.querySelector('#origin9 button.sel').dataset.anchor") === "c" && /centre/i.test(await T(page, "document.getElementById('originHelp').textContent")));
  ck("36 choosing a job origin clears work zero: Start here is required again", !(await T(page, "window.plasmaTest.S.zeroSet")) && !(await T(page, "window.plasmaTest.getM().zeroConfirmed")) && await T(page, "document.getElementById('btnStart').disabled"));
  const sentG = await T(page, "window.plasmaTest.S.prepared.stats.pierces");
  await jog(page, "X", 400); await jog(page, "Y", 300);       // the job's centre goes at zero, so the torch has to be well inside the machine
  await zeroAndTick(page);
  ck("36 after Start here the job can be started again", await T(page, "!document.getElementById('btnStart').disabled"), await T(page, "document.getElementById('blockers').textContent"));
  await T(page, "document.getElementById('btnZero').scrollIntoView({ block: 'center' })"); await shot(page, "laptop-1366x768-origin-card");
  await T(page, "document.getElementById('originDefault').click()"); await sleep(300);
  ck("36 Back to default restores the original program", near((await bounds()).slice(0, 2), b0.slice(0, 2), 0.001) && !(await T(page, "window.plasmaTest.S.zeroSet")));
  ck("36 default restores the original outline", (await T(page, "JSON.stringify(window.plasmaTest.S.prepared.outline && window.plasmaTest.S.prepared.outline[0] && window.plasmaTest.S.prepared.outline[0][0])")) === out0);
  await T(page, `document.querySelector('#origin9 button[data-anchor="tr"]').click()`); await sleep(250);
  await T(page, "window.plasmaTest.openText && 0"); const nm = await T(page, "window.plasmaTest.S.fileName");
  await T(page, "window.plasmaTest.S.fileName = 'other part'; window.plasmaTest.refresh(); window.plasmaTest.getM().loadJob && 0");
  ck("36 a new file forgets the chosen origin (no surprise offset on the next job)", await T(page, "window.plasmaTest.CF.h.originId()") === null);
  await T(page, `window.plasmaTest.S.fileName = ${JSON.stringify(nm)}`);

  // ----- saved work origins
  await T(page, "document.querySelector('#origin9 button.sel') && document.getElementById('originDefault').click()"); await sleep(300);
  await T(page, "localStorage.removeItem('plasma.origins.v1')"); await T(page, "window.plasmaTest.CF.h.paintOrigin()");
  ck("36 no saved start points yet: the list says so", /No saved/.test(await T(page, "document.getElementById('woList').textContent")));
  await jog(page, "X", 100); await zeroAndTick(page);
  const wA = await wcoOf(page);
  ck("36 save refused with no name", (await T(page, "(() => { document.getElementById('woName').value = ''; document.getElementById('woSave').click(); return document.getElementById('toast').textContent; })()")).length > 0 && (await T(page, "JSON.parse(localStorage.getItem('plasma.origins.v1') || '[]').length")) === 0);
  await page.fill("#woName", "Left clamp"); await page.click("#woSave"); await sleep(300);
  const saved = await T(page, "JSON.parse(localStorage.getItem('plasma.origins.v1') || '[]')");
  const ref = await T(page, "window.plasmaTest.S.safety.ref");
  ck("36 Save stores the start point relative to the home corner", saved.length === 1 && saved[0].name === "Left clamp" && near([saved[0].x, saved[0].y], [wA[0] - ref[0], wA[1] - ref[1]], 0.01), { saved, wA, ref });
  ck("36 the list shows it with Use and Delete", /Left clamp/.test(await T(page, "document.getElementById('woList').textContent")) && await T(page, "document.querySelectorAll('#woList button').length") === 2);
  await jog(page, "X", 80); await jog(page, "Y", 40); await page.click("#btnZero"); await sleep(600);
  const wB = await wcoOf(page); ck("36 (setup) the start point was moved somewhere else", !near(wA, wB, 1), { wA, wB });
  await T(page, "document.querySelector('#woList button[data-wo=recall]').scrollIntoView({ block: 'center' })"); await shot(page, "laptop-1366x768-saved-origins");
  page._dlg = ""; await T(page, "document.querySelector('#woList button[data-wo=recall]').click()"); await sleep(900);
  const wC = await wcoOf(page);
  ck("36 Use asks first, and says the torch does not move", /does NOT move/.test(page._dlg || ""), page._dlg);
  ck("36 Use puts work zero back exactly where it was saved (G10 L2)", near(wC, wA, 0.01), { wA, wB, wC });
  ck("36 ... work zero counts as confirmed, same as Start here", await T(page, "window.plasmaTest.S.zeroSet === true"));
  ck("36 recalling does not start anything", !(await T(page, "window.plasmaTest.getM().jobRunning()")) && !/M0*[34]\b/.test(await tx(page)));
  // after a STOP the zero is cleared, the E-stop blocks recall
  await page.keyboard.press("Space"); await sleep(900);
  ck("36 STOP cleared work zero", !(await T(page, "window.plasmaTest.S.zeroSet")));
  page._dlg = ""; await T(page, "document.querySelector('#woList button[data-wo=recall]').click()"); await sleep(500);
  ck("36 recall is refused while the E-stop is latched (and asks nothing)", !(await T(page, "window.plasmaTest.S.zeroSet")) && /E-STOP/.test(await toastText(page)) && !page._dlg, await toastText(page));
  await holdBtn(page, 1800); await idle(page, 8000);
  ck("36 releasing the E-stop did not bring zero back", !(await T(page, "window.plasmaTest.S.zeroSet")));
  const refAfter = await T(page, "window.plasmaTest.S.safety.referenced");
  page._dlg = ""; await T(page, "document.querySelector('#woList button[data-wo=recall]').click()"); await sleep(700);
  ck("36 recall refused after the stop (not homed), no confirm shown, zero still off", !(await T(page, "window.plasmaTest.S.zeroSet")) && !page._dlg, await toastText(page));
  // after a STOP the controller restarted: the machine no longer knows where it is, so a saved start point can't be trusted until Home
  ck("36 after the STOP the machine's position is unknown (reference lost), so recall stayed refused", refAfter === false);
  await unlockHome(page);
  ck("36 Home clears work zero", !(await T(page, "window.plasmaTest.S.zeroSet")));
  page._dlg = ""; await T(page, "document.querySelector('#woList button[data-wo=recall]').click()"); await sleep(800);
  ck("36 after Home, recall sets work zero again, after an explicit confirm", await T(page, "window.plasmaTest.S.zeroSet === true") && /does NOT move/.test(page._dlg || ""), page._dlg);
  await unlockHome(page);
  // outside the machine: a doctored saved point is refused
  await T(page, "localStorage.setItem('plasma.origins.v1', JSON.stringify([{ id: 'far', name: 'Far away', x: 99000, y: 99000, savedAt: 1 }])); window.plasmaTest.CF.h.paintOrigin()");
  page._dlg = ""; await T(page, "document.querySelector('#woList button[data-wo=recall]').click()"); await sleep(600);
  ck("36 a start point outside the machine's edges is refused, zero unchanged", !(await T(page, "window.plasmaTest.S.zeroSet")) && !page._dlg && /edge|outside|reach|travel/i.test(await toastText(page)), await toastText(page));
  // not referenced
  await unlockHome(page);
  await T(page, "window.plasmaTest.getM().loseReference && window.plasmaTest.getM().loseReference('test')"); await sleep(400);
  await T(page, "localStorage.setItem('plasma.origins.v1', JSON.stringify([{ id: 'a', name: 'Near', x: 10, y: 10, savedAt: 1 }])); window.plasmaTest.CF.h.paintOrigin()");
  page._dlg = ""; await T(page, "document.querySelector('#woList button[data-wo=recall]').click()"); await sleep(600);
  ck("36 position unknown (not homed): recall refused, no zero set", !(await T(page, "window.plasmaTest.S.zeroSet")) && !page._dlg && /Home/i.test(await toastText(page)), await toastText(page));
  // delete
  page._dlg = ""; await T(page, "document.querySelector('#woList button[data-wo=del]').click()"); await sleep(300);
  ck("36 Delete asks, then removes it", /Delete the saved start point/.test(page._dlg || "") && (await T(page, "JSON.parse(localStorage.getItem('plasma.origins.v1') || '[]').length")) === 0);
  ck("no page errors (36)", errs.length === 0, errs);
  await page.close();
}

{ // ---------- 37: cut-test coupon + pierce counter
  const page = await open(br, "laptop", s.base, "?test=1&turn=0"); watchPage(page);
  await prime(page); await hook(page);
  await T(page, "localStorage.removeItem('plasma.cutPresets.local'); localStorage.removeItem('plasma.speeds'); localStorage.removeItem('plasma.pierces.v1')");
  ck("37 a normal part has no coupon marker", !(await T(page, "window.plasmaTest.S.design && window.plasmaTest.S.design.coupon")));
  await T(page, "window.plasmaTest.goStep(1)"); await sleep(300);
  ck("37 the coupon button is on the Part step", await vis(page, "btnCoupon"));
  await shot(page, "laptop-1366x768-coupon-button");
  const tx0 = (await tx(page)).length;
  await T(page, "document.getElementById('btnCoupon').click()"); await sleep(900);
  const mat = await T(page, "[window.plasmaTest.S.material, window.plasmaTest.S.thickness]");
  ck("37 one tap: coupon is on the bed, ready on Bed & start", await T(page, "window.plasmaTest.S.cur") === 3 && await T(page, "!!window.plasmaTest.S.prepared") && await T(page, "window.plasmaTest.S.design.coupon.material") === mat[0]);
  const cb = await T(page, "window.plasmaTest.S.prepared.stats.bounds"), pierceN = await T(page, "window.plasmaTest.S.prepared.stats.pierces");
  ck("37 coupon is about 60 x 40 mm with 2 cuts (hole + outline)", cb[2] - cb[0] > 59 && cb[2] - cb[0] < 66 && cb[3] - cb[1] > 39 && cb[3] - cb[1] < 48 && pierceN === 2, { cb, pierceN });
  ck("37 it never starts by itself: no job, no torch command, Start still needs zero + checklist", !(await T(page, "window.plasmaTest.getM().jobRunning()")) && !/M0*[34]\b/.test((await tx(page)).slice(tx0)) && await T(page, "document.getElementById('btnStart').disabled"));
  ck("37 no result card before the cut", !(await vis(page, "couponResult")));
  await zeroAndTick(page);
  await T(page, "document.getElementById('dryRun').checked = false; document.getElementById('dryRun').dispatchEvent(new Event('change', { bubbles: true }))"); await sleep(300);
  const usedSpeed = await T(page, "window.plasmaTest.S.speed");
  await page.click("#btnStart"); await sleep(800);
  ck("37 coupon job started after the normal Start", await T(page, "window.plasmaTest.getM().jobRunning()"));
  await waitCut(page, 2);
  let t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await vis(page, "done"))) await sleep(400);
  await sleep(600);
  ck("37 job finished", await vis(page, "done"));
  ck("37 pierce counter: 2 this job, practice run adds nothing to the lifetime total", await T(page, "window.plasmaTest.CF.h.pierces.job") === 2 && await T(page, "window.plasmaTest.CF.h.pierces.lifetime") === 0 && !(await T(page, "localStorage.getItem('plasma.pierces.v1')")), await T(page, "[window.plasmaTest.CF.h.pierces.job, window.plasmaTest.CF.h.pierces.lifetime]"));
  ck("37 result card asks how it cut", await vis(page, "couponResult") && await T(page, "document.getElementById('cpSave').disabled"));
  await T(page, "document.getElementById('couponResult').scrollIntoView({ block: 'center' })");
  await T(page, "document.querySelector('#couponResult button[data-res=dross]').click()"); await page.fill("#cpSpeed", "1800"); await page.fill("#cpAmps", "52"); await sleep(200);
  await shot(page, "laptop-1366x768-coupon-result");
  ck("37 pick a result enables Save", await T(page, "!document.getElementById('cpSave').disabled"));
  await page.click("#cpSave"); await sleep(600);
  const pre = await T(page, "JSON.parse(localStorage.getItem('plasma.cutPresets.local') || '[]')");
  const sp = await T(page, "JSON.parse(localStorage.getItem('plasma.speeds') || '{}')");
  ck("37 written to the cut chart entry for this material and thickness", pre.length === 1 && pre[0].material === mat[0] && Number(pre[0].thickness_mm) === Number(mat[1]) && pre[0].cut_speed_mm_min === 1800 && pre[0].amps === 52 && /dross/.test(pre[0].notes) && /speed/.test(pre[0].notes), pre);
  ck("37 the speed the app uses next time is the new one", Object.values(sp).includes(1800) && await T(page, "window.plasmaTest.S.speed") === 1800, { sp, usedSpeed });
  ck("37 the plasma-amps card now shows the tweaked amps", /52 A/.test(await T(page, "document.getElementById('ampsCard').textContent")));
  ck("37 the result card closes after saving", !(await vis(page, "couponResult")));
  // new run: stopped coupon -> no result card
  await T(page, "window.plasmaTest.goStep(1)"); await sleep(200); await T(page, "document.getElementById('btnCoupon').click()"); await sleep(800);
  await zeroAndTick(page); await T(page, "document.getElementById('dryRun').checked = false; document.getElementById('dryRun').dispatchEvent(new Event('change', { bubbles: true }))"); await sleep(300);
  await page.click("#btnStart"); await sleep(1500); await waitCut(page, 1); await page.keyboard.press("Space"); await sleep(1500);
  ck("37 a stopped coupon does not ask for a result", !(await vis(page, "couponResult")));
  ck("37 a stopped coupon still counts its pierce for the job", await T(page, "window.plasmaTest.CF.h.pierces.job") >= 1);
  ck("no page errors (37)", errs.length === 0, errs);
  await page.close();
}

{ // ---------- lifetime pierces in a "real" (non-practice) context: the counter class is wired to storage
  const page = await open(br, "laptop", s.base, "?test=1&turn=0"); watchPage(page);
  await prime(page);
  await T(page, "localStorage.setItem('plasma.pierces.v1', JSON.stringify({ lifetime: 1234, since: 1 }))"); await page.reload(); await sleep(1500);
  ck("37 a stored lifetime total is read back after reload", await page.evaluate(() => window.plasmaTest.CF.h.pierces.lifetime) === 1234);
  await page.close();
}

// ================================================================== C. fit on the real screens
for (const [name, prof] of [["phone-landscape-844x390", "phoneland"], ["phone-portrait-390x844", "phone"]]) {
  const page = await open(br, prof, s.base, "?test=1&turn=0"); watchPage(page);
  await prime(page); await zeroAndTick(page, true);
  await T(page, "document.getElementById('originCard').open = true"); await T(page, "document.getElementById('origin9').scrollIntoView({ block: 'center' })"); await sleep(300);
  await shot(page, name + "-origin-card");
  const ow = await T(page, "document.documentElement.scrollWidth <= window.innerWidth + 1");
  ck(`C ${name}: no sideways scroll on Bed & start`, ow);
  await T(page, "document.getElementById('dryRun').checked = false; document.getElementById('dryRun').dispatchEvent(new Event('change', { bubbles: true }))"); await sleep(300);
  await T(page, "document.getElementById('btnStart').click()"); await sleep(800); await waitCut(page, 2); await sleep(1200);
  await T(page, "window.plasmaTest.S.demo.demoLoseArc(true)"); await sleep(1500);
  const stopBox = await T(page, "(() => { const r = document.getElementById('btnStop').getBoundingClientRect(); return [r.width, r.height, r.top, r.bottom, innerHeight, innerWidth]; })()");
  ck(`C ${name}: STOP still visible and big`, stopBox[2] >= 0 && stopBox[3] <= stopBox[4] && stopBox[0] >= 44 && stopBox[1] >= 44, stopBox);
  const lp = await T(page, "(() => { const r = document.getElementById('livePanel').getBoundingClientRect(), l = document.getElementById('lostArc').getBoundingClientRect(); return { panelTop: r.top, panelBottom: r.bottom, lostVisible: l.height > 0, vw: innerWidth, right: r.right, vh: innerHeight }; })()");
  ck(`C ${name}: the live panel fits the width`, lp.right <= lp.vw + 1, lp);
  await shot(page, name + "-cut-live-lost-arc");
  const hs = await T(page, "[...document.querySelectorAll('#livePanel button, #lostArc button, #running button, #btnLostResume')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))");
  ck(`C ${name}: STOP is taller than every control on the cutting screen, the new ones included`, hs.every((h) => h < stopBox[1]), { stop: stopBox[1], hs });
  await page.keyboard.press("Space"); await sleep(600);
  await page.close();
}
await br.close();
const bad = rec.done(); process.exit(bad ? 1 : 0);
