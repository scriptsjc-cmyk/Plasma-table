// Round 5 stage 3 (LOOK AND POLISH) tests. Takes the r5-look-*.png screenshots.
//  A  wording: "Beginner" in full (no "Bgn"), one line on the sign-in page, "Save" in the editor bar, How to use keeps its title
//     (a picker on a phone), Settings wording follows the mode, "start point" (not "work zero"), no "Step 1 of 5" flash, no demo note on Make
import { serve, launch } from "../lib/r2compat.mjs"; import { T as Rec } from "../lib/t.mjs"; import fs from "node:fs";

const out = new URL("../screenshots/", import.meta.url).pathname; fs.mkdirSync(out, { recursive: true });
const s = await serve(), br = await launch();
const rec = new Rec("65_r5_look");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const snap = (page, name) => page.screenshot({ path: `${out}/r5-look-${name}.png` }).catch(() => {});
const view = async (w, h, q = "?test=1&turn=0", mobile = w < 900) => {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/" + q, { waitUntil: "load" }); await sleep(700); return page;
};
const noErrors = (page) => page.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e));
const visText = (page, q) => T(page, `[...document.querySelectorAll(${JSON.stringify(q)})].filter((e) => e.offsetParent && getComputedStyle(e).display !== "none").map((e) => e.innerText.trim()).filter(Boolean)`);

// ================================================================== A: wording
{
  const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  ck("A index.html never shows 'Step 1 of 5' before the app starts", !/Step 1 of 5/.test(html));
  ck("A the user never reads 'work zero' (it is the start point everywhere)", !/work zero/i.test(html.replace(/<!--[\s\S]*?-->/g, "")));
}
for (const [w, h] of [[390, 664], [1366, 768]]) {
  const sign = await view(w, h, "?test=1&gate=1&turn=0");
  const lines = await visText(sign, "#accountDlg .loginbrand p, #accountDlg [data-pane='in'] > p");
  ck(`A ${w}x${h}: the sign-in page says it once (one short line under the name)`, lines.length === 1, lines);
  await sign.context().close();
  const page = await view(w, h);
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); })()`); await sleep(300);
  const b = await T(page, `(() => { const e = document.querySelector('#modeSwitch [data-mode="beginner"]'); return { text: e.innerText.trim(), fits: e.scrollWidth <= e.clientWidth + 1, fs: parseFloat(getComputedStyle(e).fontSize) }; })()`);
  ck(`A ${w}x${h}: the mode switch says "Beginner" in full, at least 14 px, and it fits`, b.text === "Beginner" && b.fits && b.fs >= 14, b);
  ck(`A ${w}x${h}: no demo note over Make a part`, !(await T(page, `!!document.getElementById("demoAcctBar").offsetParent`)));
  await T(page, `window.plasmaTest.setShapeFs(true)`); await sleep(300);
  ck(`A ${w}x${h}: the editor bar says "Save" (not "Save…")`, (await T(page, `document.getElementById("fsSave").innerText.trim()`)) === "Save");
  await T(page, `window.plasmaTest.setShapeFs(false)`);
  // Settings: Beginner gets everyday wording, Pro the firmware notes
  await T(page, `window.plasmaTest.openSettings()`); await sleep(300);
  const begIntro = (await visText(page, "#settingsDlg .setintro, #settingsDlg [data-setpane='machine'] > p")).join(" ");
  ck(`A ${w}x${h}: Beginner Settings never mentions Pro or Firmware`, begIntro.length > 20 && !/Pro|Firmware/.test(begIntro), begIntro);
  await T(page, `window.plasmaTest.closeSettings(); window.plasmaTest.setAppMode("pro", { persist: false, autoFs: false }); window.plasmaTest.openSettings()`); await sleep(300);
  const proIntro = (await visText(page, "#settingsDlg .setintro")).join(" ");
  ck(`A ${w}x${h}: Pro Settings explains where the firmware tools are`, /Firmware/.test(proIntro), proIntro);
  await T(page, `window.plasmaTest.closeSettings()`);
  // How to use
  await T(page, `window.plasmaTest.openHowto()`); await sleep(300);
  const ht = await T(page, `({ title: document.getElementById("howtoTitle").textContent, h3: document.querySelector("#howtoBody h3").textContent, pick: !!document.querySelector(".howto-pick").offsetParent, steps: [...document.querySelectorAll(".howto-step")].filter((b) => b.offsetParent).length })`);
  ck(`A ${w}x${h}: How to use keeps its title; the section is a heading in the text`, ht.title === "How to use" && ht.h3.length > 3, ht);
  if (w < 640) {
    ck(`A ${w}x${h}: on a phone the sections are one compact picker, not a column of buttons`, ht.pick && ht.steps === 0, ht);
    await T(page, `(() => { const p = document.querySelector(".howto-pick"); p.value = p.options[3].value; p.dispatchEvent(new Event("change")); })()`); await sleep(200);
    ck(`A ${w}x${h}: picking a section shows it`, (await T(page, `document.querySelector("#howtoBody h3").textContent`)) === (await T(page, `document.querySelector(".howto-pick").selectedOptions[0].textContent`)));
    await snap(page, "howto-phone");
  } else ck(`A ${w}x${h}: a laptop keeps the section list beside the text`, !ht.pick && ht.steps >= 5, ht);
  await T(page, `window.plasmaTest.closeHowto()`);
  ck(`A ${w}x${h}: no page errors`, noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

const failed = rec.done();
await br.close(); s.close();
process.exit(failed ? 1 : 0);
