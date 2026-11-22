// r15 editor-redesign test review: three gaps found against approved rounds, guarded here (in the deploy gate).
//   r12 3.2  the laptop Make header reads logo · "Make a part" · Undo / Redo / Fit / Delete · … (the title had been hidden)
//   r12 4.2  Simple on a laptop: no blue banner, its text is the panel title ("Pick a template" / "Set the size") with the help in an "i"
//   J2/r7    pressing Advanced tools shows the Drawing sheet box (it stayed hidden until the next edit)
import { serve, launch } from "../lib/r2compat.mjs";
import { T as Rec } from "../lib/t.mjs";

const s = await serve(), br = await launch();
const rec = new Rec("129_r15_review");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const view = async (w, h) => {
  const ctx = await br.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/?test=1&turn=0", { waitUntil: "load" }); await sleep(600);
  return page;
};
const vis = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 2 && r.height > 2 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);

for (const [w, h] of [[1280, 600], [1366, 640], [1536, 730]]) {
  for (const mode of ["simple", "advanced"]) {
    const page = await view(w, h);
    await page.evaluate((mode) => { const T = window.plasmaTest; T.setAppMode(mode, { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); }, mode);
    await sleep(300);
    const title = await vis(page, "#makeBar > h1"), pin = await vis(page, "#qbPinned"), bar = await vis(page, ".topbar");
    const txt = await page.evaluate(() => (document.querySelector("#makeBar > h1") || {}).textContent || "");
    ck(`${w}x${h} ${mode}: the header says "Make a part", before Undo / Redo / Fit / Delete, inside the header row`, !!(title && pin && bar && /Make a part/.test(txt) && title.r <= pin.l + 1 && title.b <= bar.b + 1 && Math.abs(title.t - pin.t) < 30), { title, pin, txt });
    if (mode === "simple") {
      const g = await page.evaluate(() => { const t = document.getElementById("ghTitle"), i = document.querySelector("#ghHelp .info-i"); const v = (e) => !!(e && e.getClientRects().length && e.getBoundingClientRect().width > 2); return { title: v(t) ? t.textContent.trim() : "", i: v(i), tip: (i && i.getAttribute("data-tip")) || "" }; });
      ck(`${w}x${h} simple: the panel title says "Pick a template" with its help in an "i"`, g.title === "Pick a template" && g.i && /template/i.test(g.tip), g);
      await page.click("text=Rectangle"); await sleep(400);
      const g2 = await page.evaluate(() => { const t = document.getElementById("ghTitle"), i = document.querySelector("#ghHelp .info-i"); return { title: (t && t.getClientRects().length) ? t.textContent.trim() : "", i: !!(i && i.getClientRects().length), tip: (i && i.getAttribute("data-tip")) || "" }; });
      ck(`${w}x${h} simple: with a part picked the title says "Set the size" with its help in an "i"`, g2.title === "Set the size" && g2.i && /Cut this part/i.test(g2.tip), g2);
      const fits = await page.evaluate(() => { const nx = document.getElementById("next1"); const r = nx && nx.getBoundingClientRect(); return !!(r && r.width > 8 && r.bottom <= innerHeight + 0.5); });
      ck(`${w}x${h} simple: Cut this part is still on screen`, fits);
      await page.click("#btnAdvancedTools"); await sleep(500);
      await page.evaluate(() => { const b = document.querySelector('#srcShape .insp-tabs [data-insp="size"]'); if (b) b.click(); }); await sleep(250);
      const sheet = await vis(page, "#sheetSizeBox");
      ck(`${w}x${h}: pressing Advanced tools shows the Drawing sheet box on the Size tab`, !!sheet, { sheet });
    }
    ck(`${w}x${h} ${mode}: no page errors`, page.errors.length === 0, page.errors.slice(0, 3).join(" | "));
    await page.context().close();
  }
}
await br.close(); s.close && s.close();
process.exit(rec.done() ? 1 : 0);
