// r18 (Josh 23 Nov: "when i click connect it dosent let me connect … only lets me link but not controll"):
// on a laptop the "Not connected" pill opens a menu; it must always offer a way to connect, sit fully on screen
// (the header row clips), and offer Disconnect once connected. Practice table only – the Connect item is never
// clicked here, so no real serial port is opened.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("131_r18_conn_menu");
const srv = await startServer(), br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const prof of ["d1280x600", "d1366"]) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  await page.waitForFunction(() => window.plasmaTest);
  await page.evaluate(() => window.plasmaTest.showScreen("cut"));
  await sleep(600);
  const menuState = () => page.evaluate(() => {
    const m = document.getElementById("connMenu"), r = m.getBoundingClientRect();
    const items = [...m.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => b.textContent.trim());
    const bar = document.querySelector(".topbar-main");
    return { open: !m.hidden, items, top: r.top, left: r.left, bottom: r.bottom, right: r.right, w: innerWidth, h: innerHeight, barScroll: bar ? bar.scrollTop : 0 };
  });
  await page.click("#connPill");
  await sleep(300);
  let s = await menuState();
  t.check(`${prof}: "Not connected" opens a menu with Connect (USB or Bluetooth) and Practice`, s.open && s.items[0] === "Connect (USB or Bluetooth)" && s.items.includes("Practice (no machine)"), JSON.stringify(s));
  t.check(`${prof}: the menu sits fully on screen, under the pill, and the header doesn't scroll`, s.top > 0 && s.left >= 0 && s.bottom <= s.h && s.right <= s.w && s.barScroll === 0, JSON.stringify(s));
  t.check(`${prof}: STOP is still visible and not covered by the menu`, await page.evaluate(() => {
    const b = document.getElementById("btnEstop") || [...document.querySelectorAll("button")].find((x) => /^STOP$/.test(x.textContent.trim()));
    if (!b || !b.offsetParent) return false;
    const r = b.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && (el === b || b.contains(el));
  }));
  await page.click(".cm-practice");
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 8000 });
  await sleep(300);
  await page.click("#connPill");
  await sleep(300);
  s = await menuState();
  t.check(`${prof}: once connected the menu offers Disconnect (and no Connect)`, s.open && s.items.includes("Disconnect") && !s.items.some((x) => /^Connect|^Practice/.test(x)), JSON.stringify(s));
  await page.click(".cm-disconnect");
  await page.waitForFunction(() => !window.plasmaTest.S.connected, null, { timeout: 8000 });
  t.check(`${prof}: Disconnect from the menu disconnects`, true);
  t.check(`${prof}: no real serial port was touched`, await page.evaluate(() => (window.__net.serial || []).length === 0));
  await page.context().close();
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);
