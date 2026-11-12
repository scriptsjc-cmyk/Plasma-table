// Round 5 stage 3 (LOOK AND POLISH) tests. Takes the r5-look-*.png screenshots.
//  A  wording: "Beginner" in full (no "Bgn"), one line on the sign-in page, "Save" in the editor bar, How to use keeps its title
//     (a picker on a phone), Settings wording follows the mode, "start point" (not "work zero"), no "Step 1 of 5" flash, no demo note on Make
//  B  colour and icons: accent and go pass AA, header icons come from the sprite, Pro Make has no second tile grid (text/trace in the
//     quick bar), "not set yet" reads as a to-do, start point only drawn once set, wizard words above its buttons
//  C  layout: landscape editor rail shows tools, toasts under the header, no first-job toast, one logo + recent parts on the menu,
//     phone menu descriptions, Settings scrolls whole on a phone with even tabs, account name first, quiet part rows, slim landscape header
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
  const b = await T(page, `(() => { const e = document.getElementById("btnAdvancedTools"); return { text: e ? e.innerText.trim() : "", fits: !!(e && e.scrollWidth <= e.clientWidth + 1), fs: e ? parseFloat(getComputedStyle(e).fontSize) : 0 }; })()`);
  ck(`A ${w}x${h}: Advanced tools is labelled in full, at least 14 px, and it fits`, b.text === "Advanced tools" && b.fits && b.fs >= 14, b);
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

// ================================================================== B: colour, icons, quieter states
{
  const lum = (hex) => { const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const tok = fs.readFileSync(new URL("../../css/tokens.css", import.meta.url), "utf8");
  const v = (n) => (tok.match(new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
  for (const n of ["accent", "go"]) ck(`B white text on --${n} passes AA (4.5:1)`, v(n) && ratio(v(n), "#FFFFFF") >= 4.5, `${v(n)} ${v(n) && ratio(v(n), "#FFFFFF").toFixed(2)}`);
  ck("B --accent-text on --accent-weak passes AA", ratio(v("accent-text"), v("accent-weak")) >= 4.5, `${v("accent-text")} on ${v("accent-weak")}`);
  const page = await view(1366, 768);
  ck("B the header Help and Settings buttons use the drawn icons (one style)", await T(page, `["btnHowto", "btnSettings"].every((id) => !!document.querySelector("#" + id + " svg use"))`));
  ck("B 'Home not set yet' reads as a to-do, not an alarm", (await T(page, `document.getElementById("refState").className`)) === "todo");
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); })()`); await sleep(400);
  ck("B Pro Make shows one set of add buttons (no tile grid under the quick bar)", await T(page, `[...document.querySelectorAll("#srcShape > .addtiles")].every((e) => !e.offsetParent)`));
  const qb = await T(page, `[...document.querySelectorAll("[data-qb]")].map((b) => b.dataset.qb)`);
  ck("B the Pro quick bar has Add text and Trace a picture", qb.includes("text") && qb.includes("trace"), qb);
  const wz = await T(page, `[...document.querySelectorAll("#wizard > li")].map((li) => li.firstElementChild.tagName + ">" + (li.querySelector(".wzbtns") ? li.querySelector(".wzbtns").querySelectorAll("button").length : 0))`);
  ck("B every setup step has its words first, then its buttons on their own row", wz.length === 4 && wz.every((x) => /^P>[12]$/.test(x)), wz);
  ck("B no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

// ================================================================== C: layout
{
  const land = await view(844, 390);
  await T(land, `(() => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.sketch.add("rect"); T.setShapeFs(true); })()`); await sleep(500);
  const rail = await T(land, `(() => { const q = document.getElementById("quickBar").getBoundingClientRect(); return [...document.querySelectorAll("#quickBar [data-qb]")].filter((b) => { const r = b.getBoundingClientRect(); return r.height && r.top >= q.top && r.bottom <= q.bottom + 1; }).length; })()`);
  ck("C 844x390: the editor's tool rail shows tool buttons, not just a heading", rail >= 3, rail);
  await T(land, `window.plasmaTest.setShapeFs(false)`);
  await snap(land, "land-editor");
  await land.context().close();
}
for (const [w, h] of [[390, 664], [844, 390], [1366, 768]]) {
  const page = await view(w, h, "?test=1&demo=1&turn=0");
  await T(page, `(async () => { const A = window.plasmaTest.account; await A.signUp({ email: "look-c-${w}@example.com", pin: "letmein1", display_name: "Look Tester", mode: "beginner" });
    for (const n of ["Bracket", "Gusset"]) await A.savePart({ name: n, data: { items: [] } });
    document.querySelectorAll(".acctdlg:not(.hidden)").forEach((d) => d.classList.add("hidden")); window.plasmaTest.showScreen("menu", { force: true }); })()`); await sleep(900);
  const m = await T(page, `({ marks: [...document.querySelectorAll("#menuView svg.arcmark")].length, recent: [...document.querySelectorAll("#menuRecent button")].filter((b) => b.offsetParent).map((b) => b.textContent),
    desc: [...document.querySelectorAll(".menubig > span")].filter((e) => e.offsetParent && getComputedStyle(e).display !== "none").length })`);
  ck(`C ${w}x${h}: the menu has no second logo (the header has it)`, m.marks === 0, m);
  ck(`C ${w}x${h}: the menu offers the recent saved parts`, m.recent.length === 2 && m.recent.includes("Gusset"), m);
  ck(`C ${w}x${h}: every menu card keeps its one-line description`, m.desc === 3, m);
  await T(page, `document.querySelector("#menuRecent button").click()`); await sleep(700);
  ck(`C ${w}x${h}: a recent part opens in Make a part`, (await T(page, `document.body.dataset.screen`)) === "make");
  // toast position: under the header, above the middle of the screen
  await T(page, `window.plasmaTest.toast ? window.plasmaTest.toast("Look test") : (document.getElementById("toast").textContent = "Look test", document.getElementById("toast").className = "toast")`); await sleep(100);
  const tp = await T(page, `(() => { const t = document.getElementById("toast").getBoundingClientRect(), b = document.querySelector(".topbar").getBoundingClientRect(); return { t: t.top, hb: b.bottom, h: innerHeight }; })()`);
  ck(`C ${w}x${h}: toasts sit just under the header, never over the bottom actions`, tp.t >= tp.hb - 1 && tp.t < tp.h / 2, tp);
  // account: name first, email behind a reveal; one filled action
  await T(page, `document.getElementById("acctPill").click()`); await sleep(400);
  const ac = await T(page, `({ who: document.getElementById("acctWho").innerText, email: !!document.getElementById("acctEmail").offsetParent, save: getComputedStyle(document.getElementById("btnAcctSave")).backgroundColor, card: getComputedStyle(document.getElementById("btnAcctSave").closest(".acctcard") || document.body).backgroundColor })`);
  ck(`C ${w}x${h}: Account shows the name, not the email, until asked`, ac.who === "Look Tester" && !ac.email, ac);
  await T(page, `document.getElementById("btnShowEmail").click()`); await sleep(100);
  ck(`C ${w}x${h}: Show email reveals it`, /look-c-/.test(await T(page, `document.getElementById("acctEmail").offsetParent ? document.getElementById("acctEmail").textContent : ""`)));
  ck(`C ${w}x${h}: Save name is a plain (outline) button, not a second filled primary`, !/rgb\(10, 106, 50\)/.test(ac.save), ac);
  await T(page, `window.plasmaTest.closeAll ? window.plasmaTest.closeAll() : document.querySelectorAll(".acctdlg:not(.hidden)").forEach((d) => d.classList.add("hidden"))`);
  // parts rows: only Delete has a colour
  await T(page, `document.querySelectorAll(".acctdlg:not(.hidden)").forEach((d) => d.classList.add("hidden")); document.getElementById("menuParts").click()`); await sleep(700);
  const pr = await T(page, `(() => { const row = document.querySelector("#partsList .partrow"); if (!row) return null; const bg = (b) => getComputedStyle(b).backgroundColor; const bs = [...row.querySelectorAll("button[data-act]")]; return { edit: bs.find((b) => b.dataset.act === "edit").className, del: getComputedStyle(bs.find((b) => b.dataset.act === "del")).color, same: new Set(bs.filter((b) => b.dataset.act !== "del").map(bg)).size }; })()`);
  ck(`C ${w}x${h}: part rows are one quiet row; only Delete has a colour (red)`, pr && !/go/.test(pr.edit) && pr.same === 1 && /rgb\(196, 43, 28\)/.test(pr.del), pr);
  await T(page, `document.querySelectorAll(".acctdlg:not(.hidden)").forEach((d) => d.classList.add("hidden"))`);
  // Settings: on a phone the whole card scrolls (the firmware warning can be read above Save); tabs are even
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.openSettings(); })()`); await sleep(400);
  const tabs = await T(page, `[...document.querySelectorAll("#settingsTabs .settab")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().width))`);
  const rows = await T(page, `(() => { const m = new Map(); for (const b of document.querySelectorAll("#settingsTabs .settab")) { if (!b.offsetParent) continue; const t = Math.round(b.getBoundingClientRect().top); m.set(t, (m.get(t) || []).concat(Math.round(b.getBoundingClientRect().width))); } return [...m.values()]; })()`);
  ck(`C ${w}x${h}: Settings tabs are even (same width in a row)`, rows.every((r) => Math.max(...r) - Math.min(...r) <= 2), rows);
  if (w < 640 || h < 540) {
    await T(page, `[...document.querySelectorAll("#settingsDlg .settab")].find((b) => /firm/i.test(b.textContent)).click()`); await sleep(300);
    const fw = await T(page, `(() => { const c = document.querySelector("#settingsDlg .shapelib-card"); c.scrollTop = c.scrollHeight; const pane = document.querySelector("#settingsDlg .setpane:not(.hidden)"); return { cardScrolls: getComputedStyle(c).overflowY, paneClips: pane.scrollHeight > pane.clientHeight + 2 && getComputedStyle(pane).overflowY !== "visible", save: getComputedStyle(document.querySelector("#settingsDlg .setsave")).position }; })()`);
    ck(`C ${w}x${h}: on a phone the whole Settings card scrolls with a sticky Save (no clipped strip)`, fw.cardScrolls === "auto" && !fw.paneClips && fw.save === "sticky", fw);
    await snap(page, `settings-fw-${w}x${h}`);
  }
  await T(page, `window.plasmaTest.closeSettings()`);
  ck(`C ${w}x${h}: no page errors`, noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}
{
  // first job: said once, beside the Practice run box, not in a toast over the preview
  const src = fs.readFileSync(new URL("../../js/ui/nav.js", import.meta.url), "utf8");
  ck("C the first-job Practice run note is in the step text, not a toast", !/toast\("Your first job/.test(src));
  // phone on its side, connected: the connection pill is only its dot, so the name and STOP fit
  const page = await view(844, 390, "?test=1&demo=1&turn=0");
  await T(page, `(async () => { const T = window.plasmaTest; await T.account.signUp({ email: "look-hdr@example.com", pin: "letmein1", display_name: "Josh Tester", mode: "beginner" });
    document.querySelectorAll(".acctdlg:not(.hidden)").forEach((d) => d.classList.add("hidden")); T.showScreen("make", { force: true }); T.sketch.clear(); T.sketch.add("plate", true); T.sendToCutting(); T.goStep(3); })()`); await sleep(900);
  await T(page, `(() => { window.plasmaTest.goStep(3); document.getElementById("btnDemo").click(); })()`); await sleep(2500);
  const hd = await T(page, `(() => { const a = document.getElementById("acctPill"), c = document.getElementById("connPill"), s = document.getElementById("btnStop").getBoundingClientRect(); return { name: a.scrollWidth <= a.clientWidth + 1, conn: Math.round(c.getBoundingClientRect().width), connText: c.textContent.trim(), connWord: getComputedStyle(c, "::after").content, stop: s.right <= innerWidth + 1 && s.width >= 44 }; })()`);
  ck("C 844x390 cutting: the account name is shown in full", hd.name, hd);
  ck("C 844x390 cutting: once connected the connection pill is its dot and one short word, not colour alone (the full words stay for screen readers)", hd.conn <= 130 && hd.connWord === '"Practice"' && /Practice/.test(hd.connText), hd);
  ck("C 844x390 cutting: STOP stays fully on screen", hd.stop, hd);
  await snap(page, "land-cut-header");
  ck("C 844x390: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

const failed = rec.done();
await br.close(); s.close();
process.exit(failed ? 1 : 0);
