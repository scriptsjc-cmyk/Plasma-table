// Round 5 stage 2 (USABILITY) tests. Takes the r5-use-*.png screenshots.
//  L  phone on its side: sign-in fits, Settings scrolls with Close / Save in reach, the toast never covers Start, slim Start row
import { serve, launch, demoToShape } from "../lib/r2compat.mjs"; import { T as Rec } from "../lib/t.mjs"; import fs from "node:fs";
const out = new URL("../screenshots/", import.meta.url).pathname; fs.mkdirSync(out, { recursive: true });
const s = await serve(), br = await launch();
const rec = new Rec("63_r5_usability");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const snap = (page, name) => page.screenshot({ path: `${out}/r5-use-${name}.png` }).catch(() => {});
const phone = async (w, h, q = "?test=1&turn=0") => {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/" + q, { waitUntil: "load" }); await sleep(600); return page;
};
const noErrors = (page) => page.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e));

// ================================================================== L: phone on its side
for (const [w, h] of [[844, 390], [667, 375]]) {
  // sign-in: Create an account, the email link and Reset are all on screen without scrolling
  {
    const page = await phone(w, h, "?test=1&gate=1&turn=0");
    const r = await T(page, `["goSignUp", "goLink", "goReset", "formSignIn"].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); return { id, bottom: Math.round(b.bottom), ok: b.bottom <= innerHeight + 1 && b.top >= 0 }; })`);
    ck(`L ${w}x${h}: sign-in: Create an account / email link / Reset all fit on screen`, r.every((x) => x.ok), r);
    await snap(page, `signin-${w}x${h}`);
    await page.context().close();
  }
  const page = await phone(w, h);
  await demoToShape(page, { stay: "cut" }); await sleep(400);
  await T(page, "window.plasmaTest.goStep(3)"); await sleep(400);
  // the toast sits under the header, clear of the Start row
  await T(page, "document.getElementById('btnZero').click()"); await sleep(300);
  const tg = await T(page, `(() => { const t = document.getElementById("toast").getBoundingClientRect(), n = document.querySelector('.step[data-step="3"] > .nav').getBoundingClientRect(), top = document.querySelector(".topbar").getBoundingClientRect(); return { shown: t.height > 0, overNav: !(t.bottom <= n.top || t.top >= n.bottom), belowHeader: t.top >= top.bottom - 1 }; })()`);
  ck(`L ${w}x${h}: a toast shows under the header and never over Back / Start / Download`, tg.shown && !tg.overNav && tg.belowHeader, tg);
  const st = await T(page, `(() => { const b = document.getElementById("btnStart").getBoundingClientRect(), z = document.getElementById("btnZero"); return { startH: Math.round(b.height), zeroFits: z.scrollHeight <= z.clientHeight + 2 }; })()`);
  ck(`L ${w}x${h}: slim Start row (<= 56 px) and "Start here" fits its label`, st.startH <= 56 && st.startH >= 44 && st.zeroFits, st);
  await snap(page, `bed-${w}x${h}`);
  // Settings: the whole card scrolls, Close and Save stay in reach, Machine & axes fields can be reached
  await T(page, "window.plasmaTest.openSettings()"); await sleep(400);
  await T(page, "document.querySelector('#settingsDlg .shapelib-card').scrollTop = 99999"); await sleep(200);
  const sg = await T(page, `(() => { const vis = (e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1; }; const pane = document.querySelector("#settingsDlg .setpane:not(.hidden)"); const f = [...pane.querySelectorAll("input")].filter((i) => i.offsetParent); return { close: vis(document.getElementById("settingsClose")), save: vis(document.getElementById("btnSaveSettings")), lastField: f.length ? vis(f[f.length - 1]) : false, fields: f.length }; })()`);
  ck(`L ${w}x${h}: Settings: scrolled to the end, the last Machine & axes field, Close and Save are all on screen`, sg.close && sg.save && sg.lastField && sg.fields > 2, sg);
  await snap(page, `settings-${w}x${h}`);
  ck(`L ${w}x${h}: no page errors`, noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

const failed = rec.done();
await br.close(); s.close();
process.exit(failed ? 1 : 0);
