// r15 Round 9 (before selling), the screens, written before the code. Practice table only; Connect (USB / Bluetooth) is never pressed:
// navigator.serial / bluetooth are stubbed and must never be asked for a device.
//   9.2 "Set up your new table" guide · 9.3 "Send a problem report" · 9.4 machine settings backup / restore
//   9.5 tip / electrode counters · 9.6 cut history
import fs from "node:fs";
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape } from "../lib/browser.mjs";

const t = new T("128_r15_round9");
const srv = await startServer(); const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (o) => JSON.stringify(o);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const STUB = () => { window.__devAsked = 0; const no = () => { window.__devAsked++; return Promise.reject(new Error("test: no device")); };
  try { Object.defineProperty(navigator, "serial", { value: { requestPort: no, getPorts: () => Promise.resolve([]), addEventListener() {} }, configurable: true }); } catch (e) {}
  try { Object.defineProperty(navigator, "bluetooth", { value: { requestDevice: no, getDevices: () => Promise.resolve([]) }, configurable: true }); } catch (e) {} };
const openMenuItem = async (page, id) => {
  await ev(page, () => { const b = document.getElementById("btnTopMenu"); if (b && b.getClientRects().length && !document.querySelector(".topbar.menu-open")) b.click(); }); await sleep(250);
  const vis = await ev(page, (id) => { const e = document.getElementById(id); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, vh: innerHeight, vw: innerWidth, text: e.textContent.trim() }; }, id);
  if (vis) await page.click("#" + id);
  await sleep(350);
  return vis;
};
const open = (page, id) => ev(page, (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains("hidden") && e.getClientRects().length > 0; }, id);
const download = async (page, sel) => { const [d] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.click(sel)]); const p = await d.path(); return { name: d.suggestedFilename(), text: fs.readFileSync(p, "utf8") }; };

for (const prof of ["d1280x600", "d1536x730", "iphone14"]) {
  const page = await newPage(br, prof, { base: srv.base });
  await page.addInitScript(STUB); await ev(page, STUB);
  // ---------------------------------------------------------------- ☰ has the three new items, each reachable on screen
  for (const [id, words] of [["menuSetupGuide", /Set up your new table/], ["menuCutHistory", /Cut history/], ["menuReport", /Send a problem report/]]) {
    await ev(page, () => { const T = window.plasmaTest; T.showScreen("menu", { force: true }); }); await sleep(200);
    const v = await openMenuItem(page, id);
    t.check(`${prof}: ☰ › "${words.source}" is there and on screen`, !!v && words.test(v.text) && v.t >= 0 && v.b <= v.vh + 1 && v.l >= 0 && v.r <= v.vw + 1, J(v));
    const dlg = { menuSetupGuide: "guideDlg", menuCutHistory: "historyDlg", menuReport: "reportDlg" }[id];
    t.check(`${prof}: it opens its window`, await open(page, dlg));
    const fits = await ev(page, (dlg) => { const c = document.querySelector("#" + dlg + " .shapelib-card"); if (!c) return null; const r = c.getBoundingClientRect(); return { t: r.top, b: r.bottom, vh: innerHeight, l: r.left, r: r.right, vw: innerWidth }; }, dlg);
    t.check(`${prof}: the window fits the screen`, !!fits && fits.t >= -1 && fits.b <= fits.vh + 1 && fits.l >= -1 && fits.r <= fits.vw + 1, J(fits));
    await page.keyboard.press("Escape"); await sleep(250);
    t.check(`${prof}: Escape closes it`, !(await open(page, dlg)));
  }
  if (prof === "iphone14") { t.check(`no page error (${prof})`, !page.errors.length, J(page.errors.slice(0, 3))); await page.ctx.close(); continue; }

  // ---------------------------------------------------------------- 9.2 the setup guide
  await openMenuItem(page, "menuSetupGuide");
  const g = await ev(page, () => [...document.querySelectorAll("#guideSteps [data-guide]")].map((li) => ({ id: li.dataset.guide, title: li.querySelector("h3, b, strong") ? li.querySelector("h3, b, strong").textContent.trim() : "", done: li.classList.contains("done"), open: !!li.querySelector("[data-guide-open]"), mark: !!li.querySelector("[data-guide-done]") })));
  t.check(`9.2 ${prof}: five steps in order: connect, motor direction, torch test, edges, test coupon`, J(g.map((s) => s.id)) === J(["connect", "motors", "torch", "edges", "coupon"]) && g.every((s) => s.title && s.open), J(g));
  t.check(`9.2 ${prof}: nothing is done on a new browser`, g.every((s) => !s.done), J(g));
  await page.click('#guideSteps [data-guide="motors"] [data-guide-open]'); await sleep(700);
  const mt = await ev(page, () => { const v = document.getElementById("setupView"); return { scr: window.plasmaTest.screen(), vis: !!v && v.getClientRects().length > 0 && !v.classList.contains("hidden"), tab: v && v.dataset.setupTab, dlg: !document.getElementById("guideDlg").classList.contains("hidden") }; });
  t.check(`9.2 ${prof}: Motor direction › Open goes to Machine setup › Motors`, mt.scr === "cut" && mt.vis && mt.tab === "motors" && !mt.dlg, J(mt));
  await openMenuItem(page, "menuSetupGuide");
  await page.click('#guideSteps [data-guide="motors"] [data-guide-done]'); await sleep(300);
  await page.keyboard.press("Escape"); await sleep(200);
  await openMenuItem(page, "menuSetupGuide");
  const g2 = await ev(page, () => ({ motors: document.querySelector('#guideSteps [data-guide="motors"]').classList.contains("done"), count: document.getElementById("guideCount") ? document.getElementById("guideCount").textContent : "" }));
  t.check(`9.2 ${prof}: "Done" on a step sticks (and the count says 1 of 5)`, g2.motors && /1 of 5/.test(g2.count), J(g2));
  await page.click('#guideSteps [data-guide="connect"] [data-guide-open]'); await sleep(800);
  const cn0 = await ev(page, () => ({ scr: window.plasmaTest.screen(), step: window.plasmaTest.S.cur, toast: document.getElementById("toast").textContent, asked: window.__devAsked }));
  t.check(`9.2 ${prof}: with no part yet, Connect › Open goes to Cut › Part and says to choose a part first`, cn0.scr === "cut" && cn0.step === 1 && /choose any part/i.test(cn0.toast) && cn0.asked === 0, J(cn0));
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); const s = T.sketch; s.clear(); s.add("rect", true, { w: 120, h: 80 }); s.commit(); T.sendToCutting(); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut");
  await openMenuItem(page, "menuSetupGuide");
  await page.click('#guideSteps [data-guide="connect"] [data-guide-open]'); await sleep(800);
  const cn = await ev(page, () => { const b = document.getElementById("btnConnect"), r = b && b.getBoundingClientRect(); return { scr: window.plasmaTest.screen(), step: window.plasmaTest.S.cur, vis: !!b && b.getClientRects().length > 0 && r.top >= 0 && r.bottom <= innerHeight, asked: window.__devAsked, conn: !!window.plasmaTest.S.connected }; });
  t.check(`9.2 ${prof}: Connect › Open shows the Connect button on Cut › Setup, and does not press it`, cn.scr === "cut" && cn.vis && cn.asked === 0 && !cn.conn, J(cn));

  // ---------------------------------------------------------------- 9.6 cut history (a Practice job, stopped)
  await ev(page, () => localStorage.setItem("sb-test-auth-token", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.dGVzdHNpZ25hdHVyZQ", refresh_token: "r-secret-445566" })));
  await demoToShape(page, { stay: "cut" });
  await ev(page, () => window.plasmaTest.goStep(3)); await sleep(500);
  await ev(page, () => document.getElementById("btnZero").click()); await sleep(300);
  await ev(page, () => document.querySelectorAll("#checklist input").forEach((c) => { if (!c.checked) c.click(); }));
  await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 }).catch(() => {});
  await page.click("#btnStart");
  const started = await page.waitForFunction(() => window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 10000 }).then(() => true).catch(() => false);
  t.check(`9.6 ${prof}: (setup) a practice job runs`, started);
  await sleep(1500);
  await page.click("#btnStop"); await sleep(1200);
  await openMenuItem(page, "menuCutHistory");
  const h = await ev(page, () => { const head = [...document.querySelectorAll("#historyDlg thead th")].map((th) => th.textContent.trim());
    const rows = [...document.querySelectorAll("#historyDlg tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    return { head, rows, asked: window.__devAsked }; });
  t.check(`9.6 ${prof}: the history columns are date, part, material, thickness, time, result`, J(h.head) === J(["Date", "Part", "Material", "Thickness", "Time", "Result"]), J(h.head));
  const row = h.rows[0] || [];
  t.check(`9.6 ${prof}: the stopped practice job is the top row: stopped, marked Practice, with material, mm and a time`, h.rows.length === 1 && /Stopped/.test(row[5]) && /Practice/.test(row.join(" ")) && /mm/.test(row[3]) && /\d+:\d\d|\d+ s/.test(row[4]) && row[2].length > 0 && row[1].length > 0, J(h.rows));
  const csv = await download(page, "#btnHistoryCsv");
  t.check(`9.6 ${prof}: Download CSV saves the same rows`, /\.csv$/.test(csv.name) && /^Date,Part,Material,Thickness \(mm\),Time \(s\),Result,Practice/.test(csv.text) && csv.text.trim().split("\n").length === 2, csv.text.slice(0, 200));

  // ---------------------------------------------------------------- 9.3 problem report
  await page.keyboard.press("Escape"); await sleep(200);
  await openMenuItem(page, "menuReport");
  await page.fill("#reportNote", "Stopped it on purpose for the test.");
  const rp = await download(page, "#btnReportDownload");
  let rep = null; try { rep = JSON.parse(rp.text); } catch (e) { rep = null; }
  const ver = await ev(page, async () => (await (await fetch("version.json", { cache: "no-store" })).json()).id);
  t.check(`9.3 ${prof}: the report is a JSON file with the version, settings, last job log, alarms and history`, !!rep && /problem-report.*\.json$/.test(rp.name) && rep.version && rep.version.id === ver && rep.settings !== undefined && rep.lastJob && rep.lastJob.lines.length > 0 && Array.isArray(rep.alarms) && rep.history.length === 1 && /on purpose/.test(rep.note), rp.text.slice(0, 400));
  t.check(`9.3 ${prof}: no sign-in token, password or key in it`, !/eyJhbGciOiJIUzI1NiJ9|r-secret-445566|sb-test-auth-token|access_token|refresh_token/.test(rp.text), rp.text.match(/.{0,40}(eyJ|secret|token).{0,40}/g));
  const said = await ev(page, () => document.getElementById("reportDlg").textContent);
  t.check(`9.3 ${prof}: the window says what is in it and that nothing is sent by itself`, /version/i.test(said) && /settings/i.test(said) && /log/i.test(said) && /alarm/i.test(said) && /no passwords/i.test(said) && /nothing is sent/i.test(said), said.slice(0, 300));
  await page.keyboard.press("Escape"); await sleep(200);

  // ---------------------------------------------------------------- 9.5 consumables
  const cons0 = await ev(page, () => JSON.parse(localStorage.getItem("plasma.pierces.v1") || "{}"));
  t.check(`9.5 ${prof}: the practice job did not count on the tip or electrode`, !cons0.tip || cons0.tip.n === 0, J(cons0));
  await ev(page, () => localStorage.setItem("plasma.pierces.v1", JSON.stringify({ lifetime: 900, since: 1, tip: { n: 12, since: Date.UTC(2026, 10, 1) }, electrode: { n: 30, since: Date.UTC(2026, 9, 1) } })));
  await openMenuItem(page, "btnSettings");
  await ev(page, () => document.querySelector('.settab[data-settab="torch"]').click()); await sleep(300);
  const c1 = await ev(page, () => ({ tip: document.getElementById("consTip") && document.getElementById("consTip").textContent, el: document.getElementById("consElectrode") && document.getElementById("consElectrode").textContent }));
  t.check(`9.5 ${prof}: Settings › Torch shows the tip and electrode pierces since they were fitted`, /12 pierces/.test(c1.tip || "") && /30 pierces/.test(c1.el || "") && /since/i.test(c1.tip || ""), J(c1));
  await page.click("#btnNewTip"); await sleep(400);
  const c2 = await ev(page, () => ({ tip: document.getElementById("consTip").textContent, el: document.getElementById("consElectrode").textContent, st: JSON.parse(localStorage.getItem("plasma.pierces.v1")) }));
  t.check(`9.5 ${prof}: "New tip fitted" (after a confirm) zeroes the tip only`, /^\D*0 pierces/.test(c2.tip) && /30 pierces/.test(c2.el) && c2.st.tip.n === 0 && c2.st.electrode.n === 30 && c2.st.lifetime === 900, J(c2));

  // ---------------------------------------------------------------- 9.4 machine settings backup / restore
  await ev(page, () => document.querySelector('.settab[data-settab="backup"]').click()); await sleep(300);
  await ev(page, () => { localStorage.setItem("plasma.limits", JSON.stringify({ limits: { x: [0, 1240], y: [0, 790], z: [-55, 0] } })); localStorage.setItem("plasma.speeds", JSON.stringify({ "Mild steel|3": 1850 })); });
  const bk = await download(page, "#btnMachBackup");
  let bkj = null; try { bkj = JSON.parse(bk.text); } catch (e) { bkj = null; }
  t.check(`9.4 ${prof}: Back up machine settings saves a file with the app settings, edges and saved speeds`, !!bkj && bkj.kind === "porta-plazma-machine-backup" && bkj.app && bkj.machine.limits.x[1] === 1240 && bkj.machine.speeds["Mild steel|3"] === 1850 && !/eyJhbGciOiJIUzI1NiJ9/.test(bk.text), bk.text.slice(0, 300));
  const file = "/tmp/128-backup-" + prof + ".json"; fs.writeFileSync(file, bk.text);
  await ev(page, () => localStorage.setItem("plasma.speeds", JSON.stringify({ "Mild steel|3": 999 })));
  await page.setInputFiles("#machRestoreFile", file); await sleep(800);
  const refused = await ev(page, () => ({ sp: JSON.parse(localStorage.getItem("plasma.speeds")), conn: !!window.plasmaTest.S.connected, toast: (document.getElementById("toast") || {}).textContent || "" }));
  t.check(`9.4 ${prof}: restore is refused while a machine (here Practice) is connected, and nothing changes`, refused.conn && refused.sp["Mild steel|3"] === 999 && /disconnect/i.test(refused.toast), J(refused));
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("cut", { force: true }); T.goStep(3); }); await sleep(400);
  await ev(page, () => document.getElementById("btnDisconnect").click()); await sleep(800);      // (on a laptop it lives in the header's connection menu)
  const disc = await ev(page, () => !window.plasmaTest.S.connected);
  t.check(`9.4 ${prof}: (setup) Practice disconnected`, disc);
  await openMenuItem(page, "btnSettings");
  await ev(page, () => document.querySelector('.settab[data-settab="backup"]').click()); await sleep(300);
  page.dialogs.length = 0;
  const nav = page.waitForNavigation({ timeout: 8000 }).then(() => true).catch(() => false);
  await page.setInputFiles("#machRestoreFile", file);
  const reloaded = await nav;
  await page.waitForFunction(() => window.plasmaTest, null, { timeout: 15000 }).catch(() => {});
  const after = await ev(page, () => ({ sp: JSON.parse(localStorage.getItem("plasma.speeds") || "{}"), lim: JSON.parse(localStorage.getItem("plasma.limits") || "{}").limits }));
  t.check(`9.4 ${prof}: restore asks first, then puts the speeds and edges back and reloads the app`, page.dialogs.some((d) => /restore/i.test(d) && /edges/i.test(d)) && reloaded && after.sp["Mild steel|3"] === 1850 && after.lim && after.lim.x[1] === 1240, J({ d: page.dialogs, reloaded, after }));
  const bad = "/tmp/128-bad-" + prof + ".json"; const bj = JSON.parse(bk.text); bj.machine.limits.x = [0, 1e9]; fs.writeFileSync(bad, JSON.stringify(bj));
  await openMenuItem(page, "btnSettings");
  await ev(page, () => document.querySelector('.settab[data-settab="backup"]').click()); await sleep(300);
  await page.setInputFiles("#machRestoreFile", bad); await sleep(800);
  const r2 = await ev(page, () => ({ lim: JSON.parse(localStorage.getItem("plasma.limits") || "{}").limits, toast: (document.getElementById("toast") || {}).textContent || "" }));
  t.check(`9.4 ${prof}: a backup with bad edges is refused with the reason, nothing restored`, r2.lim && r2.lim.x[1] === 1240 && /nothing was restored/i.test(r2.toast) && /edge/i.test(r2.toast), J(r2));
  t.check(`${prof}: no device was ever asked for (Connect never pressed)`, (await ev(page, () => window.__devAsked || 0)) === 0);
  t.check(`no page error (${prof})`, !page.errors.length, J(page.errors.slice(0, 3)));
  await page.ctx.close();
}
await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);
