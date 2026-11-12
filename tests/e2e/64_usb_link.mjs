// USB link on the cutting screen, with a pretend Web Serial FluidNC port (tests/lib/mock-serial.mjs): the Alarm banner and its
// confirmed Unlock, a jog refused in Alarm, the lost-link banner on an idle unplug and the unchanged "while running" wording,
// and that both banners fit 1366x768 and a phone on its side (844x390). Nothing real is opened.
import { startServer, launch, newPage, enterDemo, shot } from "../lib/browser.mjs";
import { installMockSerial } from "../lib/mock-serial.mjs";
import { T } from "../lib/t.mjs";
const t = new T("64_usb_link");
const srv = await startServer(), br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOT = "Connection lost while the machine was running.";

// connect the cutting screen to a pretend USB FluidNC (the account gate is for real hardware; this drives the same Machine)
async function usbConnect(page, opts) {
  return page.evaluate(async ({ src, opts }) => {
    const install = new Function(`return (${src})`)();
    install(window, opts);
    const G = await import(window.__J.usbserial), C = await import(window.__J.connection);
    const T = window.plasmaTest, M = T.getM();
    const tr = new G.WebSerialTransport(window.mockSerial);
    await tr.open(115200);
    try { await M.connect(tr); } catch (e) { return e.message; }
    T.S.demo = null; T.S.userDisconnected = false;
    C.setConnected(true, "the table");
    return "";
  }, { src: installMockSerial.toString(), opts });
}
const vis = (page, id) => page.evaluate((id) => { const e = document.getElementById(id); return !!(e && !e.classList.contains("hidden") && e.offsetParent); }, id);
const txt = (page, id) => page.evaluate((id) => document.getElementById(id).textContent.replace(/\s+/g, " ").trim(), id);
const fits = (page) => page.evaluate(() => { const ids = ["alarmBar", "lostBar", "btnStop"]; const bad = []; for (const id of ids) { const e = document.getElementById(id); if (!e || !e.offsetParent) continue; const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) bad.push(id); } return { bad, sw: document.documentElement.scrollWidth, w: innerWidth }; });

for (const prof of ["d1366", "iphone14land"]) {
  const page = await newPage(br, prof, { base: srv.base });
  const n = prof;
  await enterDemo(page);
  // 1) a silent board never shows Connected
  await page.evaluate(() => document.getElementById("btnDisconnect").click()); await sleep(600);
  const silent = await page.evaluate(async (src) => {
    const install = new Function(`return (${src})`)(); install(window, { answer: false });
    const G = await import(window.__J.usbserial); const M = window.plasmaTest.getM();
    const tr = new G.WebSerialTransport(window.mockSerial); tr.handshakeMs = 600; await tr.open(115200);
    try { await M.connect(tr); return "connected?!"; } catch (e) { return e.message; }
  }, installMockSerial.toString());
  t.check(`${n}: silent board: connect refuses with 'No reply from the controller'`, /No reply from the controller/.test(silent), silent);
  t.check(`${n}: silent board: the pill still says Not connected`, /Not connected/.test(await txt(page, "connPill")), await txt(page, "connPill"));

  // 2) FluidNC that boots in Alarm
  const err = await usbConnect(page, { answer: true, state: "Alarm" });
  await sleep(400);
  t.check(`${n}: Alarm board: connects (it answered)`, err === "" && /Connected|FluidNC/.test(await txt(page, "connPill")), err || await txt(page, "connPill"));
  t.check(`${n}: Alarm: the state badge says Alarm`, /Alarm/.test(await txt(page, "stateBadge")), await txt(page, "stateBadge"));
  t.check(`${n}: Alarm: the Alarm banner is shown`, await vis(page, "alarmBar"));
  t.check(`${n}: Alarm: the banner says what to do even without an ALARM:n line`, /won't move/.test(await txt(page, "alarmText")) && /Unlock/.test(await txt(page, "alarmText")), await txt(page, "alarmText"));
  t.check(`${n}: Alarm: $X was not sent by itself`, !(await page.evaluate(() => window.mockPort.sent)).includes("$X"));
  const jogErr = await page.evaluate(() => { try { window.plasmaTest.getM().command({ cmd: "jog", axis: "X", dist: 10 }); return ""; } catch (e) { return e.message; } });
  t.check(`${n}: Alarm: a jog is refused with a reason`, /Alarm/.test(jogErr) && /Unlock/.test(jogErr), jogErr);
  const fa = await fits(page);
  t.check(`${n}: Alarm banner fits the screen`, fa.bad.length === 0 && fa.sw <= fa.w + 1, fa);
  await shot(page, `usb-alarm-${n}`);
  page.dialogs.length = 0;
  await page.evaluate(() => document.getElementById("btnUnlock").click()); await sleep(500);
  t.check(`${n}: Unlock asks to confirm first, naming $X`, page.dialogs.some((d) => /^confirm: .*\$X/s.test(d)), page.dialogs.join(" | "));
  t.check(`${n}: after confirming, $X goes out with \\n`, (await page.evaluate(() => window.mockPort.sent)).includes("$X\n"));
  t.check(`${n}: after Unlock the Alarm banner goes away`, !(await vis(page, "alarmBar")));

  // 3) idle unplug: the lost-link banner shows, with the reason
  await page.evaluate(() => window.mockPort.unplug()); await sleep(500);
  t.check(`${n}: unplug: the pill says Not connected`, /Not connected/.test(await txt(page, "connPill")), await txt(page, "connPill"));
  t.check(`${n}: unplug: the lost-link banner shows`, await vis(page, "lostBar"));
  t.check(`${n}: unplug (idle): the banner says the link is lost and why`, /Connection to the controller lost/.test(await txt(page, "lostBar")) && /unplugged/i.test(await txt(page, "lostBar")), await txt(page, "lostBar"));
  const fl = await fits(page);
  t.check(`${n}: lost-link banner fits the screen`, fl.bad.length === 0 && fl.sw <= fl.w + 1, fl);
  await shot(page, `usb-lost-idle-${n}`);

  // 4) unplug while moving: the "while running" wording, unchanged
  const err2 = await usbConnect(page, { answer: true, state: "Idle" });
  await sleep(300);
  t.check(`${n}: reconnect hides the old lost banner`, err2 === "" && !(await vis(page, "lostBar")), err2);
  await page.evaluate(() => { window.mockPort.state = "Jog"; }); await sleep(300);
  await page.evaluate(() => window.mockPort.unplug()); await sleep(500);
  t.check(`${n}: unplug while moving: the banner says the torch may still be ON`, (await txt(page, "lostTitle")) === HOT && /torch may still be ON/.test(await txt(page, "lostText")), await txt(page, "lostBar"));
  await shot(page, `usb-lost-hot-${n}`);

  // 5) the board stops answering (no clean unplug): the watchdog drops the link
  const err3 = await usbConnect(page, { answer: true, state: "Idle" });
  await page.evaluate(() => { window.plasmaTest.getM().grbl.t.watchdogMs = 600; window.mockPort.answer = false; }); await sleep(1500);
  t.check(`${n}: watchdog: no answers -> Not connected and the lost banner`, err3 === "" && /Not connected/.test(await txt(page, "connPill")) && await vis(page, "lostBar") && /No reply from the controller/.test(await txt(page, "lostBar")), await txt(page, "lostBar"));
  const errs = page.errors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
  t.check(`${n}: no page errors`, errs.length === 0, errs.join(" | "));
  await page.context().close();
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);
