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
const unlockHome = async (page) => { await T(page, "window.plasmaTest.getM().command({ cmd: 'unlock' })"); await sleep(600); await T(page, "window.plasmaTest.getM().command({ cmd: 'home' })"); const t0 = Date.now(); while (Date.now() - t0 < 30000) { if (await T(page, "window.plasmaTest.getM().state() === 'Idle' && window.plasmaTest.S.safety.referenced")) break; await sleep(300); } await sleep(300); };
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
  ck("35 practice readings say they are made up", /made up/.test(p[1]) && /made up/.test(p[2]), p);
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
await br.close();
const bad = rec.done(); process.exit(bad ? 1 : 0);
