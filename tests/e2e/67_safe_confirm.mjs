// In-app confirms leave STOP and Space working; Start without saved edges warns; Alarm refuses zero.
import { serve, open, launch, demoToShape } from "../lib/r2compat.mjs";
import { T as Rec } from "../lib/t.mjs";
import fs from "node:fs";

const out = new URL("../screenshots/", import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const s = await serve(), br = await launch();
const rec = new Rec("67_safe_confirm");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const throws = (page, js) => T(page, `(() => { try { ${js}; return null; } catch (e) { return String(e.message || e); } })()`);
const snap = async (page, name) => { await sleep(200); await page.screenshot({ path: `${out}/safe-confirm-${name}.png` }); };

{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  page._safeConfirmAuto = "manual";
  await demoToShape(page, { stay: "cut" }); await sleep(400);
  await page.evaluate(() => { window.plasmaTest.goStep(3); const auto = document.getElementById("layAuto"); if (auto) auto.click(); });
  await sleep(400);
  await page.evaluate(() => window.plasmaTest.getM().command({ cmd: "limits_clear" }));
  await T(page, "window.plasmaTest.refresh()");
  await page.evaluate(() => { const c = document.getElementById("zeroCard"); if (c) c.open = true; document.getElementById("btnZero").click(); }); await sleep(400);
  await page.evaluate(() => {
    document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; });
    document.getElementById("checklist").dispatchEvent(new Event("change"));
  }); await sleep(300);
  const blockers = await T(page, "document.getElementById('blockers').textContent");
  ck("Start is allowed when no edges are saved (not blocked for homing)", await T(page, "!document.getElementById('btnStart').disabled") && !/Home/.test(blockers), blockers);
  await page.click("#btnStart");
  await page.waitForSelector("#safeDlg:not(.hidden)", { timeout: 8000 });
  const prompt = await T(page, "({ title: document.getElementById('safeDlgTitle').textContent, body: document.getElementById('safeDlgBody').textContent, focus: document.activeElement && document.activeElement.id })");
  ck("Start without saved edges warns and asks to confirm", /Start without homing/.test(prompt.title) && /No table edges are saved/.test(prompt.body), JSON.stringify(prompt));
  ck("Cancel is focused on the confirm", prompt.focus === "safeDlgCancel", JSON.stringify(prompt));
  await T(page, "window.scrollTo(0,0)"); await sleep(50);
  const layers = await T(page, `(() => {
    const s = document.getElementById("btnStop"), d = document.getElementById("safeDlg"), bar = document.querySelector(".topbar");
    const sr = s.getBoundingClientRect(), mid = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
    return { hitStop: !!(mid && (mid.id === "btnStop" || s.contains(mid))), dlgTop: d.getBoundingClientRect().top, barBottom: bar.getBoundingClientRect().bottom };
  })()`);
  ck("the confirm sits below the header and does not cover STOP", layers.hitStop && layers.dlgTop >= layers.barBottom - 1, JSON.stringify(layers));
  await page.keyboard.press("Space"); await sleep(600);
  ck("Space still latches the E-stop while the confirm is open", await T(page, "window.plasmaTest.estopOn()") && await T(page, "!document.getElementById('safeDlg').classList.contains('hidden')"));
  await snap(page, "start-without-homing");
  await page.click("#safeDlgCancel");
  await page.waitForFunction(() => document.getElementById("safeDlg").classList.contains("hidden"), null, { timeout: 5000 });
  ck("Cancel leaves the job unstarted", await T(page, "!(window.plasmaTest.S.job && window.plasmaTest.S.job.running)"));

  await T(page, "window.plasmaTest.getM().onGrbl('alarm', { code: 2, message: 'Bad G-code' }); window.plasmaTest.refresh();");
  await sleep(200);
  await page.evaluate(() => document.getElementById("btnUnlock").click());
  await page.waitForSelector("#safeDlg:not(.hidden)", { timeout: 8000 });
  const u = await T(page, `({ body: document.getElementById("safeDlgBody").textContent, note: (document.getElementById("safeDlgNote") || {}).textContent || "", okOff: document.getElementById("safeDlgOk").disabled, focus: document.activeElement && document.activeElement.id })`);
  ck("Unlock while E-STOP is latched shows a confirm with OK disabled", u.okOff && /E-STOP/.test(u.note) && /\$X/.test(u.body), JSON.stringify(u));
  ck("Cancel is focused on the blocked Unlock confirm", u.focus === "safeDlgCancel", JSON.stringify(u));
  await snap(page, "unlock-blocked");
  await page.click("#safeDlgCancel");
  await page.waitForFunction(() => document.getElementById("safeDlg").classList.contains("hidden"), null, { timeout: 5000 });
  await page.context().close();
}

{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" }); await sleep(300);
  await T(page, `(() => { const M = window.plasmaTest.getM(); M.grbl.status.state = "Alarm"; M.onGrbl("status", { ...M.grbl.status, state: "Alarm" }); M.onGrbl("alarm", { code: 9, message: "Hard limit" }); })()`);
  ck("an Alarm status report leaves work zero unconfirmed", await T(page, "window.plasmaTest.getM().zeroConfirmed === false"));
  const z = await throws(page, "window.plasmaTest.getM().command({ cmd: 'zero_xy' })");
  ck("zero_xy in Alarm is refused and zeroConfirmed stays false", /Alarm/.test(z || "") && await T(page, "window.plasmaTest.getM().zeroConfirmed === false"), z);
  const o = await throws(page, "window.plasmaTest.getM().command({ cmd: 'set_origin', x: 0, y: 0 })");
  ck("set_origin in Alarm is refused and zeroConfirmed stays false", /Alarm/.test(o || "") && await T(page, "window.plasmaTest.getM().zeroConfirmed === false"), o);
  await page.context().close();
}

{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" }); await sleep(300);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await T(page, "window.plasmaTest.getM().onGrbl('alarm', { code: 9, message: 'Hard limit' })");
  await T(page, "window.plasmaTest.refresh()"); await sleep(200);
  const col = await T(page, "getComputedStyle(document.getElementById('alarmBar')).color");
  ck("dark theme alarm banner uses the light-on-dark alarm text token", /rgb\(\s*255,\s*213,\s*209\s*\)/.test(col), col);
  await snap(page, "alarm-dark");
  await page.context().close();
}

const failed = rec.done();
await br.close(); s.close();
process.exit(failed ? 1 : 0);
